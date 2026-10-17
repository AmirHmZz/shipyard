package deploy

import (
	"archive/tar"
	"context"
	"crypto/sha256"
	"fmt"
	"io"
	"shipyard/internal/model"
)

func (e *Engine) TransferCompose(ctx context.Context, r *model.Release, source string) error {
	if err := model.ValidateComposeSource(source); err != nil {
		return err
	}
	r.App.Engine = "compose"
	r.App.Context = "."
	r.App.File = "compose.yaml"
	sum := sha256.Sum256([]byte(source))
	r.Commit = fmt.Sprintf("compose:%x", sum[:6])
	return e.Transfer(ctx, *r, func(w io.Writer) error {
		archive := tar.NewWriter(w)
		if err := archive.WriteHeader(&tar.Header{Name: "compose.yaml", Mode: 0600, Size: int64(len(source))}); err != nil {
			return err
		}
		if _, err := io.WriteString(archive, source); err != nil {
			return err
		}
		return archive.Close()
	})
}
