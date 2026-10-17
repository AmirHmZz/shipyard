package control

import (
	"context"
	"encoding/json"
	"errors"
	"time"
)

type AlertPolicy struct {
	CPU              float64 `json:"cpu"`
	Memory           float64 `json:"memory"`
	Disk             float64 `json:"disk"`
	SustainedSeconds int     `json:"sustainedSeconds"`
	OfflineSeconds   int     `json:"offlineSeconds"`
}

func (p AlertPolicy) Validate() error {
	for _, threshold := range []float64{p.CPU, p.Memory, p.Disk} {
		if threshold < 1 || threshold > 100 {
			return errors.New("resource thresholds must be 1–100 percent")
		}
	}
	if p.SustainedSeconds < 30 || p.SustainedSeconds > 86400 || p.OfflineSeconds < 30 || p.OfflineSeconds > 86400 {
		return errors.New("alert durations must be 30–86400 seconds")
	}
	return nil
}

func (c *Controller) AlertPolicy(ctx context.Context) AlertPolicy {
	p := AlertPolicy{CPU: 90, Memory: 90, Disk: 90, SustainedSeconds: 300, OfflineSeconds: 60}
	var b []byte
	if c.Store.Pool.QueryRow(ctx, "SELECT value FROM settings WHERE key='alert-policy'").Scan(&b) == nil {
		_ = json.Unmarshal(b, &p)
	}
	return p
}

func (c *Controller) SetAlertPolicy(ctx context.Context, p AlertPolicy) error {
	if err := p.Validate(); err != nil {
		return err
	}
	b, err := json.Marshal(p)
	if err != nil {
		return err
	}
	_, err = c.Store.Pool.Exec(ctx, "INSERT INTO settings(key,value) VALUES('alert-policy',$1) ON CONFLICT(key) DO UPDATE SET value=$1", b)
	return err
}

func (p AlertPolicy) sustained() time.Duration {
	return time.Duration(p.SustainedSeconds) * time.Second
}
