package scoring_test

import (
	"testing"

	"github.com/farmops/farmops/pkg/proof"
	"github.com/farmops/farmops/pkg/scoring"
)

func makeProof(category, complexity string, impactRadius int) *proof.FarmProof {
	return &proof.FarmProof{
		Action: proof.ActionInfo{Category: category},
		ScoringHints: proof.ScoringHints{
			Complexity:   complexity,
			ImpactRadius: impactRadius,
		},
	}
}

func TestCompute_Defaults(t *testing.T) {
	cfg := scoring.DefaultConfig()

	tests := []struct {
		category   string
		complexity string
		impact     int
		streak     int
		upgrade    float64
		wantMin    int
	}{
		{proof.CategoryMaintenance, proof.ComplexityLow, 1, 0, 1.0, 10},
		{proof.CategorySecurity, proof.ComplexityHigh, 10, 0, 1.0, 25},
		{proof.CategoryIncident, proof.ComplexityMedium, 5, 7, 1.0, 30},
		{proof.CategoryReliability, proof.ComplexityLow, 1, 0, 1.2, 20},
	}

	for _, tt := range tests {
		p := makeProof(tt.category, tt.complexity, tt.impact)
		r := scoring.Compute(p, cfg, tt.upgrade, tt.streak)
		if r.TotalCoins < tt.wantMin {
			t.Errorf("category=%s complexity=%s: got %d coins, want >= %d",
				tt.category, tt.complexity, r.TotalCoins, tt.wantMin)
		}
		if r.TotalCoins < 1 {
			t.Errorf("category=%s: expected at least 1 coin, got 0", tt.category)
		}
	}
}

func TestCompute_StreakCap(t *testing.T) {
	cfg := scoring.DefaultConfig()
	p := makeProof(proof.CategoryMaintenance, proof.ComplexityLow, 1)

	r100 := scoring.Compute(p, cfg, 1.0, 100)
	r7 := scoring.Compute(p, cfg, 1.0, 7)

	// Both should be capped at the same value since streak cap applies.
	if r100.TotalCoins != r7.TotalCoins {
		t.Errorf("streak cap not applied: streak=100 gave %d, streak=7 gave %d",
			r100.TotalCoins, r7.TotalCoins)
	}
}
