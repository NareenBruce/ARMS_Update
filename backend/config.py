import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

# --- API Keys ---
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
LLM_MODEL_NAME = "openai/gpt-oss-120b"

# --- File Paths ---
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
REVIEWERS_DB_FILE = os.path.join(DATA_DIR, "reviewers_database.json")
REVIEWERS_PKL_FILE = os.path.join(DATA_DIR, "reviewers_embeddings.pkl")
REVIEWERS_SQLITE_FILE = os.path.join(DATA_DIR, "reviewers.db")

# --- Model ---
MODEL_NAME = "sentence-transformers/allenai-specter"
TOP_N = 3
ACTIVE_YEAR_THRESHOLD = 2020

# --- Recency Weighting ---
RECENCY_DECAY = 0.85
CURRENT_YEAR = datetime.now().year

# --- Scraping ---
CHROME_DEBUG_PORT = 9222
