import re

try:
    import fitz  # PyMuPDF
    FITZ_AVAILABLE = True
except ImportError:
    FITZ_AVAILABLE = False


def extract_info_from_pdf(pdf_path):
    """Extracts Title (by font size) and Abstract/Keywords (by Regex Anchors)."""
    if not FITZ_AVAILABLE:
        return "", "", ""
    try:
        doc = fitz.open(pdf_path)

        page0 = doc[0]
        blocks = page0.get_text("dict")["blocks"]
        text_by_font = {}

        for b in blocks:
            if "lines" in b:
                for line in b["lines"]:
                    for span in line["spans"]:
                        size = round(span["size"], 1)
                        text = span["text"].strip()
                        if len(text) > 1:
                            if size not in text_by_font:
                                text_by_font[size] = []
                            text_by_font[size].append(text)

        if text_by_font:
            max_size = max(text_by_font.keys())
            extracted_title = " ".join(text_by_font[max_size])
        else:
            extracted_title = "Unknown Title"

        full_text = ""
        for i in range(min(2, len(doc))):
            full_text += doc[i].get_text("text") + "\n"
        clean_text = re.sub(r'\s+', ' ', full_text)

        extracted_abstract = ""
        extracted_keywords = ""

        abstract_match = re.search(r'(?i)\n\s*(abstract|summary|executive summary)\s*\n', full_text)
        if not abstract_match:
            abstract_match = re.search(r'(?i)\b(abstract|summary|executive summary)\b', clean_text)

        keyword_match = re.search(r'(?i)\b(key\s*words?|index terms|general terms|descriptors)\b', clean_text)
        intro_match = re.search(r'(?i)\b(introduction|background|motivation|1\.\s*introduction)\b', clean_text)

        if abstract_match:
            start_idx = abstract_match.end()
            if keyword_match and keyword_match.start() > start_idx:
                end_idx = keyword_match.start()
            elif intro_match and intro_match.start() > start_idx:
                end_idx = intro_match.start()
            else:
                end_idx = start_idx + 1500
            extracted_abstract = clean_text[start_idx:end_idx].strip()

        if keyword_match:
            start_idx = keyword_match.end()
            if intro_match and intro_match.start() > start_idx:
                end_idx = intro_match.start()
            else:
                end_idx = start_idx + 200
            extracted_keywords = clean_text[start_idx:end_idx].strip()
            extracted_keywords = re.sub(r'^[:\-\s]+', '', extracted_keywords)

        return extracted_title, extracted_abstract, extracted_keywords
    except Exception as e:
        return "", "", ""
