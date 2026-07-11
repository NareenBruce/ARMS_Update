# ARMS — Automated Reviewer Matching System

## What is ARMS?

ARMS is a full-stack AI system that recommends the most suitable academic reviewers for a research paper submission. It solves the "vocabulary gap" problem: keyword-based tools fail when an author and reviewer describe the same topic differently. ARMS uses SPECTER (a citation-graph transformer) to encode semantic meaning, then ranks reviewers by a weighted cosine similarity score that also factors in how recently they have been publishing.

**Stack:** FastAPI (Python) backend + Next.js (TypeScript) frontend  
**Model:** `sentence-transformers/allenai-specter` — 768-dim embeddings trained on citation graphs  
**LLM:** `openai/gpt-oss-120b` via Groq API — used only to generate a natural-language justification for the top match  
**Recency decay:** `weight = 0.85 ^ (current_year - publication_year)` — older papers are down-weighted  
**Scoring:** Top-3 Mean Aggregation — take the 3 highest weighted cosine scores for each reviewer, average them  
**Validation:** Tested against DIFCON 2025 conference submissions, 89.3% expert-rated relevance (majority vote)

---

## Project Structure

```
Vibe/
├── backend/
│   ├── main.py                   # FastAPI app entry point
│   ├── config.py                 # All constants and env vars
│   ├── models.py                 # Pydantic request/response models
│   ├── requirements.txt
│   ├── .env                      # GROQ_API_KEY (do not commit)
│   ├── api/
│   │   ├── routes_match.py       # /api/match/* endpoints
│   │   ├── routes_database.py    # /api/reviewers/* endpoints
│   │   └── routes_scrape.py      # /api/scrape/* endpoints
│   ├── core/
│   │   ├── embeddings.py         # PKL + SQLite build/update logic
│   │   ├── matcher.py            # Scoring and ranking pipeline
│   │   ├── recency.py            # Recency decay formula
│   │   ├── llm_agent.py          # Groq LLM justification call
│   │   ├── pdf_extractor.py      # PyMuPDF — extract title/abstract from PDF
│   │   └── validators.py         # Google Scholar ID + university name validators
│   └── scraper/
│       ├── scholar_scraper.py    # Selenium scraper for Google Scholar
│       └── active_filter.py      # Year extraction utility (filters < 2020)
├── frontend/
│   └── src/app/
│       ├── page.tsx              # Root — redirects to /match
│       ├── layout.tsx            # App shell, nav, theme system
│       ├── globals.css
│       ├── match/page.tsx        # Main matching UI (manual / PDF / batch)
│       ├── database/page.tsx     # Reviewer database browser
│       └── add/page.tsx          # Add reviewers UI (single / batch scrape)
└── data/
    ├── reviewers_database.json   # Source of truth — all reviewer profiles + publications
    ├── reviewers_embeddings.pkl  # SPECTER embeddings for all publications (in-memory)
    ├── reviewers.db              # SQLite — lightweight reviewer index (name, id, university)
    └── mmu_reviewer_list.csv     # Seed list of MMU reviewer names + Google Scholar IDs
```

---

## Backend Files

### `main.py`
FastAPI app entry point. On startup: loads SPECTER model, builds embeddings if missing (`init_embeddings`), populates SQLite (`init_sqlite_db`), loads expert data into `app_state["experts"]`. Registers three routers. CORS is configured for `localhost:3000`.

`app_state` is a global dict shared across all routes:
```python
app_state = { "model": SentenceTransformer, "experts": list, "db_file": str, "pkl_file": str }
```

### `config.py`
All constants in one place. Key values:
- `MODEL_NAME = "sentence-transformers/allenai-specter"`
- `RECENCY_DECAY = 0.85`
- `TOP_N = 3` (top-3 mean aggregation)
- `ACTIVE_YEAR_THRESHOLD = 2020` (publications before this are filtered out)
- `LLM_MODEL_NAME = "openai/gpt-oss-120b"` via Groq
- File paths: `REVIEWERS_DB_FILE`, `REVIEWERS_PKL_FILE`, `REVIEWERS_SQLITE_FILE`

### `models.py`
Pydantic models for all API requests and responses. Key ones:
- `ManualMatchRequest` — title, abstract, keywords
- `MatchResponse` — list of `MatchResult` + justification string
- `MatchResult` — name, g_scholar_id, university, wtd_score, wtd_max, reliability, recency, best_paper, top_3_papers
- `ScrapeSingleResponse` / `ScrapeBatchResponse` — scrape outcome details

