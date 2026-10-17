package secure

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/scrypt"
)

type Vault struct{ key []byte }

func New(key string) (*Vault, error) {
	b, err := base64.StdEncoding.DecodeString(key)
	if err != nil || len(b) != 32 {
		return nil, errors.New("SHIPYARD_MASTER_KEY must be a base64-encoded 32-byte key")
	}
	return &Vault{key: b}, nil
}
func (v *Vault) Key() string                                 { return base64.StdEncoding.EncodeToString(v.key) }
func (v *Vault) Seal(b []byte, scope string) ([]byte, error) { return seal(v.key, b, []byte(scope)) }
func (v *Vault) Open(b []byte, scope string) ([]byte, error) { return open(v.key, b, []byte(scope)) }
func seal(key, data, aad []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err = rand.Read(nonce); err != nil {
		return nil, err
	}
	return gcm.Seal(nonce, nonce, data, aad), nil
}
func open(key, data, aad []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	if len(data) < gcm.NonceSize() {
		return nil, errors.New("invalid encrypted payload")
	}
	return gcm.Open(nil, data[:gcm.NonceSize()], data[gcm.NonceSize():], aad)
}
func Token() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(b)
}
func Hash(s string) string   { h := sha256.Sum256([]byte(s)); return hex.EncodeToString(h[:]) }
func Equal(a, b string) bool { return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1 }
func Password(password string) (string, error) {
	if len(password) < 12 || len(password) > 1024 {
		return "", errors.New("password must contain 12–1024 characters")
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	h := argon2.IDKey([]byte(password), salt, 2, 64*1024, 2, 32)
	return fmt.Sprintf("argon2id$%s$%s", base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(h)), nil
}
func CheckPassword(password, encoded string) bool {
	if len(password) > 1024 {
		return false
	}
	p := strings.Split(encoded, "$")
	if len(p) != 3 || p[0] != "argon2id" {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(p[1])
	if err != nil || len(salt) != 16 {
		return false
	}
	h, err := base64.RawStdEncoding.DecodeString(p[2])
	if err != nil || len(h) != 32 {
		return false
	}
	actual := argon2.IDKey([]byte(password), salt, 2, 64*1024, 2, 32)
	return subtle.ConstantTimeCompare(h, actual) == 1
}

// Backup format: magic, random salt, authenticated ciphertext. Keys are never stored outside ciphertext.
func EncryptBackup(password string, payload []byte) ([]byte, error) {
	if len(password) < 12 {
		return nil, errors.New("backup passphrase must contain at least 12 characters")
	}
	salt := make([]byte, 32)
	if _, err := rand.Read(salt); err != nil {
		return nil, err
	}
	key, err := scrypt.Key([]byte(password), salt, 32768, 8, 1, 32)
	if err != nil {
		return nil, err
	}
	b, err := seal(key, payload, []byte("shipyard-backup-v1"))
	if err != nil {
		return nil, err
	}
	return append(append([]byte("SHIPYARD1"), salt...), b...), nil
}
func DecryptBackup(password string, data []byte) ([]byte, error) {
	if len(data) < 69 || string(data[:9]) != "SHIPYARD1" {
		return nil, errors.New("not a Shipyard backup")
	}
	key, err := scrypt.Key([]byte(password), data[9:41], 32768, 8, 1, 32)
	if err != nil {
		return nil, err
	}
	return open(key, data[41:], []byte("shipyard-backup-v1"))
}
