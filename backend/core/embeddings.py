import json
import copy
import pickle
import sqlite3
import logging
import csv
import os

from config import REVIEWERS_DB_FILE, REVIEWERS_PKL_FILE, REVIEWERS_SQLITE_FILE, MODEL_NAME, GROQ_API_KEY, DATA_DIR

logger = logging.getLogger(__name__)




def init_reviewers_database():
    """Ensures reviewers_database.json exists and returns reviewer count."""
    try:
        with open(REVIEWERS_DB_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return len(data) if data else 0
    except (FileNotFoundError, json.JSONDecodeError):
        return 0


def build_embeddings_from_scratch(model):
    """Builds reviewers_embeddings.pkl from the full reviewers_database.json."""
    with open(REVIEWERS_DB_FILE, 'r', encoding='utf-8') as f:
        experts = json.load(f)

    all_titles = []
    mapping_index = []

    for expert_idx, person in enumerate(experts):
        for pub_idx, pub in enumerate(person.get('publications', [])):
            title = pub.get('title', '').strip()
            if title:
                all_titles.append(title)
                mapping_index.append((expert_idx, pub_idx))

    if not all_titles:
        return

    embeddings = model.encode(all_titles, convert_to_numpy=True, show_progress_bar=False)

    processed = copy.deepcopy(experts)
    for i, (expert_idx, pub_idx) in enumerate(mapping_index):
        processed[expert_idx]['publications'][pub_idx]['embedding'] = embeddings[i]

    with open(REVIEWERS_PKL_FILE, 'wb') as f:
        pickle.dump(processed, f)

    return len(all_titles)


def init_embeddings(model):
    """Builds PKL from reviewers_database.json if it doesn't exist or is empty/corrupt.
    If JSON is missing, automatically scrapes from mmu_reviewer_list.csv to create it first."""

    # Check if JSON exists first — if not, scrape it
    if not os.path.exists(REVIEWERS_DB_FILE):
        print("[*] reviewers_database.json not found. Running Data Scraper...")

        from scraper.scholar_scraper import scrape_batch_reviewers

        csv_path = os.path.join(DATA_DIR, "mmu_reviewer_list.csv")

        if not os.path.exists(csv_path):
            logger.warning(f"[Data Scraper] CSV file not found: {csv_path}")
            return

        # Parse CSV
        entries = []
        try:
            with open(csv_path, 'r', encoding='utf-8-sig') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    name = None
                    scholar_id = None

                    for key in row:
                        key_lower = key.lower().strip()
                        if 'name' in key_lower and not name:
                            name = row[key].strip()
                        if 'scholar' in key_lower and 'id' in key_lower:
                            scholar_id = row[key].strip()
                        if 'id' in key_lower and not scholar_id:
                            scholar_id = row[key].strip()

                    if name and scholar_id:
                        entries.append({"name": name, "g_scholar_id": scholar_id})

            if not entries:
                logger.warning("[Data Scraper] No valid entries found in CSV.")
                return

            logger.info(f"[Data Scraper] Extracted {len(entries)} reviewers. Starting batch scrape...")
            logger.info("[Data Scraper] A Chrome browser window will open. Please solve any CAPTCHAs if they appear.")

            # Scrape all reviewers
            results = scrape_batch_reviewers(entries, "Multimedia University")

            # Save to JSON
            verified = results.get("verified", [])
            if verified:


                with open(REVIEWERS_DB_FILE, 'w', encoding='utf-8') as f:
                    json.dump(verified, f, indent=4, ensure_ascii=False)
                logger.info(f"[Data Scraper] ✓ Saved {len(verified)} verified reviewers to database.")

                # Build embeddings from the new data
                logger.info("[Data Scraper] Building embeddings...")
                build_embeddings_from_scratch(model)
                logger.info("[Data Scraper] ✓ Embeddings complete.")
            else:
                logger.warning("[Data Scraper] No verified reviewers found.")

            summary = results
            logger.info(f"[Data Scraper] Summary: {len(verified)} verified, {len(summary.get('unverified', []))} unverified, {len(summary.get('inactive', []))} inactive, {len(summary.get('failed', []))} failed")

        except Exception as e:
            logger.error(f"[Data Scraper] Error reading CSV: {e}")
            return

        print("[OK] Data Scraper complete.")

    # Now check PKL
    needs_rebuild = True
    try:
        with open(REVIEWERS_PKL_FILE, 'rb') as f:
            data = pickle.load(f)
        if data and len(data) > 0:
            needs_rebuild = False
    except (FileNotFoundError, EOFError, Exception):
        pass

    if needs_rebuild:
        print("[*] Building embeddings from reviewers_database.json...")
        count = build_embeddings_from_scratch(model)
        if count:
            print(f"[OK] Embedded {count} publications.")
        else:
            print("[WARN] No publications found to embed.")


def incremental_embed_new_reviewers(new_reviewers, model):
    """Appends new reviewer embeddings to the existing PKL file."""
    try:
        with open(REVIEWERS_PKL_FILE, 'rb') as f:
            existing_data = pickle.load(f)
    except FileNotFoundError:
        existing_data = []

    all_new_titles = []
    title_to_reviewer_idx = []

    for rev_idx, reviewer in enumerate(new_reviewers):
        for pub in reviewer.get('publications', []):
            title = pub.get('title', '').strip()
            if title:
                all_new_titles.append(title)
                title_to_reviewer_idx.append(rev_idx)

    if not all_new_titles:
        return

    new_embeddings = model.encode(all_new_titles, convert_to_numpy=True, show_progress_bar=False)

    for i, rev_idx in enumerate(title_to_reviewer_idx):
        title = all_new_titles[i]
        for pub in new_reviewers[rev_idx]['publications']:
            if pub.get('title', '').strip() == title:
                pub['embedding'] = new_embeddings[i]
                break

    existing_data.extend(new_reviewers)

    with open(REVIEWERS_PKL_FILE, 'wb') as f:
        pickle.dump(existing_data, f)


def init_sqlite_db():
    """Creates/repopulates the SQLite table from reviewers_database.json."""
    with open(REVIEWERS_DB_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    conn = sqlite3.connect(REVIEWERS_SQLITE_FILE)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS reviewers (
            name TEXT,
            g_scholar_id TEXT PRIMARY KEY,
            university TEXT,
            verified INTEGER DEFAULT 1
        )
    ''')
    cursor.execute('DELETE FROM reviewers')
    for person in data:
        cursor.execute(
            'INSERT OR REPLACE INTO reviewers (name, g_scholar_id, university, verified) VALUES (?, ?, ?, ?)',
            (
                person['name'],
                person['g_scholar_id'],
                person['university'],
                1 if person.get('verified', True) else 0
            )
        )
    conn.commit()
    conn.close()


def reload_experts():
    """Reloads experts from PKL file. Called after database updates."""
    try:
        with open(REVIEWERS_PKL_FILE, 'rb') as f:
            return pickle.load(f)
    except (FileNotFoundError, EOFError):
        return []


def delete_reviewer(g_scholar_id):
    """Permanently removes a reviewer from all three stores (JSON, PKL, SQLite).
    Returns True if the reviewer was found and removed, False otherwise."""
    found = False

    # JSON (source of truth)
    with open(REVIEWERS_DB_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    new_data = [p for p in data if p.get('g_scholar_id') != g_scholar_id]
    if len(new_data) != len(data):
        found = True
        with open(REVIEWERS_DB_FILE, 'w', encoding='utf-8') as f:
            json.dump(new_data, f, indent=4, ensure_ascii=False)

    # PKL (embeddings)
    try:
        with open(REVIEWERS_PKL_FILE, 'rb') as f:
            experts = pickle.load(f)
        new_experts = [p for p in experts if p.get('g_scholar_id') != g_scholar_id]
        if len(new_experts) != len(experts):
            found = True
            with open(REVIEWERS_PKL_FILE, 'wb') as f:
                pickle.dump(new_experts, f)
    except (FileNotFoundError, EOFError):
        pass

    # SQLite (index)
    conn = sqlite3.connect(REVIEWERS_SQLITE_FILE)
    cursor = conn.cursor()
    cursor.execute('DELETE FROM reviewers WHERE g_scholar_id = ?', (g_scholar_id,))
    conn.commit()
    conn.close()

    return found
