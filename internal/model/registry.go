package model

import (
	"errors"
	"net"
	"strconv"
	"strings"
)

type Registry struct {
	Hostname string `json:"hostname"`
	Username string `json:"username"`
}

type RegistryCredential struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// RegistryHostname accepts a registry authority, never a URL or image path.
func RegistryHostname(value string) (string, error) {
	host := strings.ToLower(strings.TrimSpace(value))
	if host == "" || strings.ContainsAny(host, "/\\@?# \t\r\n\x00") {
		return "", errors.New("registry hostname must contain only a hostname and optional port")
	}
	name := host
	if strings.Contains(host, ":") {
		var port string
		var err error
		name, port, err = net.SplitHostPort(host)
		if err != nil {
			return "", errors.New("invalid registry hostname or port")
		}
		n, err := strconv.Atoi(port)
		if err != nil || n < 1 || n > 65535 {
			return "", errors.New("invalid registry port")
		}
	}
	if net.ParseIP(name) == nil {
		for _, label := range strings.Split(name, ".") {
			if label == "" || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
				return "", errors.New("invalid registry hostname")
			}
			for _, c := range label {
				if !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-') {
					return "", errors.New("invalid registry hostname")
				}
			}
		}
	}
	if host == "index.docker.io" || host == "registry-1.docker.io" {
		host = "docker.io"
	}
	return host, nil
}

func RegistryAuthKey(host string) string {
	if host == "docker.io" {
		return "https://index.docker.io/v1/"
	}
	return host
}