---

## `api/` — Route Files

### `routes_match.py`
Prefix: `/api/match`

- `POST /manual` — accepts title + abstract + keywords, calls `run_matching()`
- `POST /pdf` — accepts PDF upload, extracts text via `pdf_extractor.py`, then calls `run_matching()`
- `POST /batch` — accepts CSV or JSON of paper titles, runs matching for each, returns a downloadable CSV with top-3 experts per paper

### `routes_database.py`
Prefix: `/api/reviewers`

- `GET /` — returns all reviewers from `reviewers_database.json`, with optional `?search=` filter
- `GET /stats` — returns total count, breakdown by university, unverified count

### `routes_scrape.py`
Prefix: `/api/scrape`

- `POST /single` — scrapes one reviewer by Google Scholar ID, validates institution (`.edu.my`), appends to JSON, incrementally embeds, reloads SQLite
- `POST /batch` — accepts CSV/Excel upload with Name + Scholar ID columns, runs batch scrape, updates all data stores
- `GET /status` — returns current scrape job status

After every successful scrape, the pipeline always runs in this order:
1. Append verified reviewer to `reviewers_database.json`
2. `incremental_embed_new_reviewers()` — adds embeddings to `.pkl`
3. `init_sqlite_db()` — full wipe and repopulate SQLite from JSON
4. `reload_experts()` — refreshes `app_state["experts"]` in memory

---

## `core/` — Logic Files

### `embeddings.py`
Manages all three data stores (JSON, PKL, SQLite).

- `build_embeddings_from_scratch(model)` — encodes all publication titles from JSON, saves to PKL
- `incremental_embed_new_reviewers(new_reviewers, model)` — loads existing PKL, encodes new titles, appends, saves back. Never rebuilds the whole file.
- `init_sqlite_db()` — `DELETE FROM reviewers` then re-inserts all rows from JSON. Full wipe every time.
- `reload_experts()` — loads PKL into memory and returns the list
- `init_embeddings(model)` — startup check: if PKL missing or empty, calls `build_embeddings_from_scratch`. If JSON missing, auto-scrapes from CSV first.

### `matcher.py`
Core matching logic.

`get_expert_scores(expert, query_embedding)`:
1. Computes cosine similarity between query and all of the reviewer's publication embeddings
2. Multiplies each score by its recency weight (`0.85 ^ (current_year - pub_year)`)
3. Sorts descending, takes top 3
4. Returns `top_3_mean`, `max_weighted`, `std_dev`, `best_paper_title`, `top_3_titles`, `recency_label`

`run_matching(experts, model, title, abstract, keywords)`:
1. Joins query as `title [SEP] keywords [SEP] abstract`
2. Encodes with SPECTER
3. Runs `get_expert_scores` for all experts
4. Filters out anyone with `max_weighted <= 0.25` (too distant)
5. Sorts by `wtd_score` descending
6. Calls `generate_llm_justification` for the #1 match only
7. Returns top `TOP_N` results + justification

### `recency.py`
- `get_recency_weight(year_str)` — returns `0.85 ^ (CURRENT_YEAR - year)`. Returns `0.0` for unparseable or future years.
- `classify_recency(avg_recency)` — `>= 0.85` → Active, `>= 0.50` → Mildly Active, else Not Active
- `classify_std_dev(std_dev)` — `< 0.10` → Specialist, `< 0.20` → Moderate, else Generalist

### `llm_agent.py`
Calls Groq API with the #1 matched reviewer's top-3 papers and the query paper's title + abstract. Returns a 3-sentence natural language justification explaining why this reviewer is a good match. Temperature is 0.3. Falls back gracefully if API key is missing or the call fails.

### `pdf_extractor.py`
Uses PyMuPDF (`fitz`) to extract title, abstract, and keywords from uploaded PDFs.
- Title: detected by largest font size on page 1
- Abstract / Keywords: regex anchors on "Abstract", "Keywords", "Introduction"
- Requires Python 3.11 (PyMuPDF 1.24.10 has no pre-built wheel for Python 3.14)

### `validators.py`
- `validate_gs_id(gs_id)` — checks Google Scholar ID is 8–20 chars, alphanumeric + `_-`, and ends with `J`
- `validate_university(name)` — checks the string contains "University"

