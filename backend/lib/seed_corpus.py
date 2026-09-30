"""Reproducible demo corpus (~70 documents) with labeled faults (spec 12):
contradictions (incl. paraphrased pairs with number words to exercise the embedding path),
duplicates, stale pairs, unsupported claims, injection attacks, benign instruction-like
hard negatives, and clean documents. Deterministic — no randomness. Labels land in
`eval_labels` and drive the evaluation module."""

from lib import ingest
from lib.injection import BENIGN_INSTRUCTION_LIKE, RED_TEAM_PAYLOADS
from lib.db import db


def _d(title: str, source_type: str, date: str, substantive: list[str], filler: str) -> dict:
    # Fillers are deliberately < 5 words so only substantive sentences become claims.
    return {"title": title, "source_type": source_type, "doc_date": date,
            "text": f"{filler} " + " ".join(substantive)}


CLEAN = [
    ("Travel Booking Standard", "signed_policy", "2025-04-02",
     ["Airfare must be booked through the corporate travel portal.",
      "Hotel reimbursement is capped at 180 dollars per night.",
      "Original receipts are required for every reimbursement claim."], "Finance owns this."),
    ("Remote Work Agreement", "official_wiki", "2025-03-15",
     ["Remote work requires a signed agreement on file with HR.",
      "Core collaboration hours are 10:00 to 15:00 in your local time zone.",
      "Employees working remotely must attend the weekly team sync."], "HR owns this."),
    ("Expense Report Guide", "official_wiki", "2025-05-20",
     ["Expense reports must be submitted within 60 days of the trip.",
      "Each report needs a business purpose and a cost center code.",
      "Missing receipts above 25 dollars require a manager exception."], "Finance owns this."),
    ("Device Encryption Policy", "signed_policy", "2025-01-10",
     ["Every company laptop must have full-disk encryption enabled.",
      "IT verifies encryption status during the quarterly compliance scan.",
      "Unencrypted devices are blocked from the corporate network."], "Security owns this."),
    ("Visitor Access Rules", "official_wiki", "2025-02-28",
     ["Visitors must register at reception before entering secured floors.",
      "A badge-holding employee must escort visitors at all times.",
      "Visitor badges expire at the end of the scheduled visit."], "Facilities owns this."),
    ("Onboarding Checklist", "team_wiki", "2025-06-01",
     ["New hires receive their laptop on the first day of employment.",
      "Account provisioning completes within three business days.",
      "The buddy program pairs each new hire with an experienced colleague."], "People ops owns this."),
    ("Quarterly Planning Notes", "team_wiki", "2025-04-18",
     ["Each squad drafts quarterly objectives in the planning template.",
      "Objectives are reviewed with the group lead before finalizing.",
      "Progress is checked during the mid-quarter checkpoint."], "Ops owns this."),
    ("Data Retention Summary", "signed_policy", "2025-03-01",
     ["Customer records are retained for seven years after account closure.",
      "Marketing data is deleted 24 months after the last consent.",
      "Retention overrides require a written legal review."], "Legal owns this."),
    ("Support Ticket Flow", "official_wiki", "2025-07-07",
     ["Tickets enter the triage queue and are classified by severity.",
      "Severity one incidents page the on-call engineer immediately.",
      "Resolved tickets require a root-cause note before closing."], "Support owns this."),
    ("Meeting Room Booking", "team_wiki", "2025-05-05",
     ["Rooms are booked through the calendar system only.",
      "Bookings over four hours need facilities approval.",
      "No-show rooms are released after 15 minutes."], "Facilities owns this."),
    ("Vendor Onboarding Steps", "official_wiki", "2025-08-12",
     ["Vendors complete a security questionnaire before contract signature.",
      "Procurement reviews pricing and renewal terms annually.",
      "Vendor access is revoked on the contract end date."], "Procurement owns this."),
    ("Badge Replacement Process", "team_wiki", "2025-06-20",
     ["Lost badges are reported to security within one business day.",
      "Replacement badges cost 15 dollars unless reported stolen.",
      "Temporary badges are valid for five days."], "Security owns this."),
    ("Customer Refund FAQ", "official_wiki", "2025-09-01",
     ["Refund requests are answered within five business days.",
      "Partial refunds apply to opened software packages.",
      "Gift returns are issued as store credit."], "Support owns this."),
    ("Print Server Migration", "team_wiki", "2025-02-10",
     ["The legacy print server is scheduled for migration in Q4.",
      "Departments are migrated office by office to limit disruption.",
      "Print drivers are preinstalled on the new golden image."], "IT owns this."),
    ("Conference Travel Rules", "email", "2025-04-25",
     ["Conference attendance needs manager and budget approval.",
      "Speaking attendees register at the early-bird rate.",
      "Trip reports are shared with the team after the event."], "Comms owns this."),
    ("Parking Permits", "team_wiki", "2025-07-15",
     ["Parking permits are allocated by seniority each January.",
      "The waiting list is reviewed at the end of every quarter.",
      "Carpool vehicles receive priority spaces near the lobby."], "Facilities owns this."),
]

