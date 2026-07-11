import re

START_YEAR = 2020


def extract_year(year_obj):
    """Robustly extracts a year from a string or int. Returns 0 if invalid."""
    if not year_obj:
        return 0
    try:
        if isinstance(year_obj, int):
            return year_obj
        match = re.search(r'\d{4}', str(year_obj))
        if match:
            return int(match.group(0))
    except:
        pass
    return 0
