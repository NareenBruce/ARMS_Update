import json
import sqlite3

from fastapi import APIRouter

from config import REVIEWERS_DB_FILE, REVIEWERS_SQLITE_FILE
from models import ReviewerItem, ReviewerStatsResponse

router = APIRouter(prefix="/api/reviewers", tags=["Database"])


@router.get("", response_model=list[ReviewerItem])
async def get_reviewers(search: str = None):
    """Returns all reviewers, optionally filtered by search term."""
    with open(REVIEWERS_DB_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    results = []
    for person in data:
        item = ReviewerItem(
            name=person.get('name', 'Unknown'),
            g_scholar_id=person.get('g_scholar_id', ''),
            university=person.get('university', ''),
            verified=person.get('verified', True)
        )
        if search:
            search_lower = search.lower()
            if (search_lower in item.name.lower() or
                search_lower in item.university.lower() or
                search_lower in item.g_scholar_id.lower()):
                results.append(item)
        else:
            results.append(item)

    return results


@router.get("/stats", response_model=ReviewerStatsResponse)
async def get_reviewer_stats():
    """Returns summary statistics about the reviewer database."""
    with open(REVIEWERS_DB_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    by_university = {}
    unverified_count = 0

    for person in data:
        uni = person.get('university', 'Unknown')
        by_university[uni] = by_university.get(uni, 0) + 1
        if not person.get('verified', True):
            unverified_count += 1

    return ReviewerStatsResponse(
        total=len(data),
        by_university=by_university,
        unverified_count=unverified_count
    )
