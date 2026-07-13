from sentence_transformers import util

from core.recency import get_recency_weight, classify_recency
from core.llm_agent import generate_llm_justification
from scraper.active_filter import extract_year
from config import TOP_N, ACTIVE_YEAR_THRESHOLD


def classify_match_confidence(wtd_score):
    """Labels how well the reviewer fits THIS topic, from the weighted match
    score (the same value shown as the percentage on the result card)."""
    if wtd_score >= 0.60:
        return "Strong Fit"
    elif wtd_score >= 0.40:
        return "Good Fit"
    else:
        return "Weak Fit"


def get_expert_scores(expert, query_embedding, start_year=ACTIVE_YEAR_THRESHOLD):
    papers = expert.get('publications', [])
    if not papers:
        return 0, 0, "No Data", [], "Not Active"

    papers_with_emb = [p for p in papers if 'embedding' in p]
    if not papers_with_emb:
        return 0, 0, "No Embeddings", [], "Not Active"

    # Publication-year filter (match-time). Default equals the DB floor, so it
    # is a no-op unless the user raises the year above ACTIVE_YEAR_THRESHOLD.
    if start_year > ACTIVE_YEAR_THRESHOLD:
        papers_with_emb = [p for p in papers_with_emb if extract_year(p.get('year')) >= start_year]
        if not papers_with_emb:
            return 0, 0, "No Papers In Range", [], "Not Active"

    paper_embeddings = [p['embedding'] for p in papers_with_emb]
    raw_scores = util.cos_sim(query_embedding, paper_embeddings)[0].tolist()

    # Apply recency weighting to each cosine score
    weighted_scores = []
    for i, raw_score in enumerate(raw_scores):
        weight = get_recency_weight(papers_with_emb[i].get('year', ''))
        weighted_scores.append(raw_score * weight)

    max_weighted = max(weighted_scores)
    best_idx = weighted_scores.index(max_weighted)
    best_paper_title = papers_with_emb[best_idx]['title']

    paired_scores = list(zip(weighted_scores, papers_with_emb))
    paired_scores.sort(key=lambda x: x[0], reverse=True)

    top_3_pairs = paired_scores[:3]
    top_3_weighted = [p[0] for p in top_3_pairs]
    top_3_titles = [p[1]['title'] for p in top_3_pairs]

    k = len(top_3_weighted)
    top_3_mean = sum(top_3_weighted) / k if k > 0 else 0

    # Recency label — computed over the top-3 topic-matching papers only, so it
    # reflects how recently this reviewer has worked on THIS specific topic
    # rather than their overall publishing activity across all fields.
    top_3_papers = [p[1] for p in top_3_pairs]
    top_3_weights = [get_recency_weight(p.get('year', '')) for p in top_3_papers]
    avg_recency = sum(top_3_weights) / len(top_3_weights) if top_3_weights else 0.0
    recency_label = classify_recency(avg_recency)

    return top_3_mean, max_weighted, best_paper_title, top_3_titles, recency_label


def run_matching(experts, model, title, abstract, keywords, start_year=ACTIVE_YEAR_THRESHOLD, hidden=None):
    """Runs the full matching pipeline. Returns list of result dicts.

    start_year filters each reviewer's publications to those from that year
    onward before scoring. Defaults to ACTIVE_YEAR_THRESHOLD (the DB floor).

    hidden is a set of g_scholar_ids to exclude from results (the user's
    blocklist). Their data is untouched — they are simply skipped here.
    """
    hidden = hidden or set()
    query_parts = [title]
    if keywords:
        query_parts.append(keywords)
    if abstract:
        query_parts.append(abstract)

    query_text = " [SEP] ".join(query_parts)
    query_embedding = model.encode(query_text, convert_to_numpy=True)

    results = []
    expert_meta = {}

    for person in experts:
        if person.get('g_scholar_id', '') in hidden:
            continue

        mean, mx, best_paper, top_3_titles, recency_label = get_expert_scores(person, query_embedding, start_year)

        if mx > 0.25:
            expert_meta[person['name']] = top_3_titles
            results.append({
                "name": person['name'],
                "g_scholar_id": person.get('g_scholar_id', ''),
                "university": person.get('university', ''),
                "wtd_score": round(mean, 4),
                "wtd_max": round(mx, 4),
                "reliability": classify_match_confidence(mean),
                "recency": recency_label,
                "best_paper": best_paper,
                "top_3_papers": top_3_titles
            })

    results.sort(key=lambda x: x['wtd_score'], reverse=True)
    top_results = results[:TOP_N]

    # Generate LLM justification for the #1 match
    justification = ""
    if top_results:
        top_expert_name = top_results[0]['name']
        top_expert_papers = expert_meta.get(top_expert_name, [])
        justification = generate_llm_justification(
            {"title": title, "abstract": abstract, "keywords": keywords},
            top_expert_name,
            top_expert_papers
        )

    return {
        "results": top_results,
        "justification": justification
    }
