"""Detection engine (spec 8): hybrid retrieval over atomic claims, pair classification,
conflict subtyping (stale / contradiction / tie), unsupported-claim detection, confidence
scoring and routing. Works fully OFFLINE (TF-IDF + exact cosine kNN) and improves when an
embedding/LLM provider is configured."""

import hashlib
import os
import time
import uuid
from datetime import datetime, timezone

import numpy as np
from scipy.sparse import csr_matrix

from lib import injection, llm
from lib.db import db
from lib.ledger import append_audit
from lib.resolve import _apply_doc_edit
from lib.settings import get_settings
from lib.text import TfidfSpace, claim_key, content_tokens, extract_numbers, negations, split_sentences


def _pair_id(type_: str, text_a: str, text_b: str) -> str:
    payload = f"{type_}|" + "|".join(sorted([text_a, text_b]))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


# Max label-only LLM judge calls per scan (protects free-tier quotas; the rest of the
# ambiguous band falls back to the deterministic offline judge).
LLM_JUDGE_MAX = int(os.environ.get("LLM_JUDGE_MAX", "25"))


def _unsupported_id(text: str) -> str:
    return hashlib.sha256(f"unsupported|{text}".encode("utf-8")).hexdigest()


def _clamp(x: float) -> float:
    return round(min(1.0, max(0.0, x)), 4)


def extract_claims(doc_id: str, version_no: int, text: str) -> list[dict]:
    claims = []
    for ord_, sentence in enumerate(split_sentences(text)):
        claims.append({
            "cid": claim_key(doc_id, version_no, sentence),
            "doc_id": doc_id,
            "doc_version_no": version_no,
            "text": sentence,
            "ord": ord_,
            "numbers": extract_numbers(sentence),
            "negations": negations(sentence),
            "vector": None,
        })
    return claims


# --- Incremental indexing ---------------------------------------------------------------

async def index_changed_docs(actor: str, database=None) -> dict:
    """Extract + vectorize claims ONLY for new or changed documents (spec 8.3):
    unchanged documents are never re-embedded, never re-extracted."""
    dbh = database if database is not None else db
    docs = await dbh.docs.find({"status": "active"}).to_list(10000)
    state_doc = await dbh.index_state.find_one({"_id": "tfidf"})
    space = TfidfSpace.from_doc(state_doc) if state_doc else TfidfSpace()

    changed: list[tuple[dict, list[dict]]] = []
    for d in docs:
        if d.get("indexed_version") == d["current_version_no"]:
            continue
        cur = await dbh.versions.find_one({"doc_id": d["id"], "version_no": d["current_version_no"]})
        if not cur:
            continue
        changed.append((d, extract_claims(d["id"], d["current_version_no"], cur["text"])))

    new_claims = [c for _, cs in changed for c in cs]
    if new_claims and not space.ready:
        space.fit([c["text"] for c in new_claims])
    for c in new_claims:
        c["vector"] = space.transform_one(c["text"])

    for d, cs in changed:
        await dbh.claims.delete_many({"doc_id": d["id"]})
        if cs:
            await dbh.claims.insert_many(cs)
        await dbh.docs.update_one({"id": d["id"]}, {"$set": {"indexed_version": d["current_version_no"]}})
    if new_claims:
        await dbh.index_state.update_one({"_id": "tfidf"}, {"$set": space.to_doc()}, upsert=True)

    total = await dbh.claims.count_documents({})
    return {"reindexed_docs": len(changed), "new_claims": len(new_claims), "claims": total}


def _build_matrix(claims: list[dict], vocab: dict[str, int]):
    dim = (max(vocab.values()) + 1) if vocab else 1
    indptr, indices, data = [0], [], []
    for c in claims:
        for term, w in (c.get("vector") or {}).items():
            col = vocab.get(term)
            if col is not None:
                indices.append(col)
                data.append(w)
        indptr.append(len(indices))
    return csr_matrix((np.asarray(data, dtype="float32"), np.asarray(indices, dtype="int32"),
                       np.asarray(indptr, dtype="int32")), shape=(len(claims), dim))


