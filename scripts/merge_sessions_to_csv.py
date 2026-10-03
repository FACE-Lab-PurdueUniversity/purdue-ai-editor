#!/usr/bin/env python3
"""
Merge Supabase table exports into per-session, time-sequential CSVs.

Reads the per-table CSVs in research_data/ (as produced by the admin Data
Extractor) and writes one merged CSV per session into:

    research_data/by_session/<student>/session_<id>.csv

Each merged file has a small metadata header block, a blank line, then a
timestamp-sorted event table interleaving code snapshots, console logs, chat
messages, and button interactions for that session.

Folders are named after user_profiles.students; if that is empty/"None" we fall
back to the profile's email, then to the raw user_id.

Message rows dereference code_context_id / console_context_id and embed the
actual attached code/console content (not just a boolean flag).

Pass --start / --end to keep only events inside that time frame. Times are
read as US Eastern; a date-only --end covers that whole day. Sessions with no
events in the time frame are skipped, so a session (and its conversations) only
gets a file if something happened in the window.

Usage:
    python3 scripts/merge_sessions_to_csv.py
    python3 scripts/merge_sessions_to_csv.py --start 2026-09-01 --end 2026-09-30
    python3 scripts/merge_sessions_to_csv.py --start "2026-09-01 09:00" --end "2026-09-01 17:00"
"""

import argparse
import csv
import shutil
import sys
from collections import defaultdict
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

# Allow large content fields (multi-line code / long system prompts).
csv.field_size_limit(min(sys.maxsize, 2**31 - 1))

SCRIPT_DIR = Path(__file__).resolve().parent
RESEARCH_DIR = SCRIPT_DIR.parent / "research_data"
OUT_DIR = RESEARCH_DIR / "by_session"

REQUIRED_FILES = [
    "code.csv",
    "code_snapshots.csv",
    "console.csv",
    "conversations.csv",
    "interactions.csv",
    "messages.csv",
    "sessions.csv",
    "user_profiles.csv",
]

# Event table column order for the merged per-session CSV.
EVENT_COLUMNS = [
    "Event ID",
    "Timestamp",
    "Time (Eastern)",
    "Date (Eastern)",
    "Day of Week",
    "Type",
    "Code Save Source",
    "Code Tab Name",
    "Code",
    "Console Save Source",
    "Console",
    "Button Clicked",
    "Message Author",
    "Chat Tab Name",
    "Message",
    "LLM Coding Level",
    "AI Model",
    "Prompt Tokens",
    "Completion Tokens",
    "Attached Code Context",
    "Attached Console Context",
]

# Characters that are unsafe in folder names across common filesystems.
UNSAFE_FOLDER_CHARS = '/\\:*?"<>|'


def load_csv(path):
    """Load a CSV into a list of dicts. Returns [] if the file is missing."""
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def is_blank(value):
    """True for None/empty/whitespace and the literal string 'None'."""
    if value is None:
        return True
    text = str(value).strip()
    return text == "" or text.lower() == "none"


def sanitize_folder(name):
    """Make a string safe to use as a single folder name."""
    text = " ".join(str(name).split())  # collapse all whitespace runs
    for ch in UNSAFE_FOLDER_CHARS:
        text = text.replace(ch, "_")
    text = text.strip(" .")  # no leading/trailing dots or spaces
    if not text:
        text = "unknown"
    return text[:120]


EASTERN_TZ = ZoneInfo("America/New_York")


def parse_eastern(timestamp):
    """Parse a GMT/UTC ISO-8601 timestamp string into an Eastern-time datetime."""
    if is_blank(timestamp):
        return None
    text = str(timestamp).strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(EASTERN_TZ)


def parse_cli_time(value, is_end):
    """Parse a --start/--end value as Eastern time. Date-only --end is inclusive."""
    text = value.strip().replace("T", " ")
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        raise argparse.ArgumentTypeError(
            f"invalid time {value!r}; use YYYY-MM-DD or 'YYYY-MM-DD HH:MM'"
        )
    if is_end and len(text) == 10:  # date only -> include the whole day
        dt = datetime.combine(dt.date(), time.min) + timedelta(days=1) - timedelta(microseconds=1)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=EASTERN_TZ)
    return dt


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--start",
        type=lambda v: parse_cli_time(v, is_end=False),
        help="Keep only events at or after this Eastern time (YYYY-MM-DD or 'YYYY-MM-DD HH:MM').",
    )
    parser.add_argument(
        "--end",
        type=lambda v: parse_cli_time(v, is_end=True),
        help="Keep only events at or before this Eastern time (date-only covers the whole day).",
    )
    args = parser.parse_args()
    if args.start and args.end and args.start > args.end:
        parser.error("--start must be before --end")
    return args


