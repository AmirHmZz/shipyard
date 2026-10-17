package proxy

import (
	"context"
	"errors"
	"io"
	"strings"

	"shipyard/internal/deploy"
	"shipyard/internal/remote"
)

func runtimeImage(ctx context.Context, r remote.Executor, log io.Writer) (string, bool, error) {
	image, err := deploy.Output(ctx, r, "sh", "-c", "docker inspect -f '{{.Image}}' shipyard-haproxy 2>/dev/null || true")
	if err != nil {
		return "", false, err
	}
	image = strings.TrimSpace(image)
	exists := image != ""
	if !exists {
		image, err = deploy.Output(ctx, r, "sh", "-c", remote.Command("docker", "image", "inspect", "-f", "{{.Id}}", Image)+" 2>/dev/null || true")
		if err != nil {
			return "", false, err
		}
		if strings.TrimSpace(image) == "" {
			if err = r.Run(ctx, remote.Command("docker", "pull", Image), nil, log); err != nil {
				return "", false, err
			}
			image, err = deploy.Output(ctx, r, "docker", "image", "inspect", "-f", "{{.Id}}", Image)
			if err != nil {
				return "", false, err
			}
		}
		image = strings.TrimSpace(image)
	}
	if !strings.HasPrefix(image, "sha256:") {
		return "", exists, errors.New("could not resolve the HAProxy image ID")
	}
	version, err := deploy.Output(ctx, r, "docker", "run", "--rm", image, "haproxy", "-v")
	if err != nil {
		return "", exists, err
	}
	if !strings.Contains(version, "HAProxy version 3.4.") {
		return "", exists, errors.New("HAProxy 3.4 is required; recreate this testing server's managed HAProxy container using haproxy:3.4-alpine")
	}
	return image, exists, nil
}

// A pending marker survives SSH/control-plane interruptions. Recover the last
// working generation before another update can overwrite its backup.
func recoverPending(ctx context.Context, r remote.Executor) error {
	root := remote.Root + "/proxy"
	pending, err := deploy.Output(ctx, r, "sh", "-c", "test ! -f "+remote.Quote(root+"/pending")+" || echo pending")
	if err != nil || strings.TrimSpace(pending) == "" {
		return err
	}
	script := `set -eu
cd /var/lib/shipyard/proxy
if [ -f previous.cfg ]; then
  cp previous.cfg haproxy.cfg
  rm -rf certs
  if [ -d previous-certs ]; then cp -a previous-certs certs; else mkdir certs; fi
  rm -rf maps
  if [ -d previous-maps ]; then cp -a previous-maps maps; else mkdir maps; fi
  if [ "$(docker inspect -f '{{.State.Running}}' shipyard-haproxy 2>/dev/null || true)" = true ]; then
    docker kill --signal USR2 shipyard-haproxy >/dev/null
  else
    docker start shipyard-haproxy >/dev/null
  fi
  awk '$1 == "setenv" && $2 == "SHIPYARD_GENERATION" { print $3; exit }' previous.cfg
else
  if [ "$(cat pending)" = new ]; then docker rm -f shipyard-haproxy >/dev/null 2>&1 || true; fi
  rm -f haproxy.cfg
  rm -rf certs
  rm -rf maps
fi`
	generation, err := deploy.Output(ctx, r, "sh", "-c", script)
	if err != nil {
		return err
	}
	if strings.TrimSpace(generation) != "" {
		if err = awaitGeneration(ctx, r, strings.TrimSpace(generation)); err != nil {
			return err
		}
	}
	return r.Run(ctx, remote.Command("rm", "-f", root+"/pending"), nil, io.Discard)
}
