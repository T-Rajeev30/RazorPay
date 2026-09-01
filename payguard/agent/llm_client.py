"""
llm_client.py

Single responsibility: talk to Groq's OpenAI-compatible chat completions
API and return parsed JSON. The HTTP call is injectable (http_post) so
tests never hit the real network.
"""
import json

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = "openai/gpt-oss-120b"


class LLMClient:
    def __init__(self, api_key, model=DEFAULT_MODEL, http_post=None):
        self.api_key = api_key
        self.model = model
        # Injectable for testing; defaults to a lazy import of requests.post
        # so importing this module never requires network access.
        if http_post is None:
            import requests
            http_post = requests.post
        self._http_post = http_post

    def complete_json(self, system_prompt, user_message):
        response = self._http_post(
            GROQ_API_URL,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                "temperature": 0,
                "response_format": {"type": "json_object"},
            },
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        return json.loads(content)