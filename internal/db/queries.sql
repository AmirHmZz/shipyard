-- name: Heartbeat :execrows
UPDATE jobs SET lease_until=now()+interval '90 seconds' WHERE id=$1 AND worker=$2 AND state='running';

-- name: SeenDelivery :execrows
INSERT INTO webhook_deliveries(provider_id,delivery_id) VALUES($1,$2) ON CONFLICT DO NOTHING;

-- name: ResourceGranted :one
SELECT EXISTS(SELECT 1 FROM resource_grants WHERE resource_id=$1 AND team_id=$2);
