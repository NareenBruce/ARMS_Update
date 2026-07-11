import requests
from config import GROQ_API_KEY, GROQ_API_URL, LLM_MODEL_NAME


def generate_llm_justification(query_data, expert_name, expert_top_papers):
    """Uses Groq to explain WHY this expert matches the query."""
    if not GROQ_API_KEY:
        return "LLM justification unavailable — no API key configured."

    expert_profile_text = "\n".join([f"- {title}" for title in expert_top_papers])

    system_prompt = (
        "You are an academic matchmaker agent. "
        "A semantic search engine has identified a Supervisor for a Student Project. "
        "Your job is to explain WHY they are a good match based on the overlap between the Student's Abstract and the Supervisor's Past Papers. "
        "Be concise, professional, and encouraging. Use 'they/them' pronouns. "
        "Limit response to 3 sentences."
    )

    user_prompt = (
        f"STUDENT PROJECT:\nTitle: {query_data['title']}\nAbstract: {query_data['abstract'][:500]}...\n\n"
        f"MATCHED SUPERVISOR: {expert_name}\n"
        f"SUPERVISOR'S RELEVANT PAPERS:\n{expert_profile_text}\n\n"
        f"Task: Write a short justification for this match."
    )

    try:
        payload = {
            "model": LLM_MODEL_NAME,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.3
        }
        headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}

        response = requests.post(GROQ_API_URL, headers=headers, json=payload, timeout=15)
        response.raise_for_status()
        return response.json()['choices'][0]['message']['content'].strip()

    except Exception as e:
        return f"LLM Error: {str(e)}"
