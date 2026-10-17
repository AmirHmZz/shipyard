package control

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/google/uuid"
	"io"
	"os"
	"shipyard/internal/deploy"
	"shipyard/internal/gitauth"
	"shipyard/internal/model"
	"shipyard/internal/providers"
	"shipyard/internal/remote"
	"sort"
	"strings"
)

type ServiceInfo struct {
	Name         string `json:"name"`
	Replicas     int    `json:"replicas"`
	IgnoredPorts bool   `json:"ignoredPorts"`
}

func (c *Controller) Services(ctx context.Context, app model.Resource) ([]ServiceInfo, error) {
	a, e := model.Decode[model.App](app)
	if e != nil {
		return nil, e
	}
	if a.Engine == "dockerfile" {
		return []ServiceInfo{{Name: "app", Replicas: 1}}, nil
	}
	client, _, e := c.connect(ctx, a.ServerID)
	if e != nil {
		return nil, e
	}
	defer client.Close()
	dir := remote.Root + "/inspect/" + app.ID + "/" + uuid.NewString()
	defer deploy.Output(context.WithoutCancel(ctx), client, "rm", "-rf", dir)
	r := model.Release{ID: uuid.NewString(), AppID: app.ID, App: a, Directory: dir}
	engine := deploy.Engine{Remote: client, Log: io.Discard}
	env := map[string]string{}
	chain := []model.Resource{app}
	parent := app
	for i := 0; i < 8 && parent.ParentID != ""; i++ {
		parent, e = c.Store.Resource(ctx, parent.ParentID)
		if e != nil {
			return nil, e
		}
		chain = append(chain, parent)
	}
	for i := len(chain) - 1; i >= 0; i-- {
		secrets, err := c.Store.Secrets(chain[i])
		if err != nil {
			return nil, err
		}
		for k, v := range secrets {
			if strings.HasPrefix(k, "env:") {
				env[strings.TrimPrefix(k, "env:")] = v
			}
		}
	}
	if a.Source == "compose" {
		secrets, e := c.Store.Secrets(app)
		if e != nil {
			return nil, e
		}
		if e = engine.TransferCompose(ctx, &r, secrets["compose"]); e != nil {
			return nil, e
		}
	} else {
		gitResource, e := c.Store.Resource(ctx, a.GitID)
		if e != nil {
			return nil, e
		}
		spec, e := model.Decode[model.Git](gitResource)
		if e != nil {
			return nil, e
		}
		secrets, e := c.Store.Secrets(gitResource)
		if e != nil {
			return nil, e
		}
		git, e := gitauth.New(c.Store, "").Client(ctx, gitResource)
		if e != nil {
			return nil, e
		}
		var provider providers.GitProvider = git
		if c.GitFactory != nil {
			provider = c.GitFactory(spec, secrets)
		}
		workspace, e := os.MkdirTemp(c.DataDir, "inspect-")
		if e != nil {
			return nil, e
		}
		defer os.RemoveAll(workspace)
		if _, e = provider.Checkout(ctx, a.Repository, a.Branch, workspace); e != nil {
			return nil, errors.New("could not fetch application source")
		}
		if e = engine.Transfer(ctx, r, func(w io.Writer) error { return providers.Archive(ctx, workspace, w) }); e != nil {
			return nil, e
		}
	}
	lines := []string{}
	for k, v := range env {
		lines = append(lines, k+"='"+strings.ReplaceAll(v, "'", "\\'")+"'")
	}
	sort.Strings(lines)
	if e = deploy.Write(ctx, client, dir+"/inspect.env", []byte(strings.Join(lines, "\n")+"\n")); e != nil {
		return nil, e
	}
	args := []string{"docker", "compose", "--project-directory", dir + "/source/" + a.Context, "--env-file", dir + "/inspect.env", "-f", dir + "/source/" + a.File}
	for _, profile := range a.Profiles {
		args = append(args, "--profile", profile)
	}
	args = append(args, "config", "--format", "json")
	output, e := deploy.Output(ctx, client, args...)
	if e != nil {
		return nil, errors.New("could not resolve Compose services; check the source, profiles and variables")
	}
	var config struct {
		Services map[string]struct {
			Ports    []any    `json:"ports"`
			Profiles []string `json:"profiles"`
			Scale    int      `json:"scale"`
			Deploy   struct {
				Replicas *int `json:"replicas"`
			} `json:"deploy"`
		} `json:"services"`
	}
	if e = json.Unmarshal([]byte(output), &config); e != nil {
		return nil, errors.New("invalid rendered Compose configuration")
	}
	out := []ServiceInfo{}
	for name, s := range config.Services {
		enabled := len(s.Profiles) == 0
		for _, p := range s.Profiles {
			for _, selected := range a.Profiles {
				if p == selected || selected == "*" {
					enabled = true
				}
			}
		}
		if !enabled {
			continue
		}
		count := 1
		if s.Scale > 0 {
			count = s.Scale
		}
		if s.Deploy.Replicas != nil {
			count = *s.Deploy.Replicas
		}
		out = append(out, ServiceInfo{Name: name, Replicas: count, IgnoredPorts: len(s.Ports) > 0})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}
func (c *Controller) ValidateNetworkSettings(ctx context.Context, app model.Resource, a model.App) error {
	for _, service := range a.Networking {
		for _, connection := range service.Connections {
			r, e := c.Store.Resource(ctx, connection.NetworkID)
			if e != nil {
				return e
			}
			n, e := model.Decode[model.Network](r)
			if e != nil {
				return e
			}
			if r.Kind != "network" || n.ServerID != a.ServerID || n.IngressApp != "" || n.Status != "ready" || !c.Store.TeamGranted(ctx, app.TeamID, r.ID) {
				return fmt.Errorf("select a ready network granted to this team on the target server")
			}
		}
	}
	return nil
}
