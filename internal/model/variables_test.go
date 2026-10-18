package model

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestVariableValidation(t *testing.T) {
	value := "visible"
	for _, tc := range []struct {
		name, kind, key string
		secret, valid   bool
	}{
		{"runtime", "application", "env:ORIGIN", false, true},
		{"preview", "project", "preview-env:ORIGIN", false, true},
		{"secret", "environment", "env:TOKEN", true, true},
		{"build", "application", "build:TOKEN", true, true},
		{"preview build", "application", "preview-build:TOKEN", true, true},
		{"plaintext build", "project", "build:TOKEN", false, false},
		{"plaintext preview build", "project", "preview-build:TOKEN", false, false},
		{"wrong resource", "dns", "env:ORIGIN", false, false},
		{"invalid name", "application", "preview-env:bad-name", true, false},
		{"unknown scope", "project", "other:ORIGIN", false, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			in := ResourceInput{Kind: "project", Name: "test", Data: json.RawMessage(`{}`)}
			if tc.secret {
				in.Secrets = map[string]string{tc.key: value}
			} else {
				in.Variables = map[string]*string{tc.key: &value}
			}
			// Exercise key validation independently of kind-specific configuration.
			if err := ValidateVariableKey(tc.kind, tc.key, tc.secret); (err == nil) != tc.valid {
				t.Fatalf("valid=%v: %v", tc.valid, err)
			}
			if tc.kind != "dns" && tc.valid {
				if err := Validate(in); err != nil {
					t.Fatal(err)
				}
			}
		})
	}
	in := ResourceInput{Kind: "project", Name: "test", Data: json.RawMessage(`{}`), Variables: map[string]*string{"env:VALUE": &value}, Secrets: map[string]string{"env:VALUE": "hidden"}}
	if Validate(in) == nil {
		t.Fatal("conflicting writes accepted")
	}
	large := strings.Repeat("x", 1048577)
	in.Secrets = nil
	in.Variables["env:VALUE"] = &large
	if Validate(in) == nil {
		t.Fatal("oversize value accepted")
	}
}
