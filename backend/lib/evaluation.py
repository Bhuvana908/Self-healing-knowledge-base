"""Evaluation (spec 12): P/R/F1 per fault type with 95% bootstrap CIs, false-positive
rate on clean documents, per-split metrics for imported datasets (60/20/20 tune/validate/
test — the test slice is never used for tuning), and a scale benchmark with planted
near-duplicates run on a throwaway database. Demo-corpus scores are NOT production
accuracy, and the UI states this verbatim."""

import random
import time
import uuid
from datetime import datetime, timezone

from lib import detect, ingest
from lib.db import client, db
from lib.ledger import append_audit

DISCLAIMER = ("Scores are measured only on the labeled slice of the knowledge base. Real-world "
              "documents have no ground-truth labels, so unlabeled documents are ingested and "
              "scanned but never scored — these numbers are a test-set signal, not live "
              "production accuracy.")
IMPORTED_NOTE = ("Imported-dataset scores are computed on your own labeled documents, split "
                 "deterministically 60/20/20; the test slice is never used for tuning.")

MATCH_STATUSES = {"open", "hold", "auto_applied", "accepted", "synthesized", "kept_both", "rolled_back"}
FAULT_TYPES = ["contradiction", "duplicate", "stale", "unsupported"]


def _bootstrap_ci(tp: int, fp: int, fn: int, iters: int = 400, seed: int = 42) -> dict:
    rng = random.Random(seed)
    recall_pool = [1] * tp + [0] * fn
    precision_pool = [1] * tp + [0] * fp
    ps, rs, fs = [], [], []
    for _ in range(iters):
        p = sum(rng.choice(precision_pool) for _ in precision_pool) / len(precision_pool) if precision_pool else 0.0
        r = sum(rng.choice(recall_pool) for _ in recall_pool) / len(recall_pool) if recall_pool else 0.0
        f1 = 2 * p * r / (p + r) if (p + r) else 0.0
        ps.append(p)
        rs.append(r)
        fs.append(f1)

    def ci(values: list[float]) -> list[float]:
        values.sort()
        lo = values[max(0, int(0.025 * len(values)))]
        hi = values[min(len(values) - 1, int(0.975 * len(values)))]
        return [round(lo, 3), round(hi, 3)]

    return {"precision": ci(ps), "recall": ci(rs), "f1": ci(fs)}


def _metrics(tp: int, fp: int, fn: int) -> dict:
    p = tp / (tp + fp) if (tp + fp) else 0.0
    r = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * p * r / (p + r) if (p + r) else 0.0
    return {
        "precision": round(p, 3), "recall": round(r, 3), "f1": round(f1, 3),
        "tp": tp, "fp": fp, "fn": fn,
        "ci": _bootstrap_ci(tp, fp, fn),
    }


def _pair_match(finding: dict, label: dict) -> bool:
    if finding["type"] != label["kind"]:
        return False
    return {finding.get("doc_a"), finding.get("doc_b")} == {label.get("doc_a"), label.get("doc_b")}


def _score(labels: list[dict], conflicts: list[dict], quarantined: set[str]) -> tuple[dict, float]:
    """Per-type metrics + the false-positive rate on clean/benign documents.

    Findings are scoped to the documents this label set actually covers — otherwise an
    imported dataset would count every demo-corpus finding as its own false positive.
    """
    scope: set[str] = set()
    for l in labels:
        scope.add(l.get("doc_a"))
        if l.get("doc_b"):
            scope.add(l["doc_b"])
    scope.discard(None)

    in_scope = [
        c for c in conflicts
        if c.get("doc_a") in scope and (c.get("doc_b") is None or c.get("doc_b") in scope)
    ]

    per_type: dict[str, dict] = {}
    for kind in FAULT_TYPES:
        klabels = [l for l in labels if l["kind"] == kind]
        kfindings = [c for c in in_scope if c["type"] == kind]
        if not klabels and not kfindings:
            continue
        matched_labels: set[int] = set()
        matched_findings: set[int] = set()
        for fi, f in enumerate(kfindings):
            for li, l in enumerate(klabels):
                if li in matched_labels:
                    continue
                if _pair_match(f, l):
                    matched_labels.add(li)
                    matched_findings.add(fi)
                    break
        per_type[kind] = _metrics(len(matched_labels), len(kfindings) - len(matched_findings),
                                  len(klabels) - len(matched_labels))

    inj_labels = [l for l in labels if l["kind"] == "injection"]
    if inj_labels:
        labeled_inj = {l["doc_a"] for l in inj_labels}
        inj_tp = sum(1 for l in inj_labels if l["doc_a"] in quarantined)
        inj_fp = len([q for q in quarantined if q in scope and q not in labeled_inj])
        per_type["injection"] = _metrics(inj_tp, inj_fp, len(inj_labels) - inj_tp)

        held = [l for l in inj_labels if l.get("held_out")]
        if held:
            htp = sum(1 for l in held if l["doc_a"] in quarantined)
            per_type["held_out_injection"] = _metrics(htp, inj_fp, len(held) - htp)

    benign = [l for l in labels if l["kind"] == "benign"]
    fpr = (sum(1 for l in benign if l["doc_a"] in quarantined) / len(benign)) if benign else 0.0
    return per_type, round(fpr, 4)


