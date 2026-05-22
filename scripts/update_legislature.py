#!/usr/bin/env python3
"""Poll LegiScan for Arkansas bill changes and update the static site data."""

from __future__ import annotations

import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
TRACKER_PATH = FRONTEND / "tracker-data.json"
VOTES_PATH = FRONTEND / "vote-details.json"
PEOPLE_PATH = FRONTEND / "legislators.json"
CACHE_PATH = FRONTEND / "legiscan-cache.json"
STATUS_PATH = FRONTEND / "automation-status.json"

API_URL = "https://api.legiscan.com/"
STATE = "AR"
REQUEST_DELAY = float(os.getenv("LEGISCAN_REQUEST_DELAY", "0.15"))
MAX_BILLS_PER_RUN = int(os.getenv("LEGISCAN_MAX_BILLS_PER_RUN", "350"))
MAX_ALERTS = int(os.getenv("TRACKER_MAX_ALERTS", "750"))

STATUS_LABELS = {
    "1": "Introduced",
    "2": "Engrossed",
    "3": "Enrolled",
    "4": "Passed",
    "5": "Vetoed",
    "6": "Failed",
}

POLICY_BUCKETS = [
    ("Health Care", ["health", "medicaid", "hospital", "clinic", "doctor", "nurse", "insurance", "mental health", "abortion"]),
    ("Voting Rights", ["election", "voter", "ballot", "polling", "campaign", "initiative petition", "referendum", "redistricting"]),
    ("Agriculture", ["agriculture", "farm", "farmer", "crop", "livestock", "rural", "pesticide", "soil", "water district"]),
    ("Education", ["school", "student", "teacher", "curriculum", "college", "university", "tuition", "voucher", "library"]),
    ("Labor", ["worker", "wage", "employment", "union", "contractor", "unemployment", "workplace", "benefits"]),
    ("Housing", ["housing", "landlord", "tenant", "rent", "eviction", "homeless", "zoning", "property"]),
    ("Criminal Legal System", ["crime", "criminal", "police", "sheriff", "jail", "prison", "sentence", "probation", "parole", "court", "corrections"]),
    ("Civil Rights", ["civil rights", "discrimination", "religious freedom", "gender", "race", "lgbtq", "transgender", "disability"]),
    ("Environment", ["environment", "water", "air", "pollution", "energy", "utility", "climate", "conservation", "waste"]),
    ("Taxes and Budget", ["tax", "budget", "appropriation", "revenue", "fee", "credit", "exemption", "fiscal"]),
    ("Government Operations", ["department", "agency", "commission", "board", "procurement", "records", "ethics"]),
    ("Public Safety", ["emergency", "public safety", "fire", "disaster", "homeland", "military", "veteran"]),
]


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def today() -> str:
    return dt.datetime.now(dt.timezone.utc).date().isoformat()


