import json

from config import HIDDEN_REVIEWERS_FILE

"""Manages the user-editable blocklist of hidden reviewers.

Hidden reviewers are excluded from match results but keep all their data and
embeddings, so hiding/unhiding is instant and reversible. The list is a plain
JSON array of Google Scholar IDs, kept separate from the reviewer database so
it survives scrapes untouched.
"""


def load_hidden():
    """Returns the set of hidden g_scholar_ids. Empty set if the file is missing."""
    try:
        with open(HIDDEN_REVIEWERS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return set(data) if isinstance(data, list) else set()
    except (FileNotFoundError, json.JSONDecodeError):
        return set()


def _save_hidden(hidden_set):
    with open(HIDDEN_REVIEWERS_FILE, 'w', encoding='utf-8') as f:
        json.dump(sorted(hidden_set), f, indent=4, ensure_ascii=False)


def add_hidden(g_scholar_id):
    """Adds an id to the blocklist and persists it. Returns the updated set."""
    hidden = load_hidden()
    hidden.add(g_scholar_id)
    _save_hidden(hidden)
    return hidden


def remove_hidden(g_scholar_id):
    """Removes an id from the blocklist and persists it. Returns the updated set."""
    hidden = load_hidden()
    hidden.discard(g_scholar_id)
    _save_hidden(hidden)
    return hidden
