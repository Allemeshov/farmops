// Package scoring implements the coin scoring engine.
// Scores are computed from a FarmProof's category, complexity, and impact hints,
// combined with the current farm upgrade multipliers.
// The scoring engine runs in the Stats Tracker, not the agent.
package scoring

import "github.com/farmops/farmops/pkg/proof"

// Config holds the configurable scoring parameters.
// All values can be overridden per-tracker via the database Config table.
type Config struct {
	// Base coins per category.
	BaseCoins map[string]int

	// Complexity multipliers.
	ComplexityMultipliers map[string]float64

	// ImpactMultiplier scales linearly: multiplier = 1.0 + (ImpactRadius-1) * ImpactStep
	ImpactStep float64

	// StreakMultiplier is added per consecutive active day, capped at StreakCap.
	StreakStep float64
	StreakCap  float64
}

// DefaultConfig returns the default scoring configuration as defined in the
// architecture document (Section 6).
func DefaultConfig() Config {
	return Config{
		BaseCoins: map[string]int{
			proof.CategoryMaintenance: 10,
			proof.CategoryToil:        15,
			proof.CategoryReliability: 20,
			proof.CategorySecurity:    25,
			proof.CategoryIncident:    30,
			proof.CategoryUpgrade:     20,
		},
		ComplexityMultipliers: map[string]float64{
			proof.ComplexityLow:    1.0,
			proof.ComplexityMedium: 1.25,
			proof.ComplexityHigh:   1.5,
		},
		ImpactStep: 0.1,  // impact_radius=1 → 1.0, radius=10 → 1.9
		StreakStep: 0.07, // +7% per consecutive day
		StreakCap:  1.5,  // capped at +50% after ~7 days
	}
}

// Result holds the breakdown of a coin calculation.
type Result struct {
	BaseCoins      int
	ComplexityMult float64
	ImpactMult     float64
	StreakMult     float64
	UpgradeMult    float64
	TotalCoins     int
}

// Compute calculates the coins awarded for a verified proof.
// upgradeMult is the combined multiplier from the farm's active upgrades
// for the proof's category (1.0 if no relevant upgrades).
// streakDays is the number of consecutive active days (0-based).
func Compute(p *proof.FarmProof, cfg Config, upgradeMult float64, streakDays int) Result {
	base := cfg.BaseCoins[p.Action.Category]
	if base == 0 {
		base = 10 // fallback for unknown categories
	}

	complexityMult := cfg.ComplexityMultipliers[p.ScoringHints.Complexity]
	if complexityMult == 0 {
		complexityMult = 1.0
	}

	impactMult := 1.0
	if p.ScoringHints.ImpactRadius > 1 {
		impactMult = 1.0 + float64(p.ScoringHints.ImpactRadius-1)*cfg.ImpactStep
	}

	streakMult := 1.0 + float64(streakDays)*cfg.StreakStep
	if streakMult > cfg.StreakCap {
		streakMult = cfg.StreakCap
	}

	if upgradeMult == 0 {
		upgradeMult = 1.0
	}

	total := int(float64(base) * complexityMult * impactMult * streakMult * upgradeMult)
	if total < 1 && base > 0 {
		total = 1 // always award at least 1 coin for a verified action
	}

	return Result{
		BaseCoins:      base,
		ComplexityMult: complexityMult,
		ImpactMult:     impactMult,
		StreakMult:     streakMult,
		UpgradeMult:    upgradeMult,
		TotalCoins:     total,
	}
}