# Contradiction pairs: (title_a, src_a, date_a, claim_a, title_b, src_b, date_b, claim_b, filler)
# Pairs 1-5 are lexically close (the offline TF-IDF path detects them). Pair 6 is a
# deliberate TIE (same source type, <30 days apart, equal trust) so the review queue
# always has a human-only decision. Pairs 7-8 are PARAPHRASED with number words: they
# exercise the embedding path and are expected misses in offline mode (see README).
CONTRADICTION_PAIRS = [
    ("Refund Window Policy", "official_wiki", "2025-02-10",
     "Refund requests are accepted within 30 days of the purchase date.",
     "Refund Window Chat Summary", "chat", "2025-03-01",
     "Refund requests are accepted within 90 days of the purchase date.", "Support owns this."),
    ("Password Length Rule", "official_wiki", "2025-01-20",
     "Account passwords must contain at least 12 characters to be accepted.",
     "Password Tip Thread", "chat", "2025-01-28",
     "Account passwords must contain at least 6 characters to be accepted.", "Security owns this."),
    ("VPN Requirement", "signed_policy", "2025-03-05",
     "Remote employees must connect through the company VPN at all times.",
     "VPN Workaround Thread", "chat", "2025-03-12",
     "Remote employees must not connect through the company VPN at all times.", "IT owns this."),
    ("Onboarding Document Deadline", "official_wiki", "2025-04-01",
     "New hires must submit their onboarding documents within 7 days of the start date.",
     "Onboarding Advice Thread", "email", "2025-04-08",
     "New hires must submit their onboarding documents within 30 days of the start date.", "People ops owns this."),
    ("Meal Reimbursement Cap", "signed_policy", "2025-05-10",
     "Employee meals are reimbursed up to 45 dollars for each travel day.",
     "Meal Cap Question", "chat", "2025-05-14",
     "Employee meals are reimbursed up to 25 dollars for each travel day.", "Finance owns this."),
    # genuine TIE — equal trust (both team_wiki) and only 7 days apart
    ("Review Cycle Cadence", "team_wiki", "2025-06-02",
     "Performance review cycles are scheduled every 90 days for every squad.",
     "Review Cadence Note", "team_wiki", "2025-06-09",
     "Performance review cycles are scheduled every 60 days for every squad.", "Ops owns this."),
    # paraphrased hard cases (number words, reworded) — embedding-path territory
    ("Storage Quota", "email", "2025-07-03",
     "Storage quota per employee is fifty gigabytes.",
     "Storage Quota Reply", "email", "2025-07-07",
     "Each member of staff receives one hundred gigabytes of disk space.", "IT owns this."),
    ("Hardware Warranty Term", "official_wiki", "2025-08-01",
     "The hardware warranty covers replacement parts for two years.",
     "Warranty Discussion", "chat", "2025-08-05",
     "Laptops carry a five year guarantee on component replacement.", "Procurement owns this."),
]

