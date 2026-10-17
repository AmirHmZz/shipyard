package release

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"runtime"
	"shipyard/internal/db"
	"strconv"
	"strings"
	"time"
)

const Repository = "AmirHmZz/shipyard"
const CoreRepository = "ghcr.io/amirhmzz/shipyard"
const ExecutorRepository = "ghcr.io/amirhmzz/shipyard-executor"

var versionPattern = regexp.MustCompile(`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`)
var digestPattern = regexp.MustCompile(`^sha256:[a-f0-9]{64}$`)
var checksumPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

func ValidVersion(v string) bool { return versionPattern.MatchString(v) }
func Compare(a, b string) int {
	for i, x := range strings.Split(a, ".") {
		n, _ := strconv.Atoi(x)
		parts := strings.Split(b, ".")
		if i >= len(parts) {
			return 1
		}
		m, _ := strconv.Atoi(parts[i])
		if n < m {
			return -1
		}
		if n > m {
			return 1
		}
	}
	return 0
}

type Manifest struct {
	Format          int               `json:"format"`
	Version         string            `json:"version"`
	Commit          string            `json:"commit"`
	BuiltAt         string            `json:"builtAt"`
	Previous        string            `json:"previous"`
	CoreImage       string            `json:"coreImage"`
	ExecutorImage   string            `json:"executorImage"`
	Architectures   []string          `json:"architectures"`
	Schema          int               `json:"schema"`
	UpdaterProtocol int               `json:"updaterProtocol"`
	PostgresMajor   int               `json:"postgresMajor"`
	MinimumDocker   int               `json:"minimumDocker"`
	MinimumCompose  string            `json:"minimumCompose"`
	Migrations      []db.Migration    `json:"migrations"`
	Assets          map[string]string `json:"assets"`
	Notes           string            `json:"notes,omitempty"`
}

func (m Manifest) Validate() error {
	if m.Format != 1 || !ValidVersion(m.Version) || (m.Previous != "" && (!ValidVersion(m.Previous) || Compare(m.Previous, m.Version) >= 0)) || m.Schema < 3 || m.UpdaterProtocol != 1 || m.PostgresMajor != 18 || m.MinimumDocker < 27 || !ValidVersion(m.MinimumCompose) || Compare(m.MinimumCompose, "2.24.0") < 0 {
		return errors.New("unsupported release metadata")
	}
	for _, pair := range [][2]string{{m.CoreImage, CoreRepository}, {m.ExecutorImage, ExecutorRepository}} {
		prefix := pair[1] + "@"
		if !strings.HasPrefix(pair[0], prefix) || !digestPattern.MatchString(strings.TrimPrefix(pair[0], prefix)) {
			return errors.New("release images must be pinned to the trusted registry by digest")
		}
	}
	arch := false
	for _, a := range m.Architectures {
		if a == runtime.GOARCH {
			arch = true
		}
	}
	if !arch {
		return errors.New("release does not support this architecture")
	}
	if len(m.Migrations) != m.Schema {
		return errors.New("incomplete migration manifest")
	}
	for i, x := range m.Migrations {
		if x.Version != i+1 || !checksumPattern.MatchString(x.UpChecksum) || !checksumPattern.MatchString(x.DownChecksum) {
			return errors.New("invalid migration checksums")
		}
		for _, d := range []db.Direction{x.Up, x.Down} {
			if d.Classification != "non-destructive" && d.Classification != "destructive" && d.Classification != "unsupported" {
				return errors.New("invalid migration direction")
			}
			if d.Impact == "" {
				return errors.New("missing migration impact")
			}
		}
	}
	for _, name := range []string{"install.sh", "compose.host.yaml"} {
		if !checksumPattern.MatchString(m.Assets[name]) {
			return errors.New("missing installation asset checksum")
		}
	}
	return nil
}

