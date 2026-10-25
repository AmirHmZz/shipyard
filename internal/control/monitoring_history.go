package control

import (
	"context"
	"encoding/json"
	"time"
)

func DecodeMetric(raw []byte) (Metric, error) {
	var m Metric
	if err := json.Unmarshal(raw, &m); err != nil {
		return m, err
	}
	var flags struct {
		Valid    *bool `json:"valid"`
		CPUValid *bool `json:"cpuValid"`
	}
	if err := json.Unmarshal(raw, &flags); err != nil {
		return m, err
	}
	if flags.Valid == nil {
		m.Valid = m.Online
	}
	if flags.CPUValid == nil {
		m.CPUValid = m.Online
	}
	if m.Containers == nil {
		m.Containers = []ContainerMetric{}
	}
	if m.Network == nil {
		m.Network = []IORate{}
	}
	if m.Devices == nil {
		m.Devices = []IORate{}
	}
	return m, nil
}

// Aggregate inside PostgreSQL: long ranges never transfer raw container history.
const monitoringBucketSQL = `WITH points AS (
 SELECT date_bin($3::interval,created_at,'2000-01-01'::timestamptz) bucket,data FROM metrics WHERE resource_id=$1 AND created_at>=$2
), io AS (
 SELECT bucket,field,entry->>'name' name,avg((entry->>'read')::double precision) r,avg((entry->>'write')::double precision) w
 FROM points CROSS JOIN (VALUES('network'),('devices')) fields(field)
 CROSS JOIN LATERAL jsonb_array_elements(COALESCE(NULLIF(data->field,'null'::jsonb),'[]')) entry GROUP BY bucket,field,entry->>'name'
), arrays AS (
 SELECT bucket,field,jsonb_agg(jsonb_build_object('name',name,'read',r,'write',w) ORDER BY name) value FROM io GROUP BY bucket,field
)
SELECT jsonb_build_object('resourceId',$1::text,'at',bucket,'online',bool_or((data->>'online')::boolean),
 'cpu',COALESCE(avg((data->>'cpu')::double precision) FILTER(WHERE COALESCE((data->>'cpuValid')::boolean,(data->>'online')::boolean)),0),
 'cpuValid',bool_or(COALESCE((data->>'cpuValid')::boolean,(data->>'online')::boolean)),
 'memory',COALESCE(avg((data->>'memory')::double precision) FILTER(WHERE COALESCE((data->>'valid')::boolean,(data->>'online')::boolean)),0),
 'disk',COALESCE(avg((data->>'disk')::double precision) FILTER(WHERE COALESCE((data->>'valid')::boolean,(data->>'online')::boolean)),0),
 'valid',bool_or(COALESCE((data->>'valid')::boolean,(data->>'online')::boolean)),
 'memoryBytes',COALESCE(avg((data->>'memoryBytes')::numeric)::bigint,0),'memoryTotalBytes',COALESCE(max((data->>'memoryTotalBytes')::numeric)::bigint,0),
 'peakCpu',max((data->>'cpu')::double precision) FILTER(WHERE COALESCE((data->>'cpuValid')::boolean,(data->>'online')::boolean)),
 'peakMemory',max((data->>'memory')::double precision) FILTER(WHERE COALESCE((data->>'valid')::boolean,(data->>'online')::boolean)),
 'peakDisk',max((data->>'disk')::double precision) FILTER(WHERE COALESCE((data->>'valid')::boolean,(data->>'online')::boolean)),
 'availability',avg(CASE WHEN (data->>'online')::boolean THEN 100 ELSE 0 END),'samples',count(*),'containers','[]'::jsonb,
 'network',COALESCE((SELECT value FROM arrays a WHERE a.bucket=p.bucket AND a.field='network'),'[]'),
 'devices',COALESCE((SELECT value FROM arrays a WHERE a.bucket=p.bucket AND a.field='devices'),'[]'),
 'networkRx',avg((data->>'networkRx')::double precision),'networkTx',avg((data->>'networkTx')::double precision),
 'diskRead',avg((data->>'diskRead')::double precision),'diskWrite',avg((data->>'diskWrite')::double precision))
FROM points p GROUP BY bucket ORDER BY bucket`

func (c *Controller) MetricHistory(ctx context.Context, id, value string) ([]Metric, error) {
	duration, bucket, err := validateMetricRange(value)
	if err != nil {
		return nil, err
	}
	out := []Metric{}
	sql := "SELECT data FROM (SELECT data,created_at FROM metrics WHERE resource_id=$1 AND created_at>=$2 ORDER BY created_at DESC LIMIT 2880) p ORDER BY created_at"
	args := []any{id, time.Now().Add(-duration)}
	if bucket > 0 {
		sql = monitoringBucketSQL
		args = append(args, bucket.String())
	}
	rows, err := c.Store.Pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var raw []byte
		if err = rows.Scan(&raw); err != nil {
			rows.Close()
			return nil, err
		}
		point, decodeErr := DecodeMetric(raw)
		if decodeErr != nil {
			rows.Close()
			return nil, decodeErr
		}
		out = append(out, point)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	if bucket > 0 && len(out) > 0 {
		var raw []byte
		if err = c.Store.Pool.QueryRow(ctx, "SELECT data FROM metrics WHERE resource_id=$1 ORDER BY created_at DESC LIMIT 1", id).Scan(&raw); err != nil {
			return nil, err
		}
		latest, decodeErr := DecodeMetric(raw)
		if decodeErr != nil {
			return nil, decodeErr
		}
		out[len(out)-1].Containers = latest.Containers
	}
	return out, nil
}
