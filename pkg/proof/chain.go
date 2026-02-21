package proof

import (
	"crypto/ed25519"
	"encoding/hex"
	"fmt"
)

// Chain validates the integrity of an ordered slice of proofs.
// It verifies that:
//  1. Each proof's PrevProofHash matches the actual hash of the preceding proof.
//  2. Each proof's signature is valid against the provided public key.
//
// proofs must be ordered oldest-first. The first proof is treated as genesis
// (PrevProofID and PrevProofHash may be empty).
func Chain(proofs []*FarmProof, pubKey ed25519.PublicKey) error {
	for i, p := range proofs {
		// Verify signature.
		if err := Verify(p, pubKey); err != nil {
			return fmt.Errorf("chain: proof %d (%s): invalid signature: %w", i, p.ProofID, err)
		}

		if i == 0 {
			// Genesis proof: no previous hash required.
			continue
		}

		prev := proofs[i-1]
		prevHash, err := prev.Hash()
		if err != nil {
			return fmt.Errorf("chain: proof %d (%s): hash previous: %w", i, p.ProofID, err)
		}

		if p.PrevProofID != prev.ProofID {
			return fmt.Errorf("chain: proof %d (%s): prev_proof_id mismatch: got %s, want %s",
				i, p.ProofID, p.PrevProofID, prev.ProofID)
		}
		if p.PrevProofHash != prevHash {
			return fmt.Errorf("chain: proof %d (%s): prev_proof_hash mismatch: got %s, want %s",
				i, p.ProofID, p.PrevProofHash, prevHash)
		}
	}
	return nil
}

// Sign signs the proof's canonical JSON with the given Ed25519 private key
// and sets p.Signature to the hex-encoded signature.
func Sign(p *FarmProof, privKey ed25519.PrivateKey) error {
	payload, err := p.CanonicalJSON()
	if err != nil {
		return fmt.Errorf("sign: %w", err)
	}
	sig := ed25519.Sign(privKey, payload)
	p.Signature = hex.EncodeToString(sig)
	return nil
}

// Verify checks that the proof's signature is valid against the given public key.
func Verify(p *FarmProof, pubKey ed25519.PublicKey) error {
	payload, err := p.CanonicalJSON()
	if err != nil {
		return fmt.Errorf("verify: canonical json: %w", err)
	}
	sig, err := hex.DecodeString(p.Signature)
	if err != nil {
		return fmt.Errorf("verify: decode signature: %w", err)
	}
	if !ed25519.Verify(pubKey, payload, sig) {
		return fmt.Errorf("verify: signature invalid")
	}
	return nil
}
