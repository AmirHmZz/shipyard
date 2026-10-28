package model

import (
	"strings"
	"testing"
)

func TestDirectComposeValidation(t *testing.T) {
	for _, source := range []string{"services:\n  web:\n    image: nginx:alpine\n", "services:\n  web:\n    build:\n      context: .\n      dockerfile_inline: |\n        FROM scratch\n", "services:\n  db:\n    image: postgres\n    volumes: [data:/var/lib/postgresql]\nvolumes:\n  data: {}\n", "services:\n  web:\n    image: nginx\n    env_file: /etc/app.env\n    volumes: [/srv/site:/usr/share/nginx/html:ro]\n"} {
		if err := ValidateComposeSource(source); err != nil {
			t.Fatal(source, err)
		}
	}
	for _, source := range []string{"", "services: [", "services: {}", "services:\n  web: {}", "services:\n  web:\n    image: nginx\n    image: duplicate", "services:\n  web:\n    image: nginx\n---\nservices: {}", "services:\n  web:\n    build: .", "services:\n  web:\n    build:\n      dockerfile_inline: FROM scratch\n      context: ./files", "services:\n  web:\n    image: nginx\n    env_file: .env", "services:\n  web:\n    image: nginx\n    volumes: [./site:/site]", "services:\n  web:\n    image: nginx\ninclude: compose.other.yaml", strings.Repeat("x", MaxComposeSize+1)} {
		if err := ValidateComposeSource(source); err == nil {
			t.Fatal("invalid document accepted", source[:min(len(source), 80)])
		}
	}
}

func TestGitInlineComposeValidation(t *testing.T) {
	app := App{Source: "git", Engine: "compose", ComposeMode: "inline"}
	source := "services:\n  web:\n    build: .\n    env_file: ./settings.env\n"
	if !app.InlineCompose() {
		t.Fatal("Git inline mode not recognized")
	}
	if err := app.ValidateCompose(source); err != nil {
		t.Fatal(err)
	}
	if err := ValidateComposeSource(source); err == nil {
		t.Fatal("standalone restrictions bypassed")
	}
	for _, invalid := range []string{"", "services: []", "services: {web: 42}", "services: {web: {}}\n---\nservices: {}"} {
		if err := app.ValidateCompose(invalid); err == nil {
			t.Fatal("invalid inline YAML accepted", invalid)
		}
	}
}