def _candidate_pairs(claims: list[dict], space: TfidfSpace, k: int, min_sim: float) -> list[tuple[int, int, float]]:
    """k=8 nearest neighbours per claim, cosine similarity. Exact search over the sparse
    TF-IDF matrix — the offline stand-in for FAISS/HNSW (same recall at this scale; the
    vector index is a pluggable component)."""
    n = len(claims)
    if n < 2:
        return []
    M = _build_matrix(claims, space.vocab)
    S = (M @ M.T).toarray()
    np.fill_diagonal(S, 0.0)
    pairs: dict[tuple[int, int], float] = {}
    for i in range(n):
        row = S[i]
        kk = min(k, n - 1)
        top = np.argpartition(-row, kk)[: kk + 1]
        for j in top:
            j = int(j)
            if j == i or row[j] < min_sim or claims[i]["doc_id"] == claims[j]["doc_id"]:
                continue
            key = (min(i, j), max(i, j))
            pairs[key] = max(pairs.get(key, 0.0), float(row[j]))
    return [(i, j, s) for (i, j), s in pairs.items()]


# --- Classification + subtyping (spec 8.4-8.6) ------------------------------------------

def _offline_judge(ca: dict, cb: dict) -> str:
    """Offline stand-in for the LLM judge in the 0.45-0.60 band: content-word Jaccard."""
    a, b = set(content_tokens(ca["text"])), set(content_tokens(cb["text"]))
    union = a | b
    jaccard = len(a & b) / len(union) if union else 0.0
    return "duplicate" if jaccard >= 0.45 else "consistent"


def _date_gap_days(date_a: str, date_b: str) -> int:
    try:
        da = datetime.strptime(str(date_a), "%Y-%m-%d")
        dbb = datetime.strptime(str(date_b), "%Y-%m-%d")
        return abs((da - dbb).days)
    except (ValueError, TypeError):
        return 0


def classify_pair(ca: dict, cb: dict, sim: float, doc_a: dict, doc_b: dict,
                  th: dict, judgement: str | None) -> dict | None:
    num_diff = set(ca["numbers"]) != set(cb["numbers"])
    neg_diff = set(ca["negations"]) != set(cb["negations"])
    differ = num_diff or neg_diff

    if sim >= th["duplicate_sim"] and not differ:
        kind = "duplicate"
    elif sim >= th["conflict_sim"] and differ:
        kind = "contradiction"
    elif th["llm_band_sim"] <= sim < th["conflict_sim"] and differ:
        label = judgement or _offline_judge(ca, cb)
        if label == "contradiction":
            kind = "contradiction"
        elif label == "duplicate":
            kind = "duplicate"
        else:
            return None
    else:
        return None

    base = {
        "type": kind,
        "claim_a": ca["cid"], "claim_b": cb["cid"],
        "text_a": ca["text"], "text_b": cb["text"],
        "doc_a": doc_a["id"], "doc_b": doc_b["id"],
        "sim": round(float(sim), 4), "tie": False,
    }

    if kind == "duplicate":
        trust_gap = abs(doc_a["trust"] - doc_b["trust"])
        conf = _clamp(0.5 * sim + 0.3 + 0.2 * min(1.0, trust_gap / 0.5))
        if doc_a["trust"] <= doc_b["trust"]:
            loser_doc, loser_claim = doc_a, ca
        else:
            loser_doc, loser_claim = doc_b, cb
        base.update({
            "confidence": conf,
            "proposal": {"kind": "remove", "doc_id": loser_doc["id"],
                         "old_sentence": loser_claim["text"], "new_sentence": None},
            "explanation": f"Near-identical claims (similarity {sim:.2f}); keep the higher-trust copy and remove the duplicate from '{loser_doc['title']}'.",
        })
        return base

    # contradiction -> stale / contradiction / tie subtyping
    if doc_a["doc_date"] <= doc_b["doc_date"]:
        older, older_claim = doc_a, ca
        newer, newer_claim = doc_b, cb
    else:
        older, older_claim = doc_b, cb
        newer, newer_claim = doc_a, ca
    if doc_a["doc_date"] == doc_b["doc_date"] and doc_a["trust"] < doc_b["trust"]:
        older, older_claim, newer, newer_claim = doc_a, ca, doc_b, cb
    gap_days = _date_gap_days(doc_a["doc_date"], doc_b["doc_date"])

    if gap_days > th["stale_days"] and newer["trust"] >= 0.8 * older["trust"]:
        conf = _clamp(0.35 * sim + 0.30 * min(1.0, gap_days / 730)
                      + 0.35 * min(1.0, max(0.0, newer["trust"] - older["trust"] + 0.5)) + 0.25)
        base.update({
            "type": "stale", "confidence": conf,
            "proposal": {"kind": "replace", "doc_id": older["id"], "old_sentence": older_claim["text"],
                         "new_sentence": newer_claim["text"]},
            "explanation": f"Dates are {gap_days} days apart and the newer source is trusted: replace the stale sentence in '{older['title']}' with the newer one.",
        })
        return base

    trust_gap = abs(doc_a["trust"] - doc_b["trust"])
    if trust_gap >= th["winner_trust_gap"]:
        if doc_a["trust"] > doc_b["trust"]:
            winner_doc, winner_claim, loser_doc, loser_claim = doc_a, ca, doc_b, cb
        else:
            winner_doc, winner_claim, loser_doc, loser_claim = doc_b, cb, doc_a, ca
        basis = "higher trust"
    elif gap_days >= th["winner_date_gap_days"]:
        winner_doc, winner_claim, loser_doc, loser_claim = newer, newer_claim, older, older_claim
        basis = "newer date"
    else:  # genuine tie: always to a human, never dismissed, never auto-applied
        base.update({
            "tie": True,
            "confidence": _clamp(max(0.40, 0.35 * sim)),
            "proposal": {"kind": "none"},
            "explanation": f"Genuine tie (trust gap {trust_gap:.2f} < {th['winner_trust_gap']}, date gap {gap_days} days < {th['winner_date_gap_days']}): no deterministic winner — a human must decide.",
        })
        return base

    conf = _clamp(max(0.40, 0.35 * sim + 0.45 * min(1.0, trust_gap / 0.5) + 0.20 * min(1.0, gap_days / 365)))
    base.update({
        "confidence": conf,
        "proposal": {"kind": "replace", "doc_id": loser_doc["id"], "old_sentence": loser_claim["text"],
                     "new_sentence": winner_claim["text"]},
        "explanation": f"Contradictory claims resolved by {basis}: align '{loser_doc['title']}' with '{winner_doc['title']}' ({winner_claim['text'][:80]}...).",
    })
    return base


