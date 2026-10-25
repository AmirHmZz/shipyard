package control

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"shipyard/internal/remote"
)

type IORate struct {
	Name  string   `json:"name"`
	Read  *float64 `json:"read"`
	Write *float64 `json:"write"`
}
type ioCounter struct {
	Read  uint64 `json:"read"`
	Write uint64 `json:"write"`
}
type containerCounter struct {
	CPU              uint64    `json:"cpu"`
	Network          ioCounter `json:"network"`
	Disk             ioCounter `json:"disk"`
	NetworkAvailable bool      `json:"networkAvailable"`
	DiskAvailable    bool      `json:"diskAvailable"`
}
type counterSnapshot struct {
	At         time.Time                   `json:"at"`
	Boot       string                      `json:"boot"`
	Used       uint64                      `json:"used"`
	Total      uint64                      `json:"total"`
	Network    map[string]ioCounter        `json:"network"`
	Disk       map[string]ioCounter        `json:"disk"`
	Containers map[string]containerCounter `json:"containers"`
}

func rate(current, previous uint64, seconds float64) *float64 {
	if seconds <= 0 || seconds > 90 || current < previous {
		return nil
	}
	v := float64(current-previous) / seconds
	return &v
}
func readHostCounters(text string, at time.Time) (Metric, counterSnapshot) {
	m := Metric{At: at, Containers: []ContainerMetric{}, Network: []IORate{}, Devices: []IORate{}}
	s := counterSnapshot{At: at, Network: map[string]ioCounter{}, Disk: map[string]ioCounter{}, Containers: map[string]containerCounter{}}
	for _, line := range strings.Split(text, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		number := func(i int) uint64 {
			if i >= len(fields) {
				return 0
			}
			v, _ := strconv.ParseUint(fields[i], 10, 64)
			return v
		}
		switch fields[0] {
		case "BOOT":
			s.Boot = fields[1]
		case "CPU":
			s.Used = number(1)
			s.Total = number(2)
		case "MEM":
			m.MemoryBytes = number(1)
			m.MemoryTotalBytes = number(2)
			if m.MemoryTotalBytes > 0 {
				m.Memory = 100 * float64(m.MemoryBytes) / float64(m.MemoryTotalBytes)
				m.Valid = true
			}
		case "DISK":
			m.Disk = percent(fields[1])
		case "NET":
			if len(fields) >= 4 && fields[1] != "lo" {
				s.Network[fields[1]] = ioCounter{number(2), number(3)}
			}
		case "IO":
			if len(fields) >= 4 {
				s.Disk[fields[1]] = ioCounter{number(2), number(3)}
			}
		}
	}
	return m, s
}
func applyHostRates(m *Metric, current, previous counterSnapshot) {
	seconds := current.At.Sub(previous.At).Seconds()
	if current.Boot == "" || current.Boot != previous.Boot {
		seconds = 0
	}
	if seconds > 0 && seconds <= 90 && current.Total > previous.Total && previous.Total > 0 && current.Used >= previous.Used {
		m.CPU = 100 * float64(current.Used-previous.Used) / float64(current.Total-previous.Total)
		m.CPUValid = true
	}
	for _, entry := range []struct {
		current, previous map[string]ioCounter
		target            *[]IORate
	}{{current.Network, previous.Network, &m.Network}, {current.Disk, previous.Disk, &m.Devices}} {
		names := []string{}
		for name := range entry.current {
			names = append(names, name)
		}
		sort.Strings(names)
		for _, name := range names {
			now := entry.current[name]
			point := IORate{Name: name}
			if before, ok := entry.previous[name]; ok {
				point.Read = rate(now.Read, before.Read, seconds)
				point.Write = rate(now.Write, before.Write, seconds)
			}
			*entry.target = append(*entry.target, point)
		}
	}
}

const hostMetricScript = `set -eu
printf 'BOOT '; cat /proc/sys/kernel/random/boot_id
awk '/^cpu /{print "CPU",$2+$3+$4+$7+$8+$9,$2+$3+$4+$5+$6+$7+$8+$9}' /proc/stat
awk '/MemTotal/{total=$2} /MemAvailable/{avail=$2} END{printf "MEM %.0f %.0f\n",(total-avail)*1024,total*1024}' /proc/meminfo
df -P /var/lib/docker | awk 'NR==2{print "DISK",$5}'
awk 'NR>2{gsub(":"," ");print "NET",$1,$2,$10}' /proc/net/dev
for disk in /sys/block/*; do
 name=${disk##*/}
 case "$name" in loop*|ram*|zram*) continue;; esac
 awk -v name="$name" '$3==name{printf "IO %s %.0f %.0f\n",$3,$6*512,$10*512}' /proc/diskstats
done
`