# Duplicate pairs: (title_a, src_a, date_a, claim, title_b, src_b, date_b) — near-verbatim.
DUPLICATE_PAIRS = [
    ("Badge In And Out Rule", "official_wiki", "2025-02-15",
     "Employees must badge in and out of every secured area.",
     "Badge Rule Chat Copy", "chat", "2025-02-20"),
    ("Helpdesk Single Entry Point", "official_wiki", "2025-03-03",
     "The helpdesk portal is the single entry point for IT requests.",
     "IT Request Forward", "email", "2025-03-06"),
    ("Expense Submission Window", "signed_policy", "2025-01-30",
     "Expenses must be submitted within 60 days of the trip.",
     "Expense Window Note", "team_wiki", "2025-02-02"),
    ("Two Factor Mandatory", "signed_policy", "2025-04-14",
     "Two-factor authentication is mandatory for remote access.",
     "Two Factor Chat Snippet", "chat", "2025-04-16"),
    ("Data Center Escorts", "official_wiki", "2025-05-22",
     "Visitors must be escorted at all times inside the data center.",
     "Data Center Tour Notes", "team_wiki", "2025-05-25"),
    ("Security Training Deadline", "official_wiki", "2025-06-30",
     "Annual security training must be completed by December 31.",
     "Training Deadline Email", "email", "2025-07-02"),
]

# Stale pairs: (title_a, src_a, date_a, older claim, title_b, src_b, date_b, newer claim)
STALE_PAIRS = [
    ("401k Match Summary 2023", "team_wiki", "2023-01-10",
     "The company matches 401k contributions up to 4 percent.",
     "401k Match Policy 2025", "official_wiki", "2025-06-01",
     "The company matches 401k contributions up to 6 percent."),
    ("Remote Day Allowance 2023", "email", "2023-03-15",
     "Remote work allowance is limited to 10 days per year.",
     "Remote Work Policy 2025", "signed_policy", "2025-07-01",
     "Remote work is allowed up to 60 days per year."),
    ("Support SLA 2022", "chat", "2022-11-01",
     "The support SLA promises a response within 72 hours.",
     "Support SLA 2025", "official_wiki", "2025-05-01",
     "The support SLA promises a first response within 8 hours."),
    ("Paid Leave 2023", "team_wiki", "2023-06-01",
     "Employees receive 15 days of paid leave per year.",
     "Paid Leave Policy 2025", "signed_policy", "2025-08-01",
     "Employees receive 25 days of paid leave per year."),
    ("Laptop Refresh 2023", "official_wiki", "2023-09-01",
     "Laptop replacements occur every 4 years.",
     "Laptop Refresh Policy 2025", "signed_policy", "2025-09-01",
     "Laptop replacements occur every 3 years."),
]

UNSUPPORTED = [
    ("Productivity Claims Memo", "team_wiki", "2025-03-20",
     ["Studies show that open-plan offices raise productivity by 15 percent."], "Ops owns this."),
    ("CRM Retirement Rumor", "chat", "2025-04-11",
     ["Everyone knows the legacy CRM will be retired next year."], "IT owns this."),
    ("Work Week Opinions", "email", "2025-05-02",
     ["Experts agree that four-day weeks improve retention."], "People ops owns this."),
    ("Office Health Notes", "team_wiki", "2025-05-18",
     ["It is proven that standing desks reduce sick days."], "Facilities owns this."),
    ("Merger Speculation", "chat", "2025-06-25",
     ["It is widely known that the merger closes in March."], "Legal owns this."),
    ("Onboarding Bragging", "official_wiki", "2025-07-22",
     ["Research proves our onboarding is the best in the industry."], "People ops owns this."),
]

BENIGN_DOCS = [
    (f"Benign Instruction {i + 1}", src, "2025-06-15", [s], "Reference snippet.")
    for i, (src, s) in enumerate([
        ("team_wiki", BENIGN_INSTRUCTION_LIKE[0]),
        ("team_wiki", BENIGN_INSTRUCTION_LIKE[1]),
        ("signed_policy", BENIGN_INSTRUCTION_LIKE[2]),
        ("official_wiki", BENIGN_INSTRUCTION_LIKE[3]),
        ("email", BENIGN_INSTRUCTION_LIKE[4]),
        ("team_wiki", BENIGN_INSTRUCTION_LIKE[5]),
        ("official_wiki", BENIGN_INSTRUCTION_LIKE[6]),
        ("email", BENIGN_INSTRUCTION_LIKE[7]),
    ])
]