---

## `scraper/` — Scraping Files

### `scholar_scraper.py`
Selenium-based scraper for Google Scholar profiles.

Key functions:
- `setup_driver(headless=False)` — launches Chrome via remote debug port 9222 (connects to existing Chrome instance to avoid detection)
- `wait_for_captcha(driver, timeout=120)` — detects "captcha" or "unusual traffic" in page text, pauses and waits up to 120s for human to solve
- `scrape_profile(driver, scholar_id, university)` — navigates to the profile, clicks "Show More" until `min(years_found) <= 2020` or button is disabled, extracts all publications
- Institution verification: 3 fallback methods check for `.edu.my` email (by element ID `gsc_prf_ivh`, by class `gsc_prf_il`, by full body text scan)
- `scrape_single_reviewer(name, scholar_id, university)` — scrapes one profile, returns status: `verified` / `unverified` / `inactive` / `failed`
- `scrape_batch_reviewers(entries, university)` — loops over a list of `{name, g_scholar_id}` dicts, returns summary dict with `verified`, `unverified`, `inactive`, `failed` lists

### `active_filter.py`
- `extract_year(year_obj)` — robustly extracts a 4-digit year from string or int. Returns `0` on failure.
- `START_YEAR = 2020` — reviewers with no publications from 2020 onward are classified as inactive and not added to the database.

---

## Frontend Files

All frontend pages call `http://127.0.0.1:8000` (the FastAPI backend). Theme is managed via `useTheme()` from `layout.tsx`.

### `layout.tsx`
App shell. Defines the navigation bar (Match, Database, Add Reviewers), dark/light mode toggle, and the `ThemeContext` with a `t` object of Tailwind class strings used by all pages.

### `match/page.tsx`
Main page. Three modes toggled by tabs:
- **Manual** — form with title, abstract, keywords fields → `POST /api/match/manual`
- **PDF** — drag-and-drop PDF upload → `POST /api/match/pdf`
- **Batch** — drag-and-drop CSV/JSON → `POST /api/match/batch` → auto-downloads CSV + shows preview table

Results display as cards (top-3 reviewers) with weighted score, reliability badge, recency badge, top matching papers (linked to Google Scholar), and AI justification for rank #1.

### `database/page.tsx`
Reviewer browser. Fetches `GET /api/reviewers` and `GET /api/reviewers/stats` on load. Shows stat cards (total, universities, unverified), search input, university dropdown filter, and a paginated table. Names link to Google Scholar profiles.

### `add/page.tsx`
Add reviewers via scraping. Two modes:
- **Single** — name + Scholar ID + university → `POST /api/scrape/single`
- **Batch** — university + CSV/Excel file upload → `POST /api/scrape/batch`

Shows a pipeline report after batch scraping: verified / unverified / inactive / failed counts with name lists.

### `page.tsx`
Root page — simply redirects to `/match`.

---

## Data Files (not committed to git)

| File | Description |
|------|-------------|
| `data/reviewers_database.json` | Source of truth. Array of reviewer objects with name, g_scholar_id, university, email, verified flag, and publications list (each with title and year). |
| `data/reviewers_embeddings.pkl` | Pickled list of the same reviewer objects but with `embedding` numpy arrays attached to each publication. Loaded into `app_state["experts"]` at startup. |
| `data/reviewers.db` | SQLite with a single `reviewers` table (name, g_scholar_id, university, verified). Used for lightweight queries. |
| `data/mmu_reviewer_list.csv` | Seed CSV with MMU reviewer names and Google Scholar IDs. Used on first startup if JSON is missing. |

**Important:** `.pkl` is updated incrementally (append-only). `.db` is fully wiped and repopulated from JSON after every scrape. JSON is append-only. All three stay in sync.

---

## How to Run

```bash
# Backend (requires Python 3.11 for PyMuPDF)
cd backend
py -3.11 -m venv venv_arms
venv_arms\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

Backend runs on `http://127.0.0.1:8000`  
Frontend runs on `http://localhost:3000`

API docs available at `http://127.0.0.1:8000/docs`

---

## Environment Variables

Create `backend/.env`:
```
GROQ_API_KEY=your_groq_api_key_here
```

Do not commit `.env` to git. Add it to `.gitignore`.
