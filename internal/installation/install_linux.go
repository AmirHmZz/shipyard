package installation

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/mail"
	"os"
	"os/exec"
	"path/filepath"
	"shipyard/internal/buildinfo"
	"shipyard/internal/model"
	"shipyard/internal/release"
	"strings"
	"syscall"
)

const Root = "/opt/shipyard"

func atomic(path string, b []byte, mode os.FileMode) error {
	tmp := path + ".next"
	if e := os.WriteFile(tmp, b, mode); e != nil {
		return e
	}
	return os.Rename(tmp, path)
}
func Init(domain, ipv4, ipv6, email string, accept bool) error {
	if !accept {
		return errors.New("explicit CA terms consent is required")
	}
	name, e := model.Domain(domain)
	if e != nil || strings.HasPrefix(name, "*.") {
		return errors.New("one dashboard hostname is required")
	}
	if email != "" {
		a, e := mail.ParseAddress(email)
		if e != nil || a.Address != email {
			return errors.New("invalid certificate contact email")
		}
	}
	if ipv4 == "" && ipv6 == "" {
		return errors.New("provide a public server IP")
	}
	if ipv4 != "" && (net.ParseIP(ipv4) == nil || net.ParseIP(ipv4).To4() == nil) {
		return errors.New("invalid public IPv4 address")
	}
	if ipv6 != "" && (net.ParseIP(ipv6) == nil || net.ParseIP(ipv6).To4() != nil) {
		return errors.New("invalid public IPv6 address")
	}
	raw, e := os.ReadFile(Root + "/release.json")
	if e != nil {
		return e
	}
	var m release.Manifest
	if e = json.Unmarshal(raw, &m); e != nil {
		return e
	}
	if e = m.Validate(); e != nil {
		return e
	}
	if m.Version != buildinfo.Version {
		return errors.New("installer/executor version mismatch")
	}
	compose, e := os.ReadFile(Root + "/compose.host.yaml")
	if e != nil {
		return e
	}
	if release.Hash(compose) != m.Assets["compose.host.yaml"] {
		return errors.New("Compose installation artifact does not match the release manifest")
	}
	info, e := exec.Command("docker", "info", "--format", "{{json .}}").Output()
	if e != nil {
		return errors.New("cannot access local Docker Engine")
	}
	var host struct {
		ID, OSType, OperatingSystem, DockerRootDir, ServerVersion string
		SecurityOptions                                           []string
	}
	if e = json.Unmarshal(info, &host); e != nil {
		return e
	}
	if host.OSType != "linux" || strings.Contains(strings.ToLower(host.OperatingSystem), "docker desktop") {
		return errors.New("native Linux Docker Engine is required")
	}
	for _, v := range host.SecurityOptions {
		if strings.Contains(v, "rootless") {
			return errors.New("rootless Docker is unsupported")
		}
	}
	var major int
	fmt.Sscan(strings.Split(host.ServerVersion, ".")[0], &major)
	if major < m.MinimumDocker {
		return fmt.Errorf("Docker %d or newer is required", m.MinimumDocker)
	}
	if !filepath.IsAbs(host.DockerRootDir) || strings.ContainsAny(host.DockerRootDir, "\r\n$") {
		return errors.New("unsupported Docker root directory")
	}
	if data, e := os.ReadFile(Root + "/install.json"); e == nil {
		var existing release.Installation
		if json.Unmarshal(data, &existing) != nil || existing.Validate() != nil || existing.DaemonID != host.ID || existing.Release.Version != m.Version {
			return errors.New("conflicting installation; use the dashboard for version changes")
		}
		return nil
	}
	if _, e = os.Stat(Root + "/.env"); !os.IsNotExist(e) {
		return errors.New("existing installation credentials were not replaced")
	}
	if out, e := exec.Command("docker", "ps", "-aq", "--filter", "label=com.docker.compose.project=shipyard").Output(); e != nil || strings.TrimSpace(string(out)) != "" {
		return errors.New("an existing Shipyard Compose project conflicts with this installation")
	}
	for _, port := range []string{"80", "443"} {
		listener, e := net.Listen("tcp", ":"+port)
		if e != nil {
			return fmt.Errorf("public port %s is already occupied: %w", port, e)
		}
		listener.Close()
	}
	socket, e := os.Stat("/var/run/docker.sock")
	if e != nil {
		return e
	}
	gid := socket.Sys().(*syscall.Stat_t).Gid
	random := func(n int) []byte {
		b := make([]byte, n)
		if _, e := rand.Read(b); e != nil {
			panic(e)
		}
		return b
	}
	values := fmt.Sprintf("POSTGRES_PASSWORD=%s\nSHIPYARD_MASTER_KEY=%s\nSHIPYARD_BOOTSTRAP_TOKEN=%s\nSHIPYARD_ORIGIN=https://%s\nSHIPYARD_PUBLIC_IPV4=%s\nSHIPYARD_PUBLIC_IPV6=%s\nSHIPYARD_ACME_EMAIL=%s\nSHIPYARD_ACME_ACCEPT_TOS=true\nDOCKER_SOCKET_GID=%d\nSHIPYARD_DOCKER_ROOT_DIR=%s\nSHIPYARD_IMAGE=%s\nSHIPYARD_EXECUTOR_IMAGE=%s\n", hex.EncodeToString(random(32)), base64.StdEncoding.EncodeToString(random(32)), hex.EncodeToString(random(32)), name, ipv4, ipv6, email, gid, host.DockerRootDir, m.CoreImage, m.ExecutorImage)
	if e = os.Chmod(Root, 0750); e != nil {
		return e
	}
	if e = os.Chown(Root, 0, 10001); e != nil {
		return e
	}
	if e = atomic(Root+"/.env", []byte(values), 0600); e != nil {
		return e
	}
	record := release.Installation{Format: 1, Revision: 1, Directory: Root, DaemonID: host.ID, Project: "shipyard", ControlContainer: "shipyard-shipyard-1", ExecutorContainer: "shipyard-host-executor", Release: m}
	raw, _ = json.MarshalIndent(record, "", "  ")
	if e = atomic(Root+"/install.json", raw, 0640); e != nil {
		return e
	}
	return os.Chown(Root+"/install.json", 0, 10001)
}
func Finish() error {
	marker := filepath.Join(Root, ".bootstrap-displayed")
	if _, e := os.Stat(marker); e == nil {
		return nil
	}
	data, e := os.ReadFile(Root + "/.env")
	if e != nil {
		return e
	}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, "SHIPYARD_BOOTSTRAP_TOKEN=") {
			fmt.Println("First administrator bootstrap token: " + strings.TrimPrefix(line, "SHIPYARD_BOOTSTRAP_TOKEN="))
		}
	}
	return atomic(marker, []byte("shown\n"), 0600)
}