def read_json(path: Path, default):
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(data, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")


def clean(value) -> str:
    return " ".join(str(value or "").replace("\xa0", " ").split())


def labelize(value) -> str:
    text = clean(value)
    if not text:
        return ""
    return text.replace("_", " ").title()


def normalize_date(value) -> str:
    text = clean(value)
    if not text or text == "0000-00-00":
        return ""
    return text[:10]


def api_request(api_key: str, op: str, **params):
    query = {"key": api_key, "op": op, **params}
    url = f"{API_URL}?{urllib.parse.urlencode(query)}"
    request = urllib.request.Request(url, headers={"User-Agent": "ark-leg-tracker/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"LegiScan HTTP error for {op}: {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"LegiScan network error for {op}: {exc.reason}") from exc

    if payload.get("status") != "OK":
        raise RuntimeError(f"LegiScan returned {payload.get('status') or 'unknown'} for {op}: {payload.get('alert') or payload.get('message') or 'no detail'}")

    time.sleep(REQUEST_DELAY)
    return payload


def current_sessions(api_key: str):
    configured = clean(os.getenv("LEGISCAN_SESSION_IDS"))
    if configured:
        return [{"session_id": int(part.strip()), "session_name": f"Session {part.strip()}"} for part in configured.split(",") if part.strip()]

    payload = api_request(api_key, "getSessionList", state=STATE)
    sessions = payload.get("sessions") or []
    year = int(os.getenv("LEGISCAN_YEAR") or dt.datetime.now().year)
    include_prior = os.getenv("LEGISCAN_INCLUDE_PRIOR_SESSIONS", "").lower() in {"1", "true", "yes"}

    selected = []
    for session in sessions:
        start = int(session.get("year_start") or 0)
        end = int(session.get("year_end") or start)
        prior = int(session.get("prior") or 0)
        if start <= year <= end and (include_prior or not prior):
            selected.append(session)

    if selected:
        return selected

    active = [session for session in sessions if not int(session.get("prior") or 0)]
    return active[:1] or sessions[:1]


def masterlist_items(payload):
    master = payload.get("masterlist") or {}
    return [
        item for item in master.values()
        if isinstance(item, dict) and item.get("bill_id") and item.get("change_hash")
    ]


def classify_bucket(title: str, description: str) -> str:
    haystack = f"{title} {description}".lower()
    for name, keywords in POLICY_BUCKETS:
        if any(keyword in haystack for keyword in keywords):
            return name
    return "Unbucketed"


def classify_action(action: str) -> str:
    text = action.lower()
    if "amend" in text:
        return "amendment"
    if "committee" in text or "referred" in text:
        return "committee"
    if "calendar" in text:
        return "calendar"
    if "passed" in text or "adopted" in text:
        return "passed"
    if "act " in text or "enacted" in text or "signed" in text:
        return "enacted"
    if "filed" in text:
        return "filed"
    return "action"


def vote_result(vote) -> str:
    if str(vote.get("passed")) == "1" or vote.get("passed") is True:
        return "passed"
    if str(vote.get("passed")) == "0":
        return "failed"
    return clean(vote.get("result")) or "recorded"


def vote_other_count(vote) -> int:
    return int(vote.get("nv") or 0) + int(vote.get("absent") or 0)


def bill_sort_key(bill):
    number = clean(bill.get("bill_number"))
    prefix = "".join(ch for ch in number if not ch.isdigit())
    digits = "".join(ch for ch in number if ch.isdigit())
    return (
        bill.get("last_action_date") or bill.get("status_date") or "",
        bill.get("session") or "",
        prefix,
        int(digits or 0),
    )


def transform_bill(raw, existing=None):
    existing = existing or {}
    session = raw.get("session") or {}
    title = clean(raw.get("title")) or clean(raw.get("description")) or clean(raw.get("bill_number"))
    description = clean(raw.get("description")) or title
    state_link = clean(raw.get("state_link")) or clean(raw.get("url"))

    history = raw.get("history") or []
    actions = []
    for item in sorted(history, key=lambda row: normalize_date(row.get("date")), reverse=True):
        action = clean(item.get("action"))
        if not action:
            continue
        actions.append({
            "action_date": normalize_date(item.get("date")),
            "description": action,
            "classification": classify_action(action),
            "organization": clean(item.get("chamber")),
            "source_url": state_link,
        })

    texts = []
    for item in sorted(raw.get("texts") or [], key=lambda row: normalize_date(row.get("date")), reverse=True):
        texts.append({
            "version_label": clean(item.get("type")) or "Bill text",
            "document_date": normalize_date(item.get("date")),
            "url": clean(item.get("state_link")) or clean(item.get("url")),
            "mime_type": clean(item.get("mime")),
        })

    amendments = []
    for item in sorted(raw.get("amendments") or [], key=lambda row: normalize_date(row.get("date")), reverse=True):
        status = "adopted" if str(item.get("adopted")) == "1" else "filed"
        amendments.append({
            "amendment_label": clean(item.get("title")) or clean(item.get("description")) or "Amendment",
            "description": clean(item.get("description")) or clean(item.get("title")),
            "status": status,
            "document_date": normalize_date(item.get("date")),
            "url": clean(item.get("state_link")) or clean(item.get("url")),
            "review_status": "new",
        })

    votes = []
    for item in sorted(raw.get("votes") or [], key=lambda row: normalize_date(row.get("date")), reverse=True):
        votes.append({
            "vote_date": normalize_date(item.get("date")),
            "motion": clean(item.get("desc")) or "Roll call",
            "result": vote_result(item),
            "organization": clean(item.get("chamber")),
            "yes_count": int(item.get("yea") or 0),
            "no_count": int(item.get("nay") or 0),
            "other_count": vote_other_count(item),
            "source_url": clean(item.get("state_link")) or clean(item.get("url")),
        })

    status_code = str(raw.get("status") or "")
    status_label = labelize(STATUS_LABELS.get(status_code) or raw.get("status_desc") or status_code or "Unknown")
    bucket = clean(existing.get("primary_bucket")) or classify_bucket(title, description)

    result = {
        "id": existing.get("id") or int(raw.get("bill_id") or 0),
        "jurisdiction": "Arkansas",
        "session": clean(session.get("session_title")) or clean(session.get("session_name")) or clean(raw.get("session_title")) or "",
        "bill_number": clean(raw.get("bill_number")),
        "title": title,
        "description": description,
        "chamber": clean(raw.get("body")) or clean(raw.get("current_body")),
        "status": status_code,
        "status_date": normalize_date(raw.get("status_date")),
        "state_link": state_link,
        "legiscan_bill_id": str(raw.get("bill_id") or ""),
        "openstates_bill_id": existing.get("openstates_bill_id"),
        "primary_bucket": bucket,
        "priority": clean(existing.get("priority")) or "normal",
        "stance": clean(existing.get("stance")) or "unknown",
        "organizing_status": clean(existing.get("organizing_status")) or "research_needed",
        "owner": existing.get("owner", ""),
        "manual_summary": existing.get("manual_summary", ""),
        "internal_notes": existing.get("internal_notes", ""),
        "last_action": clean(raw.get("last_action")) or (actions[0]["description"] if actions else ""),
        "last_action_date": normalize_date(raw.get("last_action_date")) or (actions[0]["action_date"] if actions else ""),
        "status_label": status_label,
        "actions": actions,
        "amendments": amendments,
        "texts": texts,
        "votes": votes,
    }
    result["counts"] = {
        "actions": len(actions),
        "amendments": len(amendments),
        "texts": len(texts),
        "votes": len(votes),
    }
    return result


def transform_person(person):
    return {
        "people_id": str(person.get("people_id") or ""),
        "name": clean(person.get("name")),
        "first_name": clean(person.get("first_name")),
        "last_name": clean(person.get("last_name")),
        "district": clean(person.get("district")),
        "role": clean(person.get("role")),
        "party_id": str(person.get("party_id") or ""),
        "party": clean(person.get("party")),
        "committee_sponsor": int(person.get("committee_sponsor") or 0),
        "committee_id": str(person.get("committee_id") or ""),
    }


def transform_roll_call(raw, bill, people_by_id, local_vote_id):
    member_votes = []
    for vote in raw.get("votes") or []:
        person = people_by_id.get(str(vote.get("people_id") or ""), {})
        member_votes.append({
            "people_id": str(vote.get("people_id") or ""),
            "name": person.get("name") or "",
            "district": person.get("district") or "",
            "role": person.get("role") or "",
            "party_id": person.get("party_id") or "",
            "vote_text": clean(vote.get("vote_text")),
            "vote_id": int(vote.get("vote_id") or 0),
        })

    return {
        "roll_call_id": str(raw.get("roll_call_id") or ""),
        "local_vote_id": local_vote_id,
        "bill_number": bill.get("bill_number") or "",
        "bill_title": bill.get("title") or "",
        "session": bill.get("session") or "",
        "date": normalize_date(raw.get("date")),
        "motion": clean(raw.get("desc")) or "Roll call",
        "result": vote_result(raw),
        "chamber": clean(raw.get("chamber")),
        "yes_count": int(raw.get("yea") or 0),
        "no_count": int(raw.get("nay") or 0),
        "other_count": vote_other_count(raw),
        "source_url": clean(raw.get("state_link")) or clean(raw.get("url")),
        "member_votes": member_votes,
    }


def compare_bill(existing, current):
    if not existing:
        return ["new bill"]

    changes = []
    if existing.get("last_action") != current.get("last_action") or existing.get("last_action_date") != current.get("last_action_date"):
        changes.append("new movement")
    for label, key in [("amendment", "amendments"), ("text", "texts"), ("vote", "votes")]:
        old_count = len(existing.get(key) or [])
        new_count = len(current.get(key) or [])
        if new_count > old_count:
            changes.append(f"{new_count - old_count} new {label}{'' if new_count - old_count == 1 else 's'}")
    return changes


def make_alert(bill, change_text, priority="normal"):
    return {
        "bill_id": bill.get("bill_number") or "",
        "alert_type": "new_bill" if change_text == "new bill" else "update",
        "title": f"{bill.get('bill_number')}: {change_text}",
        "message": bill.get("last_action") or bill.get("title") or change_text,
        "created_at": today(),
        "priority": priority,
        "is_read": 0,
    }


def update_people(api_key, sessions, existing_people):
    people_by_id = {str(person.get("people_id")): person for person in existing_people if person.get("people_id")}
    for session in sessions:
        session_id = int(session["session_id"])
        payload = api_request(api_key, "getSessionPeople", id=session_id)
        people = (payload.get("sessionpeople") or {}).get("people") or []
        for person in people:
            transformed = transform_person(person)
            if transformed["people_id"]:
                people_by_id[transformed["people_id"]] = transformed
    return sorted(people_by_id.values(), key=lambda row: (row.get("role") or "", row.get("district") or "", row.get("name") or ""))


def post_github_issue(title: str, body: str) -> None:
    token = os.getenv("GITHUB_TOKEN")
    repo = os.getenv("GITHUB_REPOSITORY")
    if not token or not repo:
        return

    payload = json.dumps({"title": title, "body": body}).encode("utf-8")
    request = urllib.request.Request(
        f"https://api.github.com/repos/{repo}/issues",
        data=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "ark-leg-tracker/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60):
            pass
    except Exception as exc:  # noqa: BLE001
        print(f"Warning: could not create GitHub issue notification: {exc}", file=sys.stderr)


def post_webhook(body: str) -> None:
    hooks = [
        ("SLACK_WEBHOOK_URL", {"text": body}),
        ("DISCORD_WEBHOOK_URL", {"content": body[:1900]}),
        ("NOTIFY_WEBHOOK_URL", {"text": body}),
    ]
    for env_name, payload in hooks:
        url = os.getenv(env_name)
        if not url:
            continue
        request = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "User-Agent": "ark-leg-tracker/1.0"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=60):
                pass
        except Exception as exc:  # noqa: BLE001
            print(f"Warning: could not post {env_name} notification: {exc}", file=sys.stderr)


def notification_body(changes):
    lines = ["Arkansas Legislature tracker update", ""]
    for item in changes[:25]:
        bill = item["bill"]
        lines.append(f"- {bill.get('bill_number')}: {', '.join(item['changes'])}")
        lines.append(f"  {bill.get('title')}")
        if bill.get("state_link"):
            lines.append(f"  {bill.get('state_link')}")
    if len(changes) > 25:
        lines.append(f"- Plus {len(changes) - 25} more changed bills.")
    lines.append("")
    lines.append("Live tracker: https://ninarhop.github.io/ark-leg-tracker/")
    return "\n".join(lines)


def run():
    api_key = os.getenv("LEGISCAN_API_KEY")
    if not api_key:
        print("LEGISCAN_API_KEY is not set. Add it as a GitHub Actions repository secret.")
        return 1 if os.getenv("GITHUB_ACTIONS") == "true" else 0

    checked_at = utc_now()
    tracker = read_json(TRACKER_PATH, {"bills": [], "alerts": []})
    vote_details = read_json(VOTES_PATH, {"roll_calls": []})
    existing_people = read_json(PEOPLE_PATH, [])
    cache = read_json(CACHE_PATH, {"sessions": {}})
    cache_changed = not CACHE_PATH.exists()

    bills = tracker.get("bills") or []
    existing_by_legiscan_id = {str(bill.get("legiscan_bill_id")): bill for bill in bills if bill.get("legiscan_bill_id")}
    existing_by_number_session = {(bill.get("bill_number"), bill.get("session")): bill for bill in bills}
    changed_items = []
    raw_bills_by_id = {}

    sessions = current_sessions(api_key)
    people = update_people(api_key, sessions, existing_people)
    people_by_id = {str(person.get("people_id")): person for person in people if person.get("people_id")}

    fetch_queue = []
    for session in sessions:
        session_id = str(session["session_id"])
        payload = api_request(api_key, "getMasterListRaw", id=int(session_id))
        cache_session = cache.setdefault("sessions", {}).setdefault(session_id, {"bills": {}})
        for item in masterlist_items(payload):
            bill_id = str(item.get("bill_id"))
            new_hash = clean(item.get("change_hash"))
            old_hash = clean(cache_session.get("bills", {}).get(bill_id))
            exists = bill_id in existing_by_legiscan_id
            should_fetch = (not exists) or (old_hash and old_hash != new_hash)
            if should_fetch:
                fetch_queue.append((session_id, bill_id, new_hash))
            if old_hash != new_hash:
                cache_changed = True
            cache_session.setdefault("bills", {})[bill_id] = new_hash

    if len(fetch_queue) > MAX_BILLS_PER_RUN:
        print(f"Limiting bill detail fetches to {MAX_BILLS_PER_RUN} of {len(fetch_queue)} changed records.")
        fetch_queue = fetch_queue[:MAX_BILLS_PER_RUN]

    for _session_id, bill_id, _change_hash in fetch_queue:
        payload = api_request(api_key, "getBill", id=int(bill_id))
        raw_bill = payload.get("bill") or {}
        raw_bills_by_id[bill_id] = raw_bill
        existing = existing_by_legiscan_id.get(bill_id)
        transformed = transform_bill(raw_bill, existing)
        changes = compare_bill(existing, transformed)
        if changes:
            changed_items.append({"bill": transformed, "changes": changes})
        existing_by_legiscan_id[bill_id] = transformed
        existing_by_number_session[(transformed.get("bill_number"), transformed.get("session"))] = transformed

    merged_bills = list(existing_by_legiscan_id.values())
    known_legiscan_ids = {str(bill.get("legiscan_bill_id")) for bill in merged_bills if bill.get("legiscan_bill_id")}
    for bill in bills:
        if str(bill.get("legiscan_bill_id")) not in known_legiscan_ids:
            merged_bills.append(bill)

    merged_bills.sort(key=bill_sort_key, reverse=True)
    alerts = tracker.get("alerts") or []
    for item in changed_items:
        bill = item["bill"]
        priority = "urgent" if any("new bill" in change for change in item["changes"]) else "normal"
        alerts.insert(0, make_alert(bill, ", ".join(item["changes"]), priority=priority))
    alerts = alerts[:MAX_ALERTS]

    roll_calls = vote_details.get("roll_calls") or []
    roll_call_by_id = {str(row.get("roll_call_id")): row for row in roll_calls if row.get("roll_call_id")}
    next_local_vote_id = max([int(row.get("local_vote_id") or 0) for row in roll_calls] or [0]) + 1
    bill_by_legiscan_id = {str(bill.get("legiscan_bill_id")): bill for bill in merged_bills if bill.get("legiscan_bill_id")}

    for item in changed_items:
        bill = item["bill"]
        raw_bill = raw_bills_by_id.get(str(bill["legiscan_bill_id"])) or {}
        for vote in raw_bill.get("votes") or []:
            roll_call_id = str(vote.get("roll_call_id") or "")
            if not roll_call_id or roll_call_id in roll_call_by_id:
                continue
            roll_payload = api_request(api_key, "getRollCall", id=int(roll_call_id))
            raw_roll_call = roll_payload.get("roll_call") or {}
            record = transform_roll_call(raw_roll_call, bill, people_by_id, next_local_vote_id)
            next_local_vote_id += 1
            roll_call_by_id[roll_call_id] = record

    roll_calls = sorted(roll_call_by_id.values(), key=lambda row: (row.get("date") or "", row.get("roll_call_id") or ""), reverse=True)
    member_vote_count = sum(len(row.get("member_votes") or []) for row in roll_calls)

    data_changed = bool(changed_items)
    people_changed = people != existing_people

    if data_changed:
        tracker.update({
            "generated_at": checked_at,
            "source": "LegiScan API plus Arkansas Legislature source links",
            "summary": {
                "bills": len(merged_bills),
                "actions": sum(len(bill.get("actions") or []) for bill in merged_bills),
                "amendments": sum(len(bill.get("amendments") or []) for bill in merged_bills),
                "texts": sum(len(bill.get("texts") or []) for bill in merged_bills),
                "votes": sum(len(bill.get("votes") or []) for bill in merged_bills),
                "alerts": len(alerts),
            },
            "bills": merged_bills,
            "alerts": alerts,
        })

        vote_details.update({
            "generated_at": checked_at,
            "source": "LegiScan getRollCall",
            "summary": {
                "roll_calls": len(roll_calls),
                "member_votes": member_vote_count,
                "legislators": len(people),
            },
            "roll_calls": roll_calls,
        })

    status = {
        "checked_at": checked_at,
        "sessions": [
            {
                "session_id": session.get("session_id"),
                "name": session.get("session_title") or session.get("session_name") or session.get("session_tag") or f"Session {session.get('session_id')}",
            }
            for session in sessions
        ],
        "changed_bills": len(changed_items),
        "new_bills": sum(1 for item in changed_items if "new bill" in item["changes"]),
        "alerts": len(changed_items),
        "source": "LegiScan API",
    }

    if not data_changed and not people_changed and not cache_changed:
        print(json.dumps({**status, "message": "No legislature data changes."}, indent=2))
        return 0

    if data_changed:
        write_json(TRACKER_PATH, tracker)
        write_json(VOTES_PATH, vote_details)
    if people_changed:
        write_json(PEOPLE_PATH, people)
    if cache_changed:
        cache["generated_at"] = checked_at
        write_json(CACHE_PATH, cache)
    write_json(STATUS_PATH, status)

    if changed_items:
        title = f"Arkansas Legislature: {len(changed_items)} bill update{'s' if len(changed_items) != 1 else ''}"
        body = notification_body(changed_items)
        post_github_issue(title, body)
        post_webhook(body)

    print(json.dumps(status, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
