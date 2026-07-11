import json
import os
import sys

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure backend/ is in path for imports
sys.path.insert(0, os.path.dirname(__file__))

from config import REVIEWERS_DB_FILE, REVIEWERS_PKL_FILE, MODEL_NAME
from core.embeddings import init_embeddings, init_sqlite_db, reload_experts
from api.routes_match import router as match_router
from api.routes_database import router as database_router
from api.routes_scrape import router as scrape_router

# Global state shared across routes
app_state = {
    "model": None,
    "experts": [],
    "db_file": REVIEWERS_DB_FILE,
    "pkl_file": REVIEWERS_PKL_FILE,
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: load model + data. Shutdown: cleanup."""
    print("[*] Loading SPECTER embedding model...")
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer(MODEL_NAME)
    app_state["model"] = model
    print("[OK] Model loaded.")

    print("[*] Initializing embeddings (will auto-scrape if needed)...")
    init_embeddings(model)
    print("[OK] Embeddings ready.")

    print("[*] Loading reviewer data...")
    init_sqlite_db()
    app_state["experts"] = reload_experts()
    print(f"[OK] {len(app_state['experts'])} reviewers loaded.")

    yield

    print("[*] Shutting down...")


app = FastAPI(
    title="ARMS API",
    description="Academic Reviewer Matching System — Backend API",
    version="2.0.0",
    lifespan=lifespan
)

# CORS — allow Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://10.122.76.36:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(match_router)
app.include_router(database_router)
app.include_router(scrape_router)


@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "reviewers": len(app_state["experts"]),
        "model_loaded": app_state["model"] is not None
    }
