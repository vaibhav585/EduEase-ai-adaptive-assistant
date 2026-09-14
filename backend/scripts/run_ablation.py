"""DASE ablation — the evidence that disability-conditional weighting does anything.

Scores the SAME synthetic students under EVERY weight profile. If the rankings do
not change, the novelty claim is empty and this script says so.

Re-run after any edit to data/dase_profiles.json — a weight change that stops
differentiating students should be caught here, not in review.

Usage:
    cd backend && python scripts/run_ablation.py [--csv ablation.csv]
"""

import argparse
import csv
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services import dase_engine as dase  # noqa: E402

# Synthetic learner archetypes. Each is a plausible parameter vector, chosen so
# that a neurotypical-baseline scorer would rank them in an order the project
# argues is wrong.
ARCHETYPES = {
    "persistent_struggler": {
        "_note": "Low accuracy, very high effort and improvement. Traditional scoring calls this a failing student.",
        "ACC": 0.40, "ADJ_ACC": 0.48, "COMP": 0.45, "EFFORT": 0.95,
        "LRN_VEL": 0.90, "TIME_EFF": 0.35, "CONSIST": 0.65,
        "TASK_COMP": 1.0, "ATT_SPAN": 0.70, "READ_FL": 0.45,
    },
    "distracted_capable": {
        "_note": "Knows the material but loses focus. Raw accuracy understates them; ADJ_ACC recovers it.",
        "ACC": 0.55, "ADJ_ACC": 0.82, "COMP": 0.70, "EFFORT": 0.60,
        "LRN_VEL": 0.55, "TIME_EFF": 0.75, "CONSIST": 0.30,
        "TASK_COMP": 0.60, "ATT_SPAN": 0.30, "READ_FL": 0.70,
    },
    "slow_accurate": {
        "_note": "Gets things right but far below average speed. Timed assessment punishes them.",
        "ACC": 0.85, "ADJ_ACC": 0.86, "COMP": 0.80, "EFFORT": 0.80,
        "LRN_VEL": 0.55, "TIME_EFF": 0.20, "CONSIST": 0.85,
        "TASK_COMP": 0.90, "ATT_SPAN": 0.85, "READ_FL": 0.30,
    },
    "consistent_literal": {
        "_note": "Very consistent and reliable, weaker on open-ended comprehension items.",
        "ACC": 0.70, "ADJ_ACC": 0.72, "COMP": 0.50, "EFFORT": 0.65,
        "LRN_VEL": 0.50, "TIME_EFF": 0.70, "CONSIST": 0.95,
        "TASK_COMP": 0.95, "ATT_SPAN": 0.80, "READ_FL": 0.65,
    },
    "strong_all_round": {
        "_note": "Control. Should rank top under every profile — if not, a profile is broken.",
        "ACC": 0.90, "ADJ_ACC": 0.91, "COMP": 0.88, "EFFORT": 0.85,
        "LRN_VEL": 0.70, "TIME_EFF": 0.85, "CONSIST": 0.88,
        "TASK_COMP": 1.0, "ATT_SPAN": 0.90, "READ_FL": 0.85,
    },
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv")
    args = parser.parse_args()

    profiles = list(dase.load_config()["profiles"])
    archetypes = {k: {p: v for p, v in d.items() if not p.startswith("_")}
                  for k, d in ARCHETYPES.items()}

    # ── score matrix
    scores = {
        name: {prof: dase.compute_dase(params, prof)["score"] for prof in profiles}
        for name, params in archetypes.items()
    }

    width = max(len(n) for n in archetypes) + 2
    print("DASE score by weight profile\n")
    print("archetype".ljust(width) + "".join(p[:9].rjust(11) for p in profiles))
    print("-" * (width + 11 * len(profiles)))
    for name in archetypes:
        row = "".join(f"{scores[name][p]:>11.3f}" for p in profiles)
        print(name.ljust(width) + row)

    # ── per-profile spread: does this profile distinguish students at all?
    print("\nSpread within each profile (max - min across archetypes):")
    for prof in profiles:
        col = [scores[n][prof] for n in archetypes]
        print(f"  {prof:<18} {max(col) - min(col):.3f}")

    # ── the headline: does the RANKING change between profiles?
    print("\nRanking of archetypes under each profile (best first):")
    rankings = {}
    for prof in profiles:
        order = sorted(archetypes, key=lambda n: scores[n][prof], reverse=True)
        rankings[prof] = order
        print(f"  {prof:<18} {' > '.join(a[:18] for a in order)}")

    distinct = {tuple(v) for v in rankings.values()}
    print(f"\nDistinct rankings across {len(profiles)} profiles: {len(distinct)}")

    if len(distinct) == 1:
        print(
            "\nFAIL: every profile ranks students identically. Disability-conditional\n"
            "      weighting is having no effect — the novelty claim does not hold."
        )
        return 1

    # Per-archetype sensitivity: how much does the choice of profile move one student?
    print("\nHow much the profile choice moves a single student:")
    for name in archetypes:
        col = list(scores[name].values())
        best = max(scores[name], key=lambda p: scores[name][p])
        worst = min(scores[name], key=lambda p: scores[name][p])
        print(
            f"  {name:<22} {min(col):.3f} ({worst}) -> {max(col):.3f} ({best})"
            f"   delta={max(col) - min(col):.3f}"
        )

    if args.csv:
        with open(args.csv, "w", newline="", encoding="utf-8") as fh:
            writer = csv.writer(fh)
            writer.writerow(["archetype"] + profiles)
            for name in archetypes:
                writer.writerow([name] + [f"{scores[name][p]:.4f}" for p in profiles])
        print(f"\nwrote {args.csv}")

    print(
        "\nNOTE: these are SYNTHETIC archetypes, not real students. This table shows\n"
        "      that the weighting differentiates — it is NOT evidence that the weights\n"
        "      are correct. Validating the weights needs real learners."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
