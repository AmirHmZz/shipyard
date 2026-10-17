package release

import (
	"fmt"
	"strconv"
	"strings"
)

func CheckRuntime(engine, compose string, postgresMajor int, m Manifest) error {
	major, e := strconv.Atoi(strings.Split(engine, ".")[0])
	if e != nil || major < m.MinimumDocker {
		return fmt.Errorf("Docker %d or newer is required", m.MinimumDocker)
	}
	compose = strings.TrimPrefix(strings.TrimSpace(compose), "v")
	compose = strings.Split(compose, "-")[0]
	if !ValidVersion(compose) || Compare(compose, m.MinimumCompose) < 0 {
		return fmt.Errorf("Docker Compose %s or newer is required", m.MinimumCompose)
	}
	if postgresMajor != m.PostgresMajor {
		return fmt.Errorf("PostgreSQL %d is required; major upgrades are installation operations", m.PostgresMajor)
	}
	return nil
}
