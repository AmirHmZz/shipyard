package control

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	"shipyard/internal/model"
	"shipyard/internal/remote"
)

const RuntimeLogByteLimit = 64 << 10

var ErrRuntimeContainer = errors.New("container or active release not found")

type RuntimeLogEntry struct {
	Timestamp string `json:"timestamp"`
	Message   string `json:"message"`
}

type RuntimeLogSnapshot struct {
	Container  string            `json:"container"`
	Containers []string          `json:"containers"`
	CapturedAt time.Time         `json:"capturedAt"`
	Truncated  bool              `json:"truncated"`
	Entries    []RuntimeLogEntry `json:"entries"`
}

func (c *Controller) RuntimeLogs(ctx context.Context, app, container string, tail int) (RuntimeLogSnapshot, error) {
	release, err := c.Store.Active(ctx, app)
	if err != nil {
		return RuntimeLogSnapshot{}, err
	}
	if release.App.IsJob() || len(release.Containers) == 0 {
		return RuntimeLogSnapshot{}, ErrRuntimeContainer
	}
	if container == "" {
		container = release.Containers[0]
	}
	if !ContainerAllowed(release, container) {
		return RuntimeLogSnapshot{}, ErrRuntimeContainer
	}
	node, _, err := c.connect(ctx, release.ServerID)
	if err != nil {
		return RuntimeLogSnapshot{}, err
	}
	defer node.Close()
	return captureRuntimeLogs(ctx, node, release, container, tail)
}

type runtimeLogBuffer struct {
	bytes.Buffer
	truncated bool
}

func (b *runtimeLogBuffer) Write(p []byte) (int, error) {
	size := len(p)
	if remaining := RuntimeLogByteLimit - b.Len(); size > remaining {
		b.truncated = true
		p = p[:remaining]
	}
	_, _ = b.Buffer.Write(p)
	return size, nil
}

func captureRuntimeLogs(ctx context.Context, node remote.Executor, release model.Release, container string, tail int) (RuntimeLogSnapshot, error) {
	result := RuntimeLogSnapshot{Container: container, Containers: release.Containers, Entries: []RuntimeLogEntry{}}
	var raw runtimeLogBuffer
	if err := node.Run(ctx, remote.Command("docker", "logs", "--timestamps", "--tail", strconv.Itoa(tail), "--", container), nil, &raw); err != nil {
		return result, err
	}
	result.CapturedAt = time.Now().UTC()
	result.Truncated = raw.truncated
	data := raw.Bytes()
	if raw.truncated {
		// An incomplete line can contain only a prefix of a secret.
		data = data[:bytes.LastIndexByte(data, '\n')+1]
	}
	secretSet := map[string]bool{}
	for _, values := range []map[string]string{release.Env, release.BuildSecrets} {
		for _, value := range values {
			for _, part := range strings.Split(value, "\n") {
				if part != "" {
					secretSet[part] = true
				}
			}
		}
	}
	secrets := make([]string, 0, len(secretSet))
	for secret := range secretSet {
		secrets = append(secrets, secret)
	}
	slices.SortFunc(secrets, func(a, b string) int { return len(b) - len(a) })
	replacements := make([]string, 0, 2*len(secrets))
	for _, secret := range secrets {
		replacements = append(replacements, secret, "[REDACTED]")
	}
	redactor := strings.NewReplacer(replacements...)
	remaining := RuntimeLogByteLimit
	for line := range strings.SplitSeq(string(data), "\n") {
		if line == "" {
			continue
		}
		stamp, message, ok := strings.Cut(line, " ")
		if _, err := time.Parse(time.RFC3339Nano, stamp); err != nil || !ok {
			// Docker diagnostics and unframed fragments are not container output.
			continue
		}
		message = strings.ToValidUTF8(redactor.Replace(message), "�")
		if len(result.Entries) >= tail || len(message)+len(stamp) > remaining {
			result.Truncated = true
			break
		}
		result.Entries = append(result.Entries, RuntimeLogEntry{Timestamp: stamp, Message: message})
		remaining -= len(message) + len(stamp)
	}
	if err := ctx.Err(); err != nil {
		return RuntimeLogSnapshot{}, fmt.Errorf("snapshot runtime logs: %w", err)
	}
	return result, nil
}
