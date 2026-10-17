package secure

import (
	"bytes"
	"encoding/base64"
	"testing"
)

func TestVaultAuthenticatesScopeAndContents(t *testing.T) {
	v, e := New(base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{7}, 32)))
	if e != nil {
		t.Fatal(e)
	}
	encrypted, e := v.Seal([]byte("credential"), "tenant:a")
	if e != nil {
		t.Fatal(e)
	}
	if bytes.Contains(encrypted, []byte("credential")) {
		t.Fatal("plaintext leaked")
	}
	plain, e := v.Open(encrypted, "tenant:a")
	if e != nil || string(plain) != "credential" {
		t.Fatal(e)
	}
	if _, e = v.Open(encrypted, "tenant:b"); e == nil {
		t.Fatal("cross-scope ciphertext accepted")
	}
	encrypted[len(encrypted)-1] ^= 1
	if _, e = v.Open(encrypted, "tenant:a"); e == nil {
		t.Fatal("tampering accepted")
	}
}
func TestPasswordAndBackup(t *testing.T) {
	hash, e := Password("a long testing password")
	if e != nil {
		t.Fatal(e)
	}
	if !CheckPassword("a long testing password", hash) || CheckPassword("wrong", hash) {
		t.Fatal("password boundary failed")
	}
	if _, e = Password("short"); e == nil {
		t.Fatal("short password accepted")
	}
	encrypted, e := EncryptBackup("a backup passphrase", []byte("master key and data"))
	if e != nil {
		t.Fatal(e)
	}
	data, e := DecryptBackup("a backup passphrase", encrypted)
	if e != nil || string(data) != "master key and data" {
		t.Fatal(e)
	}
	if _, e = DecryptBackup("wrong passphrase", encrypted); e == nil {
		t.Fatal("wrong backup passphrase accepted")
	}
	if _, e = DecryptBackup("wrong", []byte("SHIPYARD1")); e == nil {
		t.Fatal("truncated backup accepted")
	}
}