def unsupported_finding(claim: dict, doc: dict) -> dict:
    conf = _clamp(0.55 + 0.4 * (1.0 - doc["trust"]))
    return {
        "type": "unsupported",
        "claim_a": claim["cid"], "claim_b": None,
        "text_a": claim["text"], "text_b": None,
        "doc_a": doc["id"], "doc_b": None,
        "sim": None, "tie": False,
        "confidence": conf,
        "proposal": {"kind": "remove", "doc_id": doc["id"], "old_sentence": claim["text"], "new_sentence": None},
        "explanation": f"Absolute/authority phrasing with no citation marker (source trust {doc['trust']:.2f}): remove the sentence or add a reference.",
    }


# --- The scan ----------------------------------------------------------------------------

async def run_scan(actor: str, database=None) -> dict:
    dbh = database if database is not None else db
    t0 = time.perf_counter()
    settings = await get_settings()
    th = settings["thresholds"]
    auto_enabled = settings["auto_apply_enabled"]

    indexing = await index_changed_docs(actor, database=database)

    claims = await dbh.claims.find({}).to_list(50000)
    docs = {d["id"]: d for d in (await dbh.docs.find({"status": "active"}).to_list(20000))}
    claims = [c for c in claims if c["doc_id"] in docs]
    space = TfidfSpace.from_doc(await dbh.index_state.find_one({"_id": "tfidf"}) or {})

    candidates = _candidate_pairs(claims, space, int(th["knn_k"]), float(th["llm_band_sim"]))

    # LLM judge (label only) for ambiguous pairs in the 0.45..0.60 band. Capped and
    # serialized: free-tier quotas return 429 under a burst, and every pair falls back to
    # the offline Jaccard judge when no label comes back.
    band = [(i, j, s) for i, j, s in candidates if float(th["llm_band_sim"]) <= s < float(th["conflict_sim"])]
    judgements: dict[tuple[int, int], str | None] = {}
    if band and llm.provider() != "offline":
        import asyncio
        sem = asyncio.Semaphore(3)

        async def _judge(i: int, j: int):
            async with sem:
                return await llm.judge_pair(claims[i]["text"], claims[j]["text"])

        capped = sorted(band, key=lambda t: -t[2])[:LLM_JUDGE_MAX]
        results = await asyncio.gather(*[_judge(i, j) for i, j, _ in capped])
        judgements = {(i, j): (r or {}).get("label") for (i, j, _), r in zip(capped, results)}

    findings: list[dict] = []
    for i, j, sim in candidates:
        doc_a, doc_b = docs[claims[i]["doc_id"]], docs[claims[j]["doc_id"]]
        classified = classify_pair(claims[i], claims[j], sim, doc_a, doc_b, th, judgements.get((i, j)))
        if classified:
            findings.append(classified)

    for c in claims:  # unsupported claims (spec 8.5)
        if injection.is_unsupported(c["text"]):
            findings.append(unsupported_finding(c, docs[c["doc_id"]]))

    # Content-hash ids: re-scans never duplicate resolved findings (spec 8.8).
    terminal = {c["id"] async for c in dbh.conflicts.find(
        {"status": {"$nin": ["open", "dismissed"]}}, {"id": 1})}
    await dbh.conflicts.delete_many({"status": {"$in": ["open", "dismissed"]}})

    applied, awaiting, dismissed = 0, 0, 0
    to_insert: dict[str, dict] = {}  # keyed by content-hash id: dedupes within one scan
    for f in findings:
        fid = _pair_id(f["type"], f["text_a"], f["text_b"]) if f["type"] != "unsupported" else _unsupported_id(f["text_a"])
        if fid in terminal or fid in to_insert:
            continue  # already resolved in an earlier scan, or an identical finding this scan
        f["id"] = fid
        doc_a, doc_b = docs[f["doc_a"]], docs.get(f.get("doc_b") or "", {})
        f["doc_a_title"] = doc_a["title"]
        f["doc_b_title"] = doc_b.get("title")
        f["trust_a"], f["trust_b"] = doc_a["trust"], doc_b.get("trust")
        f["date_a"], f["date_b"] = doc_a["doc_date"], doc_b.get("doc_date")
        f["created"] = datetime.now(timezone.utc).isoformat()

        if f["tie"]:
            f["route"], f["status"] = "human", "open"  # ties ALWAYS go to a human, never dismissed
            awaiting += 1
        elif f["confidence"] >= float(th["auto_apply"]):
            f["route"] = "auto"
            if auto_enabled and f["proposal"].get("kind") != "none":
                try:
                    p = f["proposal"]
                    doc = await dbh.docs.find_one({"id": p["doc_id"]})
                    lineage = {"conflict_id": fid, "type": f["type"], "decision": "auto",
                               "confidence": f["confidence"], "keep": False}
                    await _apply_doc_edit(doc, p["old_sentence"], p.get("new_sentence"),
                                          "auto-healer", f"auto-fix {f['type']}", lineage, database=database)
                    f["status"] = "auto_applied"
                    applied += 1
                except Exception as exc:  # fail gracefully: route to human instead
                    f["route"], f["status"] = "human", "open"
                    f["explanation"] += f" [auto-apply failed: {exc}]"
                    awaiting += 1
            else:
                f["status"], awaiting = "open", awaiting + 1
        elif f["confidence"] >= float(th["human_min"]):
            f["route"], f["status"] = "human", "open"
            awaiting += 1
        else:
            f["route"], f["status"] = "dismissed", "dismissed"
            dismissed += 1
        to_insert[fid] = f

    if to_insert:
        # ordered=False so one unexpected duplicate can never abort the whole scan
        await dbh.conflicts.insert_many([dict(f) for f in to_insert.values()], ordered=False)

    seconds = round(time.perf_counter() - t0, 3)
    run = {
        "id": str(uuid.uuid4()), "ts": datetime.now(timezone.utc).isoformat(), "actor": actor,
        "claims": len(claims), "pairs": len(candidates), "seconds": seconds,
        "found": len(to_insert),
        "auto_fixed": applied, "awaiting_human": awaiting, "dismissed": dismissed,
        "reindexed_docs": indexing["reindexed_docs"],
    }
    await dbh.scan_runs.insert_one(run.copy())
    await append_audit(actor, "scan", "kb",
                       {"found": run["found"], "auto_fixed": run["auto_fixed"],
                        "pairs": run["pairs"], "seconds": seconds}, database=database)
    run.pop("_id", None)
    return run
