from pydantic import BaseModel
from typing import Optional


# --- Request Models ---

class ManualMatchRequest(BaseModel):
    title: str
    abstract: Optional[str] = ""
    keywords: Optional[str] = ""


class SingleScrapeRequest(BaseModel):
    name: str
    g_scholar_id: str
    university: str


class BatchScrapeRequest(BaseModel):
    university: str


# --- Response Models ---

class MatchResult(BaseModel):
    name: str
    g_scholar_id: str
    university: str
    wtd_score: float
    wtd_max: float
    reliability: str
    recency: str
    best_paper: str
    top_3_papers: list[str]


class MatchResponse(BaseModel):
    results: list[MatchResult]
    justification: str


class ReviewerItem(BaseModel):
    name: str
    g_scholar_id: str
    university: Optional[str] = ""
    verified: Optional[bool] = True


class ReviewerStatsResponse(BaseModel):
    total: int
    by_university: dict[str, int]
    unverified_count: int


class ScrapeSingleResponse(BaseModel):
    status: str
    name: Optional[str] = None
    reason: Optional[str] = None
    g_scholar_id: Optional[str] = None
    university: Optional[str] = None
    email: Optional[str] = None
    publications_count: Optional[int] = None


class ScrapeBatchResponse(BaseModel):
    verified: int
    unverified: int
    inactive: int
    failed: int
    details: dict