def in_time_frame(timestamp, start, end):
    """True if the timestamp falls in [start, end]. Unparseable times are excluded when filtering."""
    if start is None and end is None:
        return True
    dt = parse_eastern(timestamp)
    if dt is None:
        return False
    if start is not None and dt < start:
        return False
    if end is not None and dt > end:
        return False
    return True


def build_event(event_type, timestamp, **fields):
    """Create a blank event row, then fill in the type-specific fields."""
    row = {col: "" for col in EVENT_COLUMNS}
    row["Type"] = event_type
    row["Timestamp"] = timestamp or ""

    eastern = parse_eastern(timestamp)
    if eastern is not None:
        row["Time (Eastern)"] = eastern.strftime("%H:%M:%S.%f%z")
        row["Date (Eastern)"] = eastern.strftime("%Y-%m-%d")
        row["Day of Week"] = eastern.strftime("%A")

    for key, value in fields.items():
        row[key] = "" if value is None else value
    return row


def main():
    args = parse_args()

    if not RESEARCH_DIR.is_dir():
        sys.exit(f"Error: research_data directory not found at {RESEARCH_DIR}")

    missing = [name for name in REQUIRED_FILES if not (RESEARCH_DIR / name).exists()]
    if missing:
        sys.exit(
            "Error: missing required export(s) in research_data/: "
            + ", ".join(missing)
        )

    # --- Load all source tables ---------------------------------------------
    sessions = load_csv(RESEARCH_DIR / "sessions.csv")
    code_records = load_csv(RESEARCH_DIR / "code.csv")
    code_snapshots = load_csv(RESEARCH_DIR / "code_snapshots.csv")
    console_rows = load_csv(RESEARCH_DIR / "console.csv")
    interactions = load_csv(RESEARCH_DIR / "interactions.csv")
    conversations = load_csv(RESEARCH_DIR / "conversations.csv")
    messages = load_csv(RESEARCH_DIR / "messages.csv")
    user_profiles = load_csv(RESEARCH_DIR / "user_profiles.csv")

    # --- Build indexes -------------------------------------------------------
    profiles_by_user = {r["user_id"]: r for r in user_profiles}

    # Dereference targets for message context attachments.
    snapshot_by_id = {r["id"]: r for r in code_snapshots}
    console_by_id = {r["id"]: r for r in console_rows}

    # Tab-name lookups: code_id -> code tab name, conversation_id -> chat tab name.
    code_name_by_id = {r["id"]: r.get("name", "") for r in code_records}
    conversation_name_by_id = {r["id"]: r.get("name", "") for r in conversations}

    code_by_session = defaultdict(list)
    for r in code_snapshots:
        code_by_session[r["session_id"]].append(r)

    console_by_session = defaultdict(list)
    for r in console_rows:
        console_by_session[r["session_id"]].append(r)

    interactions_by_session = defaultdict(list)
    for r in interactions:
        interactions_by_session[r["session_id"]].append(r)

    conversations_by_session = defaultdict(list)
    for r in conversations:
        conversations_by_session[r["session_id"]].append(r["id"])

    messages_by_conversation = defaultdict(list)
    for r in messages:
        messages_by_conversation[r["conversation_id"]].append(r)

    # --- Reset output directory ---------------------------------------------
    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    files_written = 0
    sessions_skipped = 0
    per_student_counts = defaultdict(int)

    for session in sessions:
        sid = session.get("id")
        user_id = session.get("user_id") or ""

        # Resolve the student folder: students -> email -> user_id.
        profile = profiles_by_user.get(user_id)
        student = ""
        if profile:
            if not is_blank(profile.get("students")):
                student = profile["students"]
            elif not is_blank(profile.get("email")):
                student = profile["email"]
        if is_blank(student):
            student = user_id or "unknown"
        folder_name = sanitize_folder(student)

        # --- Gather events for this session ---------------------------------
        events = []

        for r in code_by_session.get(sid, []):
            events.append(
                build_event(
                    "code",
                    r.get("timestamp"),
                    **{
                        "Code Save Source": r.get("save_source"),
                        "Code Tab Name": code_name_by_id.get(r.get("code_id"), ""),
                        "Code": r.get("content"),
                    },
                )
            )

        for r in console_by_session.get(sid, []):
            events.append(
                build_event(
                    "console",
                    r.get("timestamp"),
                    **{
                        "Console Save Source": r.get("save_source"),
                        "Console": r.get("content"),
                    },
                )
            )

        for r in interactions_by_session.get(sid, []):
            events.append(
                build_event(
                    "interaction",
                    r.get("timestamp"),
                    **{"Button Clicked": r.get("button_name")},
                )
            )

        for conv_id in conversations_by_session.get(sid, []):
            for r in messages_by_conversation.get(conv_id, []):
                attached_code = ""
                code_ctx = r.get("code_context_id")
                if not is_blank(code_ctx) and code_ctx in snapshot_by_id:
                    attached_code = snapshot_by_id[code_ctx].get("content", "")

                attached_console = ""
                console_ctx = r.get("console_context_id")
                if not is_blank(console_ctx) and console_ctx in console_by_id:
                    attached_console = console_by_id[console_ctx].get("content", "")

                events.append(
                    build_event(
                        "message",
                        r.get("timestamp"),
                        **{
                            "Message Author": r.get("role"),
                            "Chat Tab Name": conversation_name_by_id.get(conv_id, ""),
                            "Message": r.get("content"),
                            "LLM Coding Level": r.get("coding_level"),
                            "AI Model": r.get("ai_model"),
                            "Prompt Tokens": r.get("prompt_tokens"),
                            "Completion Tokens": r.get("completion_tokens"),
                            "Attached Code Context": attached_code,
                            "Attached Console Context": attached_console,
                        },
                    )
                )

        # Keep only events inside the requested time frame (no-op without --start/--end).
        events = [e for e in events if in_time_frame(e["Timestamp"], args.start, args.end)]

        # Skip sessions with nothing in the time frame.
        if not events:
            sessions_skipped += 1
            continue

        # Sort chronologically (ISO-8601 strings sort correctly; blanks last).
        events.sort(key=lambda e: (e["Timestamp"] == "", e["Timestamp"]))

        # --- Write the merged session CSV -----------------------------------
        student_dir = OUT_DIR / folder_name
        student_dir.mkdir(parents=True, exist_ok=True)
        out_path = student_dir / f"session_{sid}.csv"

        with out_path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["Student", student])
            writer.writerow(["Session ID", sid])
            writer.writerow(["User ID", user_id])
            writer.writerow(["Session Name", session.get("name", "")])
            writer.writerow(["Hardware Platform", session.get("hardware_platform", "")])
            writer.writerow(["Started At", session.get("start_time", "")])
            writer.writerow(["Last Updated", session.get("last_updated", "")])
            writer.writerow([])
            writer.writerow(EVENT_COLUMNS)
            for event_id, event in enumerate(events):
                event["Event ID"] = event_id
                writer.writerow([event[col] for col in EVENT_COLUMNS])

        files_written += 1
        per_student_counts[folder_name] += 1

    # --- Summary -------------------------------------------------------------
    if args.start or args.end:
        start_label = args.start.strftime("%Y-%m-%d %H:%M %Z") if args.start else "beginning"
        end_label = args.end.strftime("%Y-%m-%d %H:%M %Z") if args.end else "now"
        print(f"Time frame: {start_label} to {end_label}")
    print(f"Processed {len(sessions)} sessions; skipped {sessions_skipped} with no events in range.")
    print(f"Wrote {files_written} session CSV(s) across "
          f"{len(per_student_counts)} student folder(s) in {OUT_DIR}")
    for name in sorted(per_student_counts):
        print(f"  {name}: {per_student_counts[name]} session(s)")


if __name__ == "__main__":
    main()
