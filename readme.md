# ARMS — Automated Reviewer Matching System

A web-based system that automatically matches academic manuscripts to the most suitable reviewers using SPECTER citation-aware embeddings, recency decay weighting, and LLM-generated justifications.

---

## Tech Stack

- **Backend**: Python 3.11, FastAPI, Uvicorn
- **Frontend**: Next.js (Node.js)
- **AI Model**: SPECTER (`allenai-specter`) via sentence-transformers
- **LLM**: gpt-oss-120b (120B MoE) via Groq API

---

## Prerequisites

- Python 3.11 — [Download](https://www.python.org/downloads/release/python-3110/)
- Node.js 18+ — [Download](https://nodejs.org/)
- A `.env` file at the project root (see below)

---

## Project Structure

ARMS/
├── backend/
│   ├── api/
│   ├── core/
│   ├── scraper/
│   ├── main.py
│   ├── config.py
│   ├── models.py
│   └── requirements.txt
├── frontend/
│   └── src/
├── data/
│   ├── reviewers_database.json
│   └── reviewers_embeddings.pkl
├── .env
└── venv_arms/

---

## Setup

### 1. Create the virtual environment using Python 3.11

> Important: Use Python 3.11 specifically. Python 3.12+ is not compatible with PyMuPDF 1.24.10.

```bash
py -3.11 -m venv venv_arms
```

### 2. Activate the virtual environment

```bash
# Windows
venv_arms\Scripts\activate
```

### 3. Install backend dependencies

```bash
pip install -r backend/requirements.txt
```

### 4. Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

---

## Running the App

You need **two terminals open at the same time**.

### Terminal 1 — Backend

```bash
venv_arms\Scripts\activate
cd backend
uvicorn main:app --reload
```

Runs at: http://localhost:8000  
API docs: http://localhost:8000/docs

### Terminal 2 — Frontend

```bash
cd frontend
npm run dev
```

Runs at: http://localhost:3000

---

## Notes

- The SPECTER model downloads automatically on first run — this may take a few minutes.
- Make sure `data/reviewers_database.json` is present before starting.
- The `.env` file must be at the project root for LLM justifications to work.


