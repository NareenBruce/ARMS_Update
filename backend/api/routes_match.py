import os
import tempfile

from fastapi import APIRouter, UploadFile, File, Form, HTTPException

from core.matcher import run_matching
from core.pdf_extractor import extract_info_from_pdf
from models import ManualMatchRequest, MatchResponse
from config import ACTIVE_YEAR_THRESHOLD, CURRENT_YEAR

router = APIRouter(prefix="/api/match", tags=["Matching"])


def _clamp_start_year(start_year):
    """Clamp the publication-year filter to [ACTIVE_YEAR_THRESHOLD, CURRENT_YEAR]."""
    if start_year is None:
        return ACTIVE_YEAR_THRESHOLD
    try:
        return max(ACTIVE_YEAR_THRESHOLD, min(int(start_year), CURRENT_YEAR))
    except (ValueError, TypeError):
        return ACTIVE_YEAR_THRESHOLD


@router.post("/manual", response_model=MatchResponse)
async def match_manual(req: ManualMatchRequest):
    """Match reviewers using manually entered title, abstract, and keywords."""
    from main import app_state

    if not app_state.get("experts"):
        raise HTTPException(status_code=503, detail="No reviewer data loaded. Add reviewers first.")

    result = run_matching(
        experts=app_state["experts"],
        model=app_state["model"],
        title=req.title,
        abstract=req.abstract or "",
        keywords=req.keywords or "",
        start_year=_clamp_start_year(req.start_year),
        hidden=app_state["hidden"]
    )
    return result


@router.post("/pdf", response_model=MatchResponse)
async def match_pdf(
    file: UploadFile = File(...),
    title: str = Form(None),
    abstract: str = Form(None),
    keywords: str = Form(None),
    start_year: int = Form(2020)
):
    """Match reviewers using an uploaded PDF. Optionally override extracted fields."""
    from main import app_state

    if not app_state.get("experts"):
        raise HTTPException(status_code=503, detail="No reviewer data loaded. Add reviewers first.")

    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    # Save uploaded PDF to temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Extract from PDF
        extracted_title, extracted_abstract, extracted_keywords = extract_info_from_pdf(tmp_path)

        # Use provided values or fall back to extracted
        final_title = title or extracted_title
        final_abstract = abstract or extracted_abstract
        final_keywords = keywords or extracted_keywords

        if not final_title and not final_abstract:
            raise HTTPException(status_code=422, detail="Could not extract text from PDF. Please enter manually.")

        result = run_matching(
            experts=app_state["experts"],
            model=app_state["model"],
            title=final_title,
            abstract=final_abstract or "",
            keywords=final_keywords or "",
            start_year=_clamp_start_year(start_year),
            hidden=app_state["hidden"]
        )
        return result
    finally:
        os.unlink(tmp_path)


def _read_batch_titles(file_path):
    """Reads CSV or JSON file. Returns list of titles (strings)."""
    ext = os.path.splitext(file_path)[1].lower()
    titles = []

    if ext == '.csv':
        import csv
        with open(file_path, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            fieldnames = [fn.strip() for fn in reader.fieldnames] if reader.fieldnames else []

            title_col = None
            for fn in fieldnames:
                fn_lower = fn.lower().strip()
                if any(x in fn_lower for x in ('new paper title', 'paper title', 'title', 'topic', 'paper')):
                    title_col = fn
                    break
            
            if not title_col and fieldnames:
                title_col = fieldnames[0]

            if not title_col:
                return None

            for row in reader:
                val = row.get(title_col, '')
                if val:
                    val_str = str(val).strip()
                    if val_str:
                        titles.append(val_str)

    elif ext == '.json':
        import json
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        if isinstance(data, list):
            for item in data:
                if isinstance(item, str):
                    titles.append(item.strip())
                elif isinstance(item, dict):
                    title_key = None
                    for k in item.keys():
                        k_lower = k.lower().strip()
                        if any(x in k_lower for x in ('new paper title', 'paper title', 'title', 'topic', 'paper')):
                            title_key = k
                            break
                    if not title_key and item.keys():
                        title_key = list(item.keys())[0]
                    
                    if title_key:
                        val = item.get(title_key, '')
                        if val:
                            titles.append(str(val).strip())
    return titles


@router.post("/batch")
async def match_batch(
    file: UploadFile = File(...),
    start_year: int = Form(2020)
):
    """Accepts a CSV or JSON file of paper titles and matches them against the database.
    Returns a wide-column CSV response.
    """
    from main import app_state
    from fastapi.responses import StreamingResponse
    import csv
    import io

    if not app_state.get("experts"):
        raise HTTPException(status_code=503, detail="No reviewer data loaded. Add reviewers first.")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ('.csv', '.json'):
        raise HTTPException(status_code=400, detail="Only .csv and .json files are accepted.")

    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        titles = _read_batch_titles(tmp_path)
    finally:
        os.unlink(tmp_path)

    if not titles:
        raise HTTPException(status_code=400, detail="Could not extract titles from file.")

    clamped_start_year = _clamp_start_year(start_year)

    output = io.StringIO()
    writer = csv.writer(output)

    # Header row (Option B)
    writer.writerow([
        "New Paper Title",
        "Recommended Expert 1",
        "Expert 1 Best Matching Paper",
        "Expert 1 Top-3 Mean Score",
        "Recommended Expert 2",
        "Expert 2 Best Matching Paper",
        "Expert 2 Top-3 Mean Score",
        "Recommended Expert 3",
        "Expert 3 Best Matching Paper",
        "Expert 3 Top-3 Mean Score"
    ])

    for title in titles:
        match_res = run_matching(
            experts=app_state["experts"],
            model=app_state["model"],
            title=title,
            abstract="",
            keywords="",
            start_year=clamped_start_year,
            hidden=app_state["hidden"]
        )
        results = match_res.get("results", [])
        
        row = [title]
        for i in range(3):
            if i < len(results):
                res = results[i]
                row.extend([
                    res["name"],
                    res["best_paper"],
                    res["wtd_score"]
                ])
            else:
                row.extend(["", "", ""])
        writer.writerow(row)

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode('utf-8-sig')),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=reviewer_matches.csv"}
    )