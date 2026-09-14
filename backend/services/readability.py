"""Readability metrics — used to prove simplification actually simplified.

Flesch-Kincaid grade level and Flesch Reading Ease. Needed for:
  - the before/after figure shown to students and in the paper (roadmap §6)
  - asserting in tests that simplified text is genuinely easier
  - the `deaf` profile's <=4th-grade target (research doc §1)
"""

import re
from typing import Dict

_WORD = re.compile(r"[A-Za-z][A-Za-z'-]*")
_SENT_END = re.compile(r"[.!?]+")
_VOWEL_RUN = re.compile(r"[aeiouy]+")


def count_syllables(word: str) -> int:
    """Vowel-group heuristic with the usual silent-e correction.

    ponytail: heuristic, ~85% accurate on English. Fine here because we only ever
    compare before-vs-after on the same text. Swap in `textstat` if an absolute
    grade number ever needs to be defensible on its own.
    """
    word = word.lower().strip("'-")
    if not word:
        return 0
    groups = _VOWEL_RUN.findall(word)
    n = len(groups)
    if word.endswith("e") and not word.endswith(("le", "ee", "ye")) and n > 1:
        n -= 1
    return max(n, 1)


def analyze(text: str) -> Dict[str, float]:
    words = _WORD.findall(text)
    sentences = [s for s in _SENT_END.split(text) if s.strip()]

    n_words = len(words)
    n_sentences = max(len(sentences), 1)
    n_syllables = sum(count_syllables(w) for w in words)

    if n_words == 0:
        return {
            "words": 0,
            "sentences": 0,
            "gradeLevel": 0.0,
            "readingEase": 0.0,
            "avgSentenceLength": 0.0,
        }

    words_per_sentence = n_words / n_sentences
    syllables_per_word = n_syllables / n_words

    grade = 0.39 * words_per_sentence + 11.8 * syllables_per_word - 15.59
    ease = 206.835 - 1.015 * words_per_sentence - 84.6 * syllables_per_word

    return {
        "words": n_words,
        "sentences": n_sentences,
        # Clamp: the formula goes negative on very short text, which reads as a bug
        # to anyone looking at the UI.
        "gradeLevel": round(max(grade, 0.0), 1),
        "readingEase": round(max(min(ease, 100.0), 0.0), 1),
        "avgSentenceLength": round(words_per_sentence, 1),
    }


if __name__ == "__main__":
    hard = (
        "The utilization of photosynthetic mechanisms enables autotrophic organisms to "
        "synthesize carbohydrates, thereby facilitating the conversion of radiant energy "
        "into chemical energy which subsequently sustains the trophic hierarchy."
    )
    easy = "Plants use sunlight to make food. This food gives them energy. Animals eat plants."

    h, e = analyze(hard), analyze(easy)
    assert h["gradeLevel"] > e["gradeLevel"], (h, e)
    assert e["readingEase"] > h["readingEase"], (h, e)
    assert analyze("")["words"] == 0
    assert count_syllables("cake") == 1 and count_syllables("water") == 2
    assert count_syllables("beautiful") == 3
    print(f"ok  hard=grade {h['gradeLevel']} ease {h['readingEase']}")
    print(f"ok  easy=grade {e['gradeLevel']} ease {e['readingEase']}")
    print("readability self-check: PASS")