async def run_evaluation(actor: str) -> dict:
    labels = await db.eval_labels.find().to_list(20000)
    if not labels:
        raise ValueError("No labeled data — load the demo corpus (Dashboard) or import a labeled dataset (Admin)")

    conflicts = [c for c in (await db.conflicts.find({}).to_list(50000)) if c["status"] in MATCH_STATUSES]
    quarantined = {d["id"] for d in (await db.docs.find({"status": "quarantined"}).to_list(20000))}

    labeled_docs: set[str] = set()
    for l in labels:
        labeled_docs.add(l.get("doc_a"))
        if l.get("doc_b"):
            labeled_docs.add(l["doc_b"])
    labeled_docs.discard(None)
    total_docs = await db.docs.count_documents({})
    coverage = {
        "total_docs": total_docs,
        "labeled_docs": len(labeled_docs),
        "unlabeled_docs": max(0, total_docs - len(labeled_docs)),
    }

    demo_labels = [l for l in labels if l.get("source") != "imported"]
    imported = [l for l in labels if l.get("source") == "imported"]

    per_type, fpr = _score(demo_labels or labels, conflicts, quarantined)

    imported_report = None
    if imported:
        i_per_type, i_fpr = _score(imported, conflicts, quarantined)
        per_split = {}
        for split in ("tune", "validate", "test"):
            subset = [l for l in imported if l.get("split") == split]
            if not subset:
                continue
            s_per_type, s_fpr = _score(subset, conflicts, quarantined)
            f1s = [m["f1"] for m in s_per_type.values()]
            per_split[split] = {
                "labels": len(subset),
                "per_type": s_per_type,
                "false_positive_rate": s_fpr,
                "macro_f1": round(sum(f1s) / len(f1s), 3) if f1s else 0.0,
            }
        imported_report = {
            "labels": len(imported),
            "per_type": i_per_type,
            "false_positive_rate": i_fpr,
            "per_split": per_split,
            "note": IMPORTED_NOTE,
        }

    report = {
        "id": str(uuid.uuid4()),
        "ran_at": datetime.now(timezone.utc).isoformat(),
        "per_type": per_type,
        "false_positive_rate": fpr,
        "benchmark": None,
        "labels": len(demo_labels or labels),
        "coverage": coverage,
        "imported": imported_report,
        "disclaimer": DISCLAIMER,
    }
    await db.eval_reports.insert_one(report.copy())
    await append_audit(actor, "evaluation", "kb",
                       {"fpr": report["false_positive_rate"], "imported": bool(imported_report)})
    report.pop("_id", None)
    return report


# --- Scale benchmark (run on a throwaway DB so the live KB is untouched) ------------------

_DEPTS = ["finance", "security", "facilities", "support", "sales", "legal", "people-ops", "it"]
_MONTHS = ["January", "February", "March", "April", "May", "June",
           "July", "August", "September", "October", "November", "December"]
_SOURCES = ["team_wiki", "official_wiki", "email", "chat", "signed_policy"]


def _synthetic_docs(n: int) -> tuple[list[dict], int]:
    """Realistic text with planted near-duplicates so candidate pairs are non-zero."""
    docs: list[dict] = []
    planted = 0
    for i in range(n):
        dept = _DEPTS[i % len(_DEPTS)]
        n1, n2 = 10 + (i * 7) % 90, 5 + (i * 13) % 50
        month = _MONTHS[i % 12]
        s1 = f"The {dept} office processed {n1} requests in {month}."
        body = (f"{s1} Standard review meetings run {n2} minutes every week. "
                f"Records for the {dept} office are retained for seven years. "
                f"Escalations follow the regional escalation path.")
        if i >= 12 and i % 6 == 0:
            j = i - 6
            prior_first = docs[j]["text"].split(". ")[0]
            body = (f"{prior_first} this year. Standard review meetings run {n2} minutes every week. "
                    f"Records for the {dept} office are retained for seven years. "
                    "Escalations follow the regional escalation path.")
            planted += 1
        docs.append({
            "title": f"Ops briefing {i:03d} — {dept}",
            "text": body,
            "source_type": _SOURCES[i % 5],
            "doc_date": f"2025-{(i % 12) + 1:02d}-{(i % 27) + 1:02d}",
        })
    return docs, planted


async def run_benchmark(actor: str, n_docs: int = 300) -> dict:
    bench_name = f"{db.name}_bench"
    bench = client[bench_name]
    try:
        docs, planted = _synthetic_docs(n_docs)
        for d in docs:
            await ingest.ingest_document(d["title"], d["text"], d["source_type"], actor,
                                         doc_date=d["doc_date"], database=bench)
        run = await detect.run_scan(actor, database=bench)
        await append_audit(actor, "benchmark", "kb", {"docs": n_docs, "seconds": run["seconds"]})
        result = {
            "docs": n_docs,
            "claims": run["claims"],
            "candidate_pairs": run["pairs"],
            "found": run["found"],
            "planted_duplicate_pairs": planted,
            "seconds": run["seconds"],
            "ran_at": datetime.now(timezone.utc).isoformat(),
        }
        # attach to the most recent report so the Evaluation page can show it
        latest = await db.eval_reports.find().sort("ran_at", -1).to_list(1)
        if latest:
            await db.eval_reports.update_one({"id": latest[0]["id"]}, {"$set": {"benchmark": result}})
        return result
    finally:
        await client.drop_database(bench_name)
