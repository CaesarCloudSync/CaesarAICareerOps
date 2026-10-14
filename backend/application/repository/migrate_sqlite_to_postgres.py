#!/usr/bin/env python3
"""
CaesarAICareerOps — SQLite to PostgreSQL Migration Tool
Transfers all applications, pipeline items, CVs, and profiles from local SQLite to PostgreSQL.
"""

import os
import sys
import sqlite3
import psycopg2
from pathlib import Path
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent
SQLITE_PATH = ROOT_DIR / "data" / "caesar.db"

# PostgreSQL connection string
PG_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://caesar:caesar_ops_password@localhost:5432/caesar_ops"
)
# Clean up scheme if necessary
if PG_URL.startswith("postgresql+psycopg2://"):
    PG_URL = PG_URL.replace("postgresql+psycopg2://", "postgresql://", 1)


def parse_datetime(val):
    if not val:
        return datetime.now(timezone.utc)
    if isinstance(val, datetime):
        return val if val.tzinfo else val.replace(tzinfo=timezone.utc)
    try:
        dt = datetime.fromisoformat(val)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return datetime.now(timezone.utc)


def migrate():
    print("==================================================================")
    print("🚀 CaesarAICareerOps — SQLite ➔ PostgreSQL Full Migration")
    print("==================================================================")
    print(f"📂 Source SQLite:      {SQLITE_PATH}")
    print(f"🐘 Target PostgreSQL:  {PG_URL.split('@')[-1]}")
    print("==================================================================")

    if not SQLITE_PATH.exists():
        print(f"⚠️ Source SQLite database not found at {SQLITE_PATH}. Nothing to migrate.")
        return

    sqlite_conn = sqlite3.connect(str(SQLITE_PATH))
    sqlite_conn.row_factory = sqlite3.Row
    s_cur = sqlite_conn.cursor()

    try:
        pg_conn = psycopg2.connect(PG_URL)
        p_cur = pg_conn.cursor()
    except Exception as e:
        print(f"❌ Failed to connect to PostgreSQL: {e}")
        print("Make sure PostgreSQL is running (e.g. ./build_app.sh --local)")
        sys.exit(1)

    # 1. Applications Migration
    print("\n📦 1. Migrating 'applications' table...")
    s_cur.execute("SELECT id, num, company, role, score, status, date_applied, url, report_path, notes, created_at FROM applications")
    app_rows = s_cur.fetchall()
    migrated_apps = 0
    for row in app_rows:
        dt = parse_datetime(row["created_at"])
        p_cur.execute("""
            INSERT INTO applications (id, num, company, role, score, status, date_applied, url, report_path, notes, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                num = EXCLUDED.num,
                company = EXCLUDED.company,
                role = EXCLUDED.role,
                score = EXCLUDED.score,
                status = EXCLUDED.status,
                date_applied = EXCLUDED.date_applied,
                url = EXCLUDED.url,
                report_path = EXCLUDED.report_path,
                notes = EXCLUDED.notes,
                created_at = EXCLUDED.created_at;
        """, (
            row["id"], row["num"], row["company"], row["role"], row["score"],
            row["status"], row["date_applied"], row["url"], row["report_path"],
            row["notes"], dt
        ))
        migrated_apps += 1

    p_cur.execute("SELECT setval(pg_get_serial_sequence('applications', 'id'), COALESCE(MAX(id), 1)) FROM applications;")
    pg_conn.commit()
    print(f"   ✅ Migrated {migrated_apps} application records into PostgreSQL.")

    # 2. Pipeline Inbox Migration
    print("\n📦 2. Migrating 'pipeline_inbox' table...")
    s_cur.execute("SELECT id, raw_text, status, created_at FROM pipeline_inbox")
    pipe_rows = s_cur.fetchall()
    migrated_pipes = 0
    for row in pipe_rows:
        dt = parse_datetime(row["created_at"])
        p_cur.execute("""
            INSERT INTO pipeline_inbox (id, raw_text, status, created_at)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                raw_text = EXCLUDED.raw_text,
                status = EXCLUDED.status,
                created_at = EXCLUDED.created_at;
        """, (row["id"], row["raw_text"], row["status"], dt))
        migrated_pipes += 1

    p_cur.execute("SELECT setval(pg_get_serial_sequence('pipeline_inbox', 'id'), COALESCE(MAX(id), 1)) FROM pipeline_inbox;")
    pg_conn.commit()
    print(f"   ✅ Migrated {migrated_pipes} pipeline inbox records into PostgreSQL.")

    # 3. Resumes Migration
    print("\n📦 3. Migrating 'resumes' table...")
    s_cur.execute("SELECT id, title, content, is_default, updated_at FROM resumes")
    resume_rows = s_cur.fetchall()
    migrated_resumes = 0
    for row in resume_rows:
        dt = parse_datetime(row["updated_at"])
        p_cur.execute("""
            INSERT INTO resumes (id, title, content, is_default, updated_at)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                title = EXCLUDED.title,
                content = EXCLUDED.content,
                is_default = EXCLUDED.is_default,
                updated_at = EXCLUDED.updated_at;
        """, (row["id"], row["title"], row["content"], bool(row["is_default"]), dt))
        migrated_resumes += 1

    p_cur.execute("SELECT setval(pg_get_serial_sequence('resumes', 'id'), COALESCE(MAX(id), 1)) FROM resumes;")
    pg_conn.commit()
    print(f"   ✅ Migrated {migrated_resumes} resume records into PostgreSQL.")

    # 4. Profiles Migration
    try:
        s_cur.execute("SELECT id, name, content, updated_at FROM profiles")
        profile_rows = s_cur.fetchall()
        migrated_profiles = 0
        for row in profile_rows:
            dt = parse_datetime(row["updated_at"])
            p_cur.execute("""
                INSERT INTO profiles (id, name, content, updated_at)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    content = EXCLUDED.content,
                    updated_at = EXCLUDED.updated_at;
            """, (row["id"], row["name"], row["content"], dt))
            migrated_profiles += 1
        p_cur.execute("SELECT setval(pg_get_serial_sequence('profiles', 'id'), COALESCE(MAX(id), 1)) FROM profiles;")
        pg_conn.commit()
        print(f"   ✅ Migrated {migrated_profiles} profile records into PostgreSQL.")
    except sqlite3.OperationalError:
        print("   ℹ️ Profiles table empty or not present in SQLite.")

    # Verification Counts
    print("\n==================================================================")
    print("📊 Migration Verification Summary:")
    print("==================================================================")
    for table in ["applications", "pipeline_inbox", "resumes", "profiles"]:
        p_cur.execute(f"SELECT count(*) FROM {table}")
        count = p_cur.fetchone()[0]
        print(f"   🐘 PostgreSQL {table}: {count} rows")

    # Safe Archive of SQLite
    backup_file = SQLITE_PATH.with_suffix(".db.migrated_backup")
    if not backup_file.exists():
        SQLITE_PATH.rename(backup_file)
        print(f"\n🔒 Safely archived SQLite database to: {backup_file.name}")
    else:
        print(f"\nℹ️ SQLite database already archived.")

    print("\n🎉 Full migration to PostgreSQL complete! Provider is 100% PostgreSQL.")
    print("==================================================================")

    sqlite_conn.close()
    pg_conn.close()


if __name__ == "__main__":
    migrate()
