import re


def validate_gs_id(gs_id):
    """Validates Google Scholar ID format: ~12 chars, alphanumeric+_- , ends with J."""
    gs_id = gs_id.strip()
    if len(gs_id) < 8 or len(gs_id) > 20:
        return False
    if not gs_id.endswith('J'):
        return False
    if not re.match(r'^[a-zA-Z0-9_\-]+J$', gs_id):
        return False
    return True


def validate_university(name):
    """University name must contain 'University' in full English form."""
    name = name.strip()
    if 'University' not in name:
        return False
    return True
