"""Generate the paper's readability table (roadmap §4b).

Runs every simplification profile over the same source passages and reports the
grade-level change and prompt-faithfulness checks. Re-run whenever a profile prompt
changes — a prompt edit that quietly stops working should show up here.

Usage:
    cd backend && python scripts/readability_table.py [--csv out.csv]
"""

import argparse
import csv
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services import cache, nlp_simplify  # noqa: E402

PASSAGES = {
    "biology": (
        "Photosynthesis is the process by which green plants and certain other organisms "
        "transform light energy into chemical energy. During photosynthesis in green plants, "
        "light energy is captured and used to convert water, carbon dioxide, and minerals into "
        "oxygen and energy-rich organic compounds. As shown in the diagram above, chlorophyll "
        "absorbs approximately 90% of incident radiation."
    ),
    "history": (
        "The Industrial Revolution, which commenced in Britain during the latter half of the "
        "eighteenth century, precipitated an unprecedented transformation of manufacturing "
        "processes, whereby mechanised production supplanted artisanal labour, thereby "
        "engendering profound demographic shifts as rural populations migrated toward "
        "burgeoning urban centres."
    ),
    "maths": (
        "A fraction represents a part of a whole, wherein the numerator denotes the quantity "
        "of equal parts under consideration and the denominator indicates the total number of "
        "equal parts constituting the whole. To add fractions possessing dissimilar "
        "denominators, one must first determine the least common multiple."
    ),
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", help="write results to this CSV path")
    args = parser.parse_args()

    rows = []
    header = f"{'passage':<10}{'profile':<14}{'grade':>16}{'delta':>7}{'sent':>7}{'max':>6}{'met':>6}"
    print(header)
    print("-" * len(header))

    for passage_name, passage in PASSAGES.items():
        for profile in nlp_simplify.available_profiles():
            cache.clear_memory()
            r = nlp_simplify.simplify_text(passage, profile)
            if r["degraded"]:
                print(f"{passage_name:<10}{profile:<14}  LLM UNAVAILABLE — skipped")
                continue

            row = {
                "passage": passage_name,
                "profile": profile,
                "gradeBefore": r["before"]["gradeLevel"],
                "gradeAfter": r["after"]["gradeLevel"],
                "gradeDelta": r["gradeDelta"],
                "avgSentenceLength": r["after"]["avgSentenceLength"],
                "maxSentenceTarget": r["maxSentenceTarget"],
                "shortEnough": r["shortEnough"],
                "easier": r["easier"],
                "metTarget": r["metTarget"],
            }
            rows.append(row)
            print(
                f"{passage_name:<10}{profile:<14}"
                f"{row['gradeBefore']:>7} ->{row['gradeAfter']:>6}"
                f"{row['gradeDelta']:>7}{row['avgSentenceLength']:>7}"
                f"{row['maxSentenceTarget']:>6}{str(row['metTarget']):>6}"
            )

    if rows:
        met = sum(1 for r in rows if r["metTarget"])
        mean_delta = sum(r["gradeDelta"] for r in rows) / len(rows)
        print(f"\nmet target: {met}/{len(rows)}   mean grade reduction: {mean_delta:.1f}")

    if args.csv and rows:
        with open(args.csv, "w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
        print(f"wrote {args.csv}")

    return 0 if rows else 1


if __name__ == "__main__":
    sys.exit(main())