type dockerMetricContainer struct {
	ID         string `json:"Id"`
	Names      []string
	State      string
	HostConfig struct{ NetworkMode string }
}
type dockerMetricStats struct {
	CPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
	} `json:"cpu_stats"`
	MemoryStats struct {
		Usage uint64
		Stats map[string]uint64
	} `json:"memory_stats"`
	Networks map[string]struct {
		RxBytes uint64 `json:"rx_bytes"`
		TxBytes uint64 `json:"tx_bytes"`
	}
	BlkioStats struct {
		IOServiceBytesRecursive []struct {
			Op    string
			Value uint64
		} `json:"io_service_bytes_recursive"`
	} `json:"blkio_stats"`
}

func dockerMetricRequest(ctx context.Context, client *http.Client, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://docker"+path, nil)
	if err != nil {
		return err
	}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return errors.New("Docker metrics unavailable")
	}
	return json.NewDecoder(io.LimitReader(res.Body, 16<<20)).Decode(out)
}
func (c *Controller) collectMetrics(ctx context.Context, id string) (Metric, remote.Node) {
	at := time.Now().UTC()
	m := Metric{ResourceID: id, At: at, Status: "offline", Containers: []ContainerMetric{}, Network: []IORate{}, Devices: []IORate{}}
	node, _, err := c.connect(ctx, id)
	if err != nil {
		return m, nil
	}
	m.Online = true
	m.Status = "degraded"
	script := hostMetricScript
	if id == LocalServerID {
		script = strings.ReplaceAll(script, "/var/lib/docker", "/host/docker-root")
	}
	output, err := remote.Output(ctx, node, "sh", "-c", script)
	var current counterSnapshot
	if err == nil {
		m, current = readHostCounters(output, at)
		m.ResourceID = id
		m.Online = true
		m.Status = "online"
	} else {
		current = counterSnapshot{At: at, Containers: map[string]containerCounter{}}
	}
	var previous counterSnapshot
	var raw []byte
	if c.Store.Pool.QueryRow(ctx, "SELECT data FROM monitoring_counters WHERE resource_id=$1", id).Scan(&raw) == nil {
		_ = json.Unmarshal(raw, &previous)
	}
	applyHostRates(&m, current, previous)
	transport := &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
		return node.DialContext(ctx, "unix", "/var/run/docker.sock")
	}}
	client := &http.Client{Transport: transport, Timeout: 20 * time.Second}
	defer client.CloseIdleConnections()
	var containers []dockerMetricContainer
	if dockerMetricRequest(ctx, client, "/containers/json", &containers) != nil {
		m.Status = "degraded"
	} else {
		// Bound simultaneous stats calls: remote hosts may run hundreds of containers.
		var wg sync.WaitGroup
		var mu sync.Mutex
		slots := make(chan struct{}, 6)
		for _, container := range containers {
			if container.State != "running" {
				continue
			}
			container := container
			slots <- struct{}{}
			wg.Add(1)
			go func() {
				defer wg.Done()
				defer func() { <-slots }()
				var stats dockerMetricStats
				if dockerMetricRequest(ctx, client, "/containers/"+container.ID+"/stats?stream=false&one-shot=true", &stats) != nil {
					mu.Lock()
					m.Status = "degraded"
					mu.Unlock()
					return
				}
				counters := containerCounter{CPU: stats.CPUStats.CPUUsage.TotalUsage, NetworkAvailable: len(stats.Networks) > 0, DiskAvailable: len(stats.BlkioStats.IOServiceBytesRecursive) > 0}
				for _, net := range stats.Networks {
					counters.Network.Read += net.RxBytes
					counters.Network.Write += net.TxBytes
				}
				for _, io := range stats.BlkioStats.IOServiceBytesRecursive {
					if strings.EqualFold(io.Op, "read") {
						counters.Disk.Read += io.Value
					}
					if strings.EqualFold(io.Op, "write") {
						counters.Disk.Write += io.Value
					}
				}
				usage := stats.MemoryStats.Usage
				cache := stats.MemoryStats.Stats["total_inactive_file"]
				if value, ok := stats.MemoryStats.Stats["inactive_file"]; ok {
					cache = value
				}
				if cache <= usage {
					usage -= cache
				}
				point := ContainerMetric{ID: container.ID, MemoryBytes: usage, Valid: stats.MemoryStats.Stats != nil}
				if len(container.Names) > 0 {
					point.Name = strings.TrimPrefix(container.Names[0], "/")
				}
				if m.MemoryTotalBytes > 0 {
					point.Memory = 100 * float64(usage) / float64(m.MemoryTotalBytes)
				}
				seconds := current.At.Sub(previous.At).Seconds()
				if current.Boot == "" || current.Boot != previous.Boot {
					seconds = 0
				}
				if before, ok := previous.Containers[container.ID]; ok {
					if cpu := rate(counters.CPU, before.CPU, seconds); cpu != nil {
						point.CPU = *cpu / 1e9 * 100
						point.CPUValid = true
					}
					if counters.DiskAvailable && before.DiskAvailable {
						point.DiskRead = rate(counters.Disk.Read, before.Disk.Read, seconds)
						point.DiskWrite = rate(counters.Disk.Write, before.Disk.Write, seconds)
					}
					if counters.NetworkAvailable && before.NetworkAvailable && container.HostConfig.NetworkMode != "host" && !strings.HasPrefix(container.HostConfig.NetworkMode, "container:") {
						point.NetworkRx = rate(counters.Network.Read, before.Network.Read, seconds)
						point.NetworkTx = rate(counters.Network.Write, before.Network.Write, seconds)
					}
				}
				mu.Lock()
				m.Containers = append(m.Containers, point)
				current.Containers[container.ID] = counters
				mu.Unlock()
			}()
		}
		wg.Wait()
	}
	sort.Slice(m.Containers, func(i, j int) bool { return m.Containers[i].ID < m.Containers[j].ID })
	raw, _ = json.Marshal(current)
	if _, err = c.Store.Pool.Exec(ctx, "INSERT INTO monitoring_counters(resource_id,data) VALUES($1,$2) ON CONFLICT(resource_id) DO UPDATE SET data=excluded.data", id, raw); err != nil {
		m.Valid = false
		m.Status = "degraded"
	}
	return m, node
}

