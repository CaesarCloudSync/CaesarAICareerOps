import os
import re
from pathlib import Path
from sqlmodel import Session, select
from sqlalchemy import create_engine, text

from backend.application.services.company_naming_service import extract_slug_and_display_name
from backend.application.models import PipelineItem

DATABASES = [
    {
        "name": "caesar_ops (Default / Kya)",
        "url": "postgresql://caesar:caesar_ops_password@localhost:5432/caesar_ops",
        "pipeline_md": Path("/home/amari/Desktop/CaesarAICareerOps/backend/career-ops/data/pipeline.md"),
    },
    {
        "name": "caesar_ops_carl (Carl)",
        "url": "postgresql://caesar:caesar_ops_password@localhost:5433/caesar_ops_carl",
        "pipeline_md": Path("/home/amari/Desktop/CaesarAICareerOpsCarl/backend/career-ops/data/pipeline.md"),
    },
    {
        "name": "caesar_ops_amari (Amari)",
        "url": "postgresql://caesar:caesar_ops_password@localhost:5434/caesar_ops_amari",
        "pipeline_md": Path("/home/amari/Desktop/CaesarAICareerOpsAmari/backend/career-ops/data/pipeline.md"),
    },
]


def update_database_and_file(target):
    print(f"\n==========================================")
    print(f"Processing: {target['name']}")
    print(f"==========================================")
    engine = create_engine(target["url"])

    # 1. Ensure columns exist
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE pipeline_inbox ADD COLUMN IF NOT EXISTS slug VARCHAR(255) NULL;"))
        conn.execute(text("ALTER TABLE pipeline_inbox ADD COLUMN IF NOT EXISTS display_name VARCHAR(255) NULL;"))

    updated_count = 0
    with Session(engine) as session:
        items = session.exec(select(PipelineItem).order_by(PipelineItem.id)).all()
        print(f"Found {len(items)} items in DB.")
        for item in items:
            parts = [p.strip() for p in item.raw_text.split("|")]
            if len(parts) >= 2:
                url_m = re.search(r"https?://[^\s|]+", parts[0])
                url = url_m.group(0) if url_m else ""
                raw_company = parts[1]
                slug, display_name = extract_slug_and_display_name(raw_company, url)

                # Format raw_text with capitalized display_name
                parts[1] = display_name
                new_raw_text = " | ".join(parts)

                item.slug = slug
                item.display_name = display_name
                item.raw_text = new_raw_text
                session.add(item)
                updated_count += 1
        session.commit()
    print(f"Updated {updated_count} items in {target['name']} database.")

    # 2. Update pipeline.md if it exists
    p_file = target["pipeline_md"]
    if p_file.exists():
        lines = p_file.read_text(encoding="utf-8").splitlines()
        new_lines = []
        md_updated = 0
        for line in lines:
            line_str = line.strip()
            if line_str.startswith("- [ ]") or line_str.startswith("- [x]"):
                parts = [p.strip() for p in line_str.split("|")]
                if len(parts) >= 2:
                    url_m = re.search(r"https?://[^\s|]+", parts[0])
                    url = url_m.group(0) if url_m else ""
                    raw_company = parts[1]
                    slug, display_name = extract_slug_and_display_name(raw_company, url)
                    parts[1] = display_name
                    new_lines.append(" | ".join(parts))
                    md_updated += 1
                else:
                    new_lines.append(line)
            else:
                new_lines.append(line)
        p_file.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
        print(f"Updated {md_updated} lines in {p_file}.")
    else:
        print(f"{p_file} does not exist, skipped.")


def main():
    for target in DATABASES:
        try:
            update_database_and_file(target)
        except Exception as e:
            print(f"Error updating {target['name']}: {e}")


if __name__ == "__main__":
    main()