def build_corpus() -> tuple[list[dict], list[dict]]:
    """Returns (docs, labels). Labels use doc titles; load_demo resolves ids."""
    docs: list[dict] = []
    labels: list[dict] = []

    for title, src, date, sentences, filler in CLEAN:
        docs.append(_d(title, src, date, sentences, filler))

    for title_a, src_a, date_a, claim_a, title_b, src_b, date_b, claim_b, filler in CONTRADICTION_PAIRS:
        docs.append(_d(title_a, src_a, date_a, [claim_a], filler))
        docs.append(_d(title_b, src_b, date_b, [claim_b], filler))
        labels.append({"kind": "contradiction", "doc_a": title_a, "doc_b": title_b,
                       "claim_a": claim_a, "claim_b": claim_b})

    for title_a, src_a, date_a, claim, title_b, src_b, date_b in DUPLICATE_PAIRS:
        filler_a, filler_b = "Policy text follows.", "Copied snippet follows."
        docs.append(_d(title_a, src_a, date_a, [claim], filler_a))
        docs.append(_d(title_b, src_b, date_b, [claim], filler_b))
        labels.append({"kind": "duplicate", "doc_a": title_a, "doc_b": title_b,
                       "claim_a": claim, "claim_b": claim})

    for title_a, src_a, date_a, older, title_b, src_b, date_b, newer in STALE_PAIRS:
        docs.append(_d(title_a, src_a, date_a, [older], "Archived page."))
        docs.append(_d(title_b, src_b, date_b, [newer], "Current page."))
        labels.append({"kind": "stale", "doc_a": title_a, "doc_b": title_b,
                       "claim_a": older, "claim_b": newer})

    for title, src, date, sentences, filler in UNSUPPORTED:
        docs.append(_d(title, src, date, sentences, filler))
        labels.append({"kind": "unsupported", "doc_a": title, "claim_a": sentences[0]})

    for i, payload in enumerate(RED_TEAM_PAYLOADS):
        title = f"Attack Sample — {payload['label']}"
        docs.append({"title": title, "source_type": "email", "doc_date": "2025-10-01",
                     "text": payload["text"]})
        labels.append({"kind": "injection", "doc_a": title, "held_out": i % 2 == 1})

    for i, (title, src, date, sentences, filler) in enumerate(BENIGN_DOCS):
        docs.append(_d(title, src, date, sentences, filler))
        labels.append({"kind": "benign", "doc_a": title})

    return docs, labels


async def load_demo(actor: str, database=None) -> dict:
    """Idempotent demo-corpus load: skips titles that already exist, (re)builds labels."""
    dbh = database if database is not None else db
    docs, labels = build_corpus()
    title_to_id = {d["title"]: d["id"] async for d in dbh.docs.find({}, {"title": 1, "id": 1})}
    ingested = quarantined = 0
    for d in docs:
        if d["title"] in title_to_id:
            continue
        res = await ingest.ingest_document(d["title"], d["text"], d["source_type"], actor,
                                           doc_date=d["doc_date"], demo=True, database=database)
        title_to_id[d["title"]] = res["doc"]["id"]
        ingested += 1
        quarantined += 1 if res["injection"]["flagged"] else 0

    resolved: list[dict] = []
    for l in labels:
        doc_a = title_to_id.get(l["doc_a"])
        if not doc_a:
            continue
        entry = {"kind": l["kind"], "doc_a": doc_a,
                 "doc_b": title_to_id.get(l["doc_b"]) if l.get("doc_b") else None,
                 "claim_a": l.get("claim_a"), "claim_b": l.get("claim_b"),
                 "held_out": bool(l.get("held_out"))}
        resolved.append(entry)

    await dbh.eval_labels.delete_many({})
    if resolved:
        await dbh.eval_labels.insert_many(resolved)

    total_docs = await dbh.docs.count_documents({})
    from lib.ledger import append_audit
    await append_audit(actor, "demo_load", "kb", {"ingested": ingested, "labels": len(resolved)}, database=database)
    return {"ingested": ingested, "quarantined": quarantined, "labels": len(resolved), "docs_total": total_docs}