type Installation struct {
	Format            int      `json:"format"`
	Revision          int      `json:"revision"`
	Directory         string   `json:"directory"`
	DaemonID          string   `json:"daemonId"`
	Project           string   `json:"project"`
	ControlContainer  string   `json:"controlContainer"`
	ExecutorContainer string   `json:"executorContainer"`
	Release           Manifest `json:"release"`
}

func (i Installation) Validate() error {
	if i.Format != 1 || i.Directory != "/opt/shipyard" || i.Project != "shipyard" || i.ControlContainer != "shipyard-shipyard-1" || i.ExecutorContainer != "shipyard-host-executor" || i.DaemonID == "" {
		return errors.New("installation is not managed by the Shipyard installer")
	}
	return i.Release.Validate()
}
func Hash(b []byte) string { h := sha256.Sum256(b); return hex.EncodeToString(h[:]) }

type Catalog struct {
	Client    *http.Client
	API       string
	Downloads string
}

func (c Catalog) client() *http.Client {
	if c.Client != nil {
		return c.Client
	}
	return &http.Client{Timeout: 30 * time.Second}
}
func (c Catalog) get(ctx context.Context, url string) ([]byte, error) {
	req, e := http.NewRequestWithContext(ctx, "GET", url, nil)
	if e != nil {
		return nil, e
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	res, e := c.client().Do(req)
	if e != nil {
		return nil, e
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return nil, fmt.Errorf("release service returned %d", res.StatusCode)
	}
	b, e := io.ReadAll(io.LimitReader(res.Body, 8<<20+1))
	if len(b) > 8<<20 {
		return nil, errors.New("release response too large")
	}
	return b, e
}
func (c Catalog) Asset(ctx context.Context, version, name string) ([]byte, error) {
	if !ValidVersion(version) || (name != "release.json" && name != "SHA256SUMS" && name != "install.sh" && name != "compose.host.yaml") {
		return nil, errors.New("invalid release asset")
	}
	base := c.Downloads
	if base == "" {
		base = "https://github.com/" + Repository + "/releases/download"
	}
	return c.get(ctx, base+"/v"+version+"/"+name)
}
func (c Catalog) Fetch(ctx context.Context, v string) (Manifest, error) {
	var m Manifest
	raw, e := c.Asset(ctx, v, "release.json")
	if e != nil {
		return m, e
	}
	sums, e := c.Asset(ctx, v, "SHA256SUMS")
	if e != nil {
		return m, e
	}
	found := false
	for _, line := range strings.Split(string(sums), "\n") {
		f := strings.Fields(line)
		if len(f) == 2 && f[1] == "release.json" && f[0] == Hash(raw) {
			found = true
		}
	}
	if !found {
		return m, errors.New("release manifest checksum mismatch")
	}
	if e = json.Unmarshal(raw, &m); e != nil {
		return m, e
	}
	if m.Version != v {
		return m, errors.New("release tag/version mismatch")
	}
	return m, m.Validate()
}
func (c Catalog) List(ctx context.Context) ([]Manifest, error) {
	base := c.API
	if base == "" {
		base = "https://api.github.com/repos/" + Repository
	}
	raw, e := c.get(ctx, base+"/releases?per_page=100")
	if e != nil {
		return nil, e
	}
	var entries []struct {
		Tag        string `json:"tag_name"`
		Draft      bool
		Prerelease bool
		Body       string
	}
	if e = json.Unmarshal(raw, &entries); e != nil {
		return nil, e
	}
	out := []Manifest{}
	for _, r := range entries {
		v := strings.TrimPrefix(r.Tag, "v")
		if r.Draft || r.Prerelease || !ValidVersion(v) {
			continue
		}
		m, e := c.Fetch(ctx, v)
		if e != nil {
			return nil, e
		}
		m.Notes = r.Body
		out = append(out, m)
	}
	sortManifests(out)
	return out, nil
}
func sortManifests(items []Manifest) {
	for i := 0; i < len(items); i++ {
		for j := i + 1; j < len(items); j++ {
			if Compare(items[j].Version, items[i].Version) > 0 {
				items[i], items[j] = items[j], items[i]
			}
		}
	}
}
