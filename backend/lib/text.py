"""Claim extraction + TF-IDF vector space (spec 8.1-8.3).

Normalization for comparison: lowercase, number words -> digits, digits masked for the
similarity step, while extracted numbers and negation words are compared separately.
TF-IDF: 1-2 grams, sublinear tf, English stop words removed. The vocabulary/idf are
frozen at first fit and persisted, so unchanged claims are NEVER re-embedded — new
claims are transformed against the frozen space (spec: incremental scans)."""

import hashlib
import math
import re

from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, TfidfVectorizer

STOP_WORDS = frozenset(ENGLISH_STOP_WORDS)
MIN_CLAIM_WORDS = 5

NUMBER_WORDS = {
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
    "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10", "eleven": "11",
    "twelve": "12", "thirteen": "13", "fourteen": "14", "fifteen": "15", "sixteen": "16",
    "seventeen": "17", "eighteen": "18", "nineteen": "19", "twenty": "20", "thirty": "30",
    "forty": "40", "fifty": "50", "sixty": "60", "seventy": "70", "eighty": "80",
    "ninety": "90", "hundred": "100",
}
_NUMBER_WORD_RE = re.compile(r"\b(" + "|".join(NUMBER_WORDS) + r")\b")
_TOKEN_RE = re.compile(r"[a-z0-9]+")
_NEGATION_WORDS = {"not", "never", "no", "cannot", "prohibited", "forbidden"}
_DIGIT_RE = re.compile(r"\d")


def convert_number_words(text: str) -> str:
    return _NUMBER_WORD_RE.sub(lambda m: NUMBER_WORDS[m.group(1)], text.lower())


def mask_digits(text: str) -> str:
    """Digits masked for similarity so differing values do not dominate the metric;
    the extracted values are compared separately (spec 8.2)."""
    return _DIGIT_RE.sub("0", text)


def content_tokens(text: str) -> list[str]:
    converted = convert_number_words(text)
    return [t for t in _TOKEN_RE.findall(converted) if t not in STOP_WORDS and len(t) > 1]


def tokenize_for_tfidf(text: str) -> list[str]:
    """Digits are MASKED here (spec 8.2) so differing values never dominate the similarity
    metric — the extracted numbers and negations are compared separately in classify_pair."""
    toks = [mask_digits(t) for t in content_tokens(text)]
    return toks + [f"{a} {b}" for a, b in zip(toks, toks[1:])]  # unigrams + bigrams


def extract_numbers(text: str) -> list[str]:
    return sorted(set(re.findall(r"\d+(?:\.\d+)?", convert_number_words(text))))


def negations(text: str) -> list[str]:
    words = set(_TOKEN_RE.findall(text.lower()))
    return sorted(words & _NEGATION_WORDS)


def split_sentences(text: str) -> list[str]:
    """Passage-level atomic claims: sentences of 5+ words (spec 8.1)."""
    out = []
    for part in re.split(r"(?<=[.!?])\s+|\n+", text):
        s = part.strip().lstrip("-•* ").strip()
        s = re.sub(r"^\d+[.)]\s*", "", s)
        if len(s.split()) >= MIN_CLAIM_WORDS:
            out.append(s)
    return out


def claim_key(doc_id: str, version_no: int, sentence: str) -> str:
    return hashlib.sha256(f"{doc_id}|{version_no}|{sentence}".encode("utf-8")).hexdigest()


class TfidfSpace:
    """Frozen vocabulary + idf. fit() once; transform() is pure arithmetic, so adding
    documents never re-embeds existing claims."""

    def __init__(self, vocab: dict[str, int] | None = None, idf: list[float] | None = None):
        self.vocab: dict[str, int] = vocab or {}
        self.idf: list[float] = idf or []

    @property
    def ready(self) -> bool:
        return bool(self.vocab)

    def fit(self, texts: list[str]) -> None:
        vec = TfidfVectorizer(analyzer=tokenize_for_tfidf, sublinear_tf=True)
        vec.fit(texts)
        self.vocab = dict(vec.vocabulary_)
        self.idf = [float(x) for x in vec.idf_]

    def transform_one(self, text: str) -> dict[str, float]:
        """Sublinear tf * frozen idf, L2-normalized, sparse dict term -> weight."""
        counts: dict[str, int] = {}
        for term in tokenize_for_tfidf(text):
            counts[term] = counts.get(term, 0) + 1
        vec: dict[str, float] = {}
        for term, c in counts.items():
            col = self.vocab.get(term)
            if col is None or col >= len(self.idf):
                continue  # unseen term: no idf, contributes nothing (space is frozen)
            vec[term] = (1.0 + math.log(c)) * self.idf[col]
        norm = math.sqrt(sum(w * w for w in vec.values())) or 1.0
        return {t: w / norm for t, w in vec.items()}

    def to_doc(self) -> dict:
        return {"vocab": self.vocab, "idf": self.idf}

    @classmethod
    def from_doc(cls, doc: dict) -> "TfidfSpace":
        return cls(vocab=doc.get("vocab") or {}, idf=doc.get("idf") or [])