func addRate(total **float64, v *float64) {
	if v == nil {
		return
	}
	if *total == nil {
		n := 0.0
		*total = &n
	}
	**total += *v
}
func aggregateApplication(server Metric, ids []string, id, status string) Metric {
	point := Metric{ResourceID: id, At: server.At, Online: server.Online, Status: status, Valid: server.Valid, CPUValid: true, MemoryTotalBytes: server.MemoryTotalBytes, Containers: []ContainerMetric{}, Network: []IORate{}, Devices: []IORate{}}
	allNetwork, allDisk := true, true
	for _, stat := range server.Containers {
		for _, owned := range ids {
			if owned != "" && (len(stat.ID) >= 12 && strings.HasPrefix(owned, stat.ID) || stat.Name != "" && owned == stat.Name) {
				point.Containers = append(point.Containers, stat)
				point.CPU += stat.CPU
				point.MemoryBytes += stat.MemoryBytes
				point.CPUValid = point.CPUValid && stat.CPUValid
				point.Valid = point.Valid && stat.Valid
				allNetwork = allNetwork && stat.NetworkRx != nil && stat.NetworkTx != nil
				allDisk = allDisk && stat.DiskRead != nil && stat.DiskWrite != nil
				addRate(&point.NetworkRx, stat.NetworkRx)
				addRate(&point.NetworkTx, stat.NetworkTx)
				addRate(&point.DiskRead, stat.DiskRead)
				addRate(&point.DiskWrite, stat.DiskWrite)
				break
			}
		}
	}
	if !allNetwork {
		point.NetworkRx = nil
		point.NetworkTx = nil
	}
	if !allDisk {
		point.DiskRead = nil
		point.DiskWrite = nil
	}
	if point.MemoryTotalBytes > 0 {
		point.Memory = 100 * float64(point.MemoryBytes) / float64(point.MemoryTotalBytes)
	}
	if !server.Online {
		point.Status = "host_unavailable"
		point.Online = false
	} else if server.Status == "degraded" && (status == "running" || status == "network_error") {
		point.Status = "unknown"
		point.Online = false
		point.Valid = false
		point.CPUValid = false
	} else if status == "running" || status == "network_error" {
		if len(ids) == 0 || len(point.Containers) == 0 {
			point.Status = "offline"
			point.Online = false
		} else if len(point.Containers) < len(ids) || status == "network_error" {
			point.Status = "degraded"
		} else {
			point.Status = "running"
		}
	} else {
		point.Online = false
	}
	if len(point.Containers) == 0 {
		point.CPUValid = false
		point.Valid = false
	}
	return point
}

func metricJSON(m Metric) []byte { raw, _ := json.Marshal(m); return raw }

func validateMetricRange(value string) (time.Duration, time.Duration, error) {
	switch value {
	case "1h":
		return time.Hour, 0, nil
	case "6h":
		return 6 * time.Hour, 0, nil
	case "", "24h":
		return 24 * time.Hour, 0, nil
	case "7d":
		return 7 * 24 * time.Hour, 5 * time.Minute, nil
	case "30d":
		return 30 * 24 * time.Hour, 30 * time.Minute, nil
	}
	return 0, 0, fmt.Errorf("select range 1h, 6h, 24h, 7d or 30d")
}
