package deploy

import (
	"io"
	"regexp"
	"strings"
	"sync"
)

var lifecycleProgress = regexp.MustCompile(`^\s*(Volume|Network|Container|Image)\s+(\S+)\s+(Creating|Created|Starting|Started|Stopping|Stopped|Removing|Removed|Recreating|Recreated|Running|Pulling|Pulled)\s*$`)

// Compose can report a resource state more than once. Only normalize lifecycle
// progress within this command; repeated diagnostics and build output are data.
type composeProgress struct {
	mu      sync.Mutex
	output  io.Writer
	pending string
	states  map[string]string
}

func (p *composeProgress) emit(line string) {
	if match := lifecycleProgress.FindStringSubmatch(strings.TrimSuffix(line, "\r")); match != nil {
		key := match[1] + " " + match[2]
		if p.states[key] == match[3] {
			return
		}
		p.states[key] = match[3]
	}
	_, _ = io.WriteString(p.output, line+"\n")
}
func (p *composeProgress) Write(b []byte) (int, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.pending += string(b)
	for {
		i := strings.IndexByte(p.pending, '\n')
		if i < 0 {
			break
		}
		p.emit(p.pending[:i])
		p.pending = p.pending[i+1:]
	}
	if len(p.pending) > 32768 {
		_, _ = io.WriteString(p.output, p.pending)
		p.pending = ""
	}
	return len(b), nil
}
func (p *composeProgress) Flush() {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.pending != "" {
		_, _ = io.WriteString(p.output, p.pending)
		p.pending = ""
	}
}
