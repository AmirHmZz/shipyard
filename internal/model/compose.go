package model

import (
	"errors"
	"fmt"
	"io"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"
)

const MaxComposeSize = 1 << 20

func composeDocument(source string) (map[string]any, error) {
	if strings.TrimSpace(source) == "" {
		return nil, errors.New("Compose YAML is required")
	}
	if len(source) > MaxComposeSize {
		return nil, errors.New("Compose YAML must be at most 1 MiB")
	}
	decoder := yaml.NewDecoder(strings.NewReader(source))
	var cfg map[string]any
	if err := decoder.Decode(&cfg); err != nil {
		line := regexp.MustCompile(`line [0-9]+`).FindString(err.Error())
		if line != "" {
			return nil, fmt.Errorf("invalid Compose YAML near %s; check indentation and duplicate keys", line)
		}
		return nil, errors.New("invalid Compose YAML; provide one mapping with a services section")
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return nil, errors.New("provide a single Compose YAML document")
	}
	return cfg, nil
}

// Direct Compose has no checked-out workspace. Host files must use explicit
// absolute paths; build inputs must be contained in dockerfile_inline.
func ValidateComposeSource(source string) error {
	cfg, err := composeDocument(source)
	if err != nil {
		return err
	}
	services, ok := cfg["services"].(map[string]any)
	if !ok || len(services) == 0 {
		return errors.New("Compose must contain at least one service")
	}
	if _, ok := cfg["include"]; ok {
		return errors.New("Direct Compose uses one document; inline services instead of using include")
	}
	for name, raw := range services {
		service, ok := raw.(map[string]any)
		if !ok {
			return fmt.Errorf("service %s must be a mapping", name)
		}
		image, _ := service["image"].(string)
		if build, exists := service["build"]; exists {
			options, ok := build.(map[string]any)
			if !ok {
				return fmt.Errorf("service %s: use image or build.dockerfile_inline; no repository files are available", name)
			}
			inline, _ := options["dockerfile_inline"].(string)
			context, _ := options["context"].(string)
			if strings.TrimSpace(inline) == "" || (context != "" && context != ".") {
				return fmt.Errorf("service %s: Direct Compose builds require dockerfile_inline and context: .", name)
			}
			if _, exists := options["dockerfile"]; exists {
				return fmt.Errorf("service %s: use dockerfile_inline instead of a Dockerfile path", name)
			}
		} else if strings.TrimSpace(image) == "" {
			return fmt.Errorf("service %s requires an image or an inline Dockerfile", name)
		}
		if envFile, ok := service["env_file"]; ok {
			if err := absoluteFiles(envFile); err != nil {
				return fmt.Errorf("service %s env_file: %w", name, err)
			}
		}
		if extend, ok := service["extends"].(map[string]any); ok {
			if file, ok := extend["file"]; ok {
				if err := absoluteFiles(file); err != nil {
					return fmt.Errorf("service %s extends: %w", name, err)
				}
			}
		}
		if volumes, ok := service["volumes"].([]any); ok {
			for _, volume := range volumes {
				if v, ok := volume.(string); ok {
					parts := strings.Split(v, ":")
					if len(parts) > 1 {
						source := parts[0]
						if !strings.HasPrefix(source, "/") && (strings.HasPrefix(source, ".") || strings.Contains(source, "/")) {
							return fmt.Errorf("service %s: bind mounts must use absolute host paths", name)
						}
					}
				}
				if v, ok := volume.(map[string]any); ok && v["type"] == "bind" {
					if err := absoluteFiles(v["source"]); err != nil {
						return fmt.Errorf("service %s volume: %w", name, err)
					}
				}
			}
		}
	}
	for _, kind := range []string{"configs", "secrets"} {
		if entries, ok := cfg[kind].(map[string]any); ok {
			for name, entry := range entries {
				if entry, ok := entry.(map[string]any); ok {
					if file, ok := entry["file"]; ok {
						if err := absoluteFiles(file); err != nil {
							return fmt.Errorf("%s %s: %w", kind, name, err)
						}
					}
				}
			}
		}
	}
	return nil
}

func absoluteFiles(value any) error {
	switch value := value.(type) {
	case string:
		if !strings.HasPrefix(value, "/") && !strings.HasPrefix(value, "$") {
			return errors.New("use an absolute destination-host path, or put values in Shipyard variables")
		}
	case []any:
		for _, entry := range value {
			if err := absoluteFiles(entry); err != nil {
				return err
			}
		}
	case map[string]any:
		return absoluteFiles(value["path"])
	default:
		return errors.New("invalid host file path")
	}
	return nil
}
