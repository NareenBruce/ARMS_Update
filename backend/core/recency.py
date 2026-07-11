from config import RECENCY_DECAY, CURRENT_YEAR


def get_recency_weight(year_str):
    """
    Returns exponential decay factor based on paper publication year.
    Formula: RECENCY_DECAY ^ (CURRENT_YEAR - year)
    - Current year paper → 1.00, 1 year old → 0.85, 2 years old → 0.72, ...
    - No year or unparseable → 0.0
    """
    try:
        year = int(str(year_str).strip())
        if year > CURRENT_YEAR or year < 1900:
            return 0.0
        return RECENCY_DECAY ** (CURRENT_YEAR - year)
    except (ValueError, TypeError):
        return 0.0


def classify_recency(avg_recency):
    if avg_recency >= 0.85:
        return "Active"
    elif avg_recency >= 0.50:
        return "Mildly Active"
    else:
        return "Not Active"
