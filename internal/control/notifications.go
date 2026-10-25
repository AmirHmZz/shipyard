package control

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"shipyard/internal/model"
	"shipyard/internal/outbound"
	"shipyard/internal/providers"
)

func (c *Controller) notify(ctx context.Context, j model.Job) error {
	var payload map[string]any
	if err := json.Unmarshal(j.Payload, &payload); err != nil {
		return err
	}
	if payload["marker"] == true {
		return nil
	}
	id, _ := payload["hookId"].(string)
	hook, err := c.Store.Resource(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	} // Deleted destinations cancel queued delivery.
	if err != nil {
		return err
	}
	spec, err := model.Decode[model.Webhook](hook)
	if err != nil {
		return err
	}
	secrets, err := c.Store.Secrets(hook)
	if err != nil {
		return err
	}
	client, err := outbound.Client(ctx, c.Store, spec.ProxyID)
	if err != nil {
		return err
	}
	defer client.CloseIdleConnections()
	delete(payload, "hookId")
	return providers.SendNotification(ctx, client, spec, secrets, payload)
}

func (c *Controller) QueueTestNotification(ctx context.Context, hook model.Resource) (string, error) {
	id := uuid.NewString()
	payload := map[string]any{"id": id, "event": "notification.test", "resourceId": hook.ID, "teamId": hook.TeamID, "at": time.Now(), "data": map[string]string{"message": "Shipyard test notification"}, "hookId": hook.ID}
	err := c.Store.Enqueue(ctx, "notify", hook.ID, "notification:"+id, payload)
	return id, err
}
