package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	bolt "go.etcd.io/bbolt"

	"github.com/farmops/farmops/pkg/proof"
)

// bucket names
var (
	bucketProofs = []byte("proofs")
	bucketAgents = []byte("agents")
	bucketFarm   = []byte("farm")
	keyFarmState = []byte("state")
)

// BoltStore is a BoltDB-backed implementation of Store.
// It is the default zero-dependency storage for the Stats Tracker.
type BoltStore struct {
	db *bolt.DB
}

// OpenBolt opens (or creates) a BoltDB database at the given path.
func OpenBolt(path string) (*BoltStore, error) {
	db, err := bolt.Open(path, 0600, &bolt.Options{Timeout: 5 * time.Second})
	if err != nil {
		return nil, fmt.Errorf("boltdb open %s: %w", path, err)
	}

	if err := db.Update(func(tx *bolt.Tx) error {
		for _, b := range [][]byte{bucketProofs, bucketAgents, bucketFarm} {
			if _, err := tx.CreateBucketIfNotExists(b); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		return nil, fmt.Errorf("boltdb init buckets: %w", err)
	}

	return &BoltStore{db: db}, nil
}

// Close closes the underlying BoltDB database.
func (s *BoltStore) Close() error {
	return s.db.Close()
}

// --- ProofStore ---

func (s *BoltStore) AppendProof(_ context.Context, p *proof.FarmProof, coinsAwarded int) error {
	sp := &StoredProof{
		FarmProof:    p,
		CoinsAwarded: coinsAwarded,
		ReceivedAt:   time.Now().UTC(),
	}
	data, err := json.Marshal(sp)
	if err != nil {
		return fmt.Errorf("boltdb append proof: marshal: %w", err)
	}

	return s.db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketProofs)
		key := []byte(p.ProofID)
		if b.Get(key) != nil {
			return ErrDuplicateProof
		}
		return b.Put(key, data)
	})
}

func (s *BoltStore) GetProof(_ context.Context, proofID string) (*StoredProof, error) {
	var sp StoredProof
	err := s.db.View(func(tx *bolt.Tx) error {
		data := tx.Bucket(bucketProofs).Get([]byte(proofID))
		if data == nil {
			return ErrNotFound
		}
		return json.Unmarshal(data, &sp)
	})
	if err != nil {
		return nil, err
	}
	return &sp, nil
}

func (s *BoltStore) ListProofs(_ context.Context, agentID string, afterProofID string, limit int) ([]*StoredProof, error) {
	var results []*StoredProof
	err := s.db.View(func(tx *bolt.Tx) error {
		c := tx.Bucket(bucketProofs).Cursor()
		past := afterProofID == ""
		for k, v := c.First(); k != nil; k, v = c.Next() {
			if !past {
				if string(k) == afterProofID {
					past = true
				}
				continue
			}
			var sp StoredProof
			if err := json.Unmarshal(v, &sp); err != nil {
				return err
			}
			if sp.FarmProof.Agent.AgentID != agentID {
				continue
			}
			results = append(results, &sp)
			if limit > 0 && len(results) >= limit {
				break
			}
		}
		return nil
	})
	return results, err
}

func (s *BoltStore) LatestProof(_ context.Context, agentID string) (*StoredProof, error) {
	var latest *StoredProof
	err := s.db.View(func(tx *bolt.Tx) error {
		c := tx.Bucket(bucketProofs).Cursor()
		for k, v := c.Last(); k != nil; k, v = c.Prev() {
			var sp StoredProof
			if err := json.Unmarshal(v, &sp); err != nil {
				return err
			}
			if sp.FarmProof.Agent.AgentID == agentID {
				latest = &sp
				return nil
			}
		}
		return nil
	})
	return latest, err
}

// --- AgentStore ---

func (s *BoltStore) UpsertAgent(_ context.Context, agent *AgentRecord) error {
	data, err := json.Marshal(agent)
	if err != nil {
		return fmt.Errorf("boltdb upsert agent: marshal: %w", err)
	}
	return s.db.Update(func(tx *bolt.Tx) error {
		return tx.Bucket(bucketAgents).Put([]byte(agent.AgentID), data)
	})
}

func (s *BoltStore) GetAgent(_ context.Context, agentID string) (*AgentRecord, error) {
	var agent AgentRecord
	err := s.db.View(func(tx *bolt.Tx) error {
		data := tx.Bucket(bucketAgents).Get([]byte(agentID))
		if data == nil {
			return ErrNotFound
		}
		return json.Unmarshal(data, &agent)
	})
	if err != nil {
		return nil, err
	}
	return &agent, nil
}

func (s *BoltStore) ListAgents(_ context.Context) ([]*AgentRecord, error) {
	var agents []*AgentRecord
	err := s.db.View(func(tx *bolt.Tx) error {
		return tx.Bucket(bucketAgents).ForEach(func(_, v []byte) error {
			var a AgentRecord
			if err := json.Unmarshal(v, &a); err != nil {
				return err
			}
			agents = append(agents, &a)
			return nil
		})
	})
	return agents, err
}

// --- FarmStore ---

func (s *BoltStore) GetFarm(_ context.Context) (*FarmState, error) {
	var farm FarmState
	err := s.db.View(func(tx *bolt.Tx) error {
		data := tx.Bucket(bucketFarm).Get(keyFarmState)
		if data == nil {
			// Return default farm state if none exists yet.
			farm = FarmState{Name: "My Farm"}
			return nil
		}
		return json.Unmarshal(data, &farm)
	})
	if err != nil {
		return nil, err
	}
	return &farm, nil
}

func (s *BoltStore) UpdateFarm(_ context.Context, farm *FarmState) error {
	farm.UpdatedAt = time.Now().UTC()
	data, err := json.Marshal(farm)
	if err != nil {
		return fmt.Errorf("boltdb update farm: marshal: %w", err)
	}
	return s.db.Update(func(tx *bolt.Tx) error {
		return tx.Bucket(bucketFarm).Put(keyFarmState, data)
	})
}
