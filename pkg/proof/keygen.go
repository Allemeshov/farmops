package proof

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/hex"
	"fmt"
)

// GenerateKeyPair generates a new Ed25519 keypair for an agent.
// The private key must be stored securely and never transmitted.
// The public key is shared with the Stats Tracker during enrollment.
func GenerateKeyPair() (pubKey ed25519.PublicKey, privKey ed25519.PrivateKey, err error) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, nil, fmt.Errorf("keygen: %w", err)
	}
	return pub, priv, nil
}

// EncodePublicKey returns the hex-encoded public key string suitable for
// storage in the Stats Tracker's agent trust store.
func EncodePublicKey(pub ed25519.PublicKey) string {
	return hex.EncodeToString(pub)
}

// DecodePublicKey parses a hex-encoded public key string.
func DecodePublicKey(s string) (ed25519.PublicKey, error) {
	b, err := hex.DecodeString(s)
	if err != nil {
		return nil, fmt.Errorf("decode public key: %w", err)
	}
	if len(b) != ed25519.PublicKeySize {
		return nil, fmt.Errorf("decode public key: invalid length %d (want %d)", len(b), ed25519.PublicKeySize)
	}
	return ed25519.PublicKey(b), nil
}

// EncodePrivateKey returns the hex-encoded private key string.
// Store this in a secrets manager or encrypted file — never in plaintext.
func EncodePrivateKey(priv ed25519.PrivateKey) string {
	return hex.EncodeToString(priv)
}

// DecodePrivateKey parses a hex-encoded private key string.
func DecodePrivateKey(s string) (ed25519.PrivateKey, error) {
	b, err := hex.DecodeString(s)
	if err != nil {
		return nil, fmt.Errorf("decode private key: %w", err)
	}
	if len(b) != ed25519.PrivateKeySize {
		return nil, fmt.Errorf("decode private key: invalid length %d (want %d)", len(b), ed25519.PrivateKeySize)
	}
	return ed25519.PrivateKey(b), nil
}
