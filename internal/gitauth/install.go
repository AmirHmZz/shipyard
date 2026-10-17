package gitauth

import (
	"context"
	"errors"
	"net/url"
	"regexp"

	"shipyard/internal/model"
)

func (s *Service) ResumeGitHub(ctx context.Context, user, session string, r model.Resource) (Start, error) {
	if !model.HTTPS(s.Origin) {
		return Start{}, errors.New("configure an HTTPS SHIPYARD_ORIGIN before guided setup")
	}
	spec, err := model.Decode[model.Git](r)
	if err != nil || spec.Provider != "github" || !regexp.MustCompile(`^[a-zA-Z0-9-]+$`).MatchString(spec.AppSlug) {
		return Start{}, errors.New("this connection needs manual configuration or a new GitHub setup")
	}
	state, err := s.putFlow(ctx, Flow{User: user, Session: session, Kind: "github-install", Connection: r.ID})
	if err != nil {
		return Start{}, err
	}
	return Start{ConnectionID: r.ID, URL: s.GitHubWeb + "/apps/" + spec.AppSlug + "/installations/new?state=" + url.QueryEscape(state)}, nil
}
