package certs

import "testing"

func TestConfigurationRequiresEmailAndExplicitConsent(t *testing.T) {
	for _, value := range []Configuration{{}, {Email: "admin@example.com"}, {Email: "invalid", AcceptTOS: true}, {Email: "Name <admin@example.com>", AcceptTOS: true}, {Email: "admin@example.com\n", AcceptTOS: true}} {
		if value.Validate() == nil {
			t.Fatalf("invalid certificate configuration accepted: %#v", value)
		}
	}
	if e := (Configuration{Email: "admin@example.com", AcceptTOS: true}).Validate(); e != nil {
		t.Fatal(e)
	}
}
