import statistics

from sentence_transformers import util

from core.recency import get_recency_weight, classify_recency, classify_std_dev
from core.llm_agent import generate_llm_justification
from config import TOP_N


def get_expert_scores(expert, query_embedding):
    papers = expert.get('publications', [])
    if not papers:
        return 0, 0, 0, "No Data", [], "Not Active"

    papers_with_emb = [p for p in papers if 'embedding' in p]
    if not papers_with_emb:
        return 0, 0, 0, "No Embeddings", [], "Not Active"

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
    std_dev = statistics.stdev(weighted_scores) if len(weighted_scores) > 1 else 0.0

    # Recency label
    all_weights = [get_recency_weight(p.get('year', '')) for p in papers_with_emb]
    avg_recency = sum(all_weights) / len(all_weights) if all_weights else 0.0
    recency_label = classify_recency(avg_recency)

    return top_3_mean, max_weighted, std_dev, best_paper_title, top_3_titles, recency_label


def run_matching(experts, model, title, abstract, keywords):
    """Runs the full matching pipeline. Returns list of result dicts."""
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
        mean, mx, std, best_paper, top_3_titles, recency_label = get_expert_scores(person, query_embedding)

        if mx > 0.25:
            expert_meta[person['name']] = top_3_titles
            results.append({
                "name": person['name'],
                "g_scholar_id": person.get('g_scholar_id', ''),
                "university": person.get('university', ''),
                "wtd_score": round(mean, 4),
                "wtd_max": round(mx, 4),
                "reliability": classify_std_dev(std),
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
