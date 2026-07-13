import json
import sqlite3

from fastapi import APIRouter

from fastapi import HTTPException

from config import REVIEWERS_DB_FILE, REVIEWERS_SQLITE_FILE
from core.hidden import load_hidden, add_hidden, remove_hidden
from core.embeddings import delete_reviewer, reload_experts
from models import ReviewerItem, ReviewerStatsResponse, HideReviewerRequest, HiddenListResponse

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
        unverified_count=unverified_count,
        hidden_count=len(load_hidden())
    )


@router.get("/hidden", response_model=HiddenListResponse)
async def get_hidden():
    """Returns the list of hidden (blocklisted) reviewer Scholar IDs."""
    return HiddenListResponse(hidden_ids=sorted(load_hidden()))


@router.post("/hide", response_model=HiddenListResponse)
async def hide_reviewer(req: HideReviewerRequest):
    """Adds a reviewer to the blocklist so they are excluded from matches."""
    from main import app_state

    app_state["hidden"] = add_hidden(req.g_scholar_id)
    return HiddenListResponse(hidden_ids=sorted(app_state["hidden"]))


@router.post("/unhide", response_model=HiddenListResponse)
async def unhide_reviewer(req: HideReviewerRequest):
    """Removes a reviewer from the blocklist so they can be matched again."""
    from main import app_state

    app_state["hidden"] = remove_hidden(req.g_scholar_id)
    return HiddenListResponse(hidden_ids=sorted(app_state["hidden"]))


@router.post("/delete")
async def delete_reviewer_endpoint(req: HideReviewerRequest):
    """Permanently deletes a reviewer from the JSON, PKL, and SQLite stores."""
    from main import app_state

    found = delete_reviewer(req.g_scholar_id)
    if not found:
        raise HTTPException(status_code=404, detail="Reviewer not found in database.")

    # Refresh in-memory experts and drop any stale blocklist entry.
    app_state["experts"] = reload_experts()
    app_state["hidden"] = remove_hidden(req.g_scholar_id)

    return {"status": "deleted", "g_scholar_id": req.g_scholar_id}
