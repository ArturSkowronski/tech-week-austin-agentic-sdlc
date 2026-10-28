"""A minimal client for any OpenAI-compatible API (OpenAI, OpenRouter, LiteLLM, vLLM, Ollama...).

Environment: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL.
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request


def configured() -> bool:
    return all(os.environ.get(k) for k in ("LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL"))


def chat(system: str, user: str, *, max_tokens: int = 2000, timeout: int = 180) -> str:
    body = {
        "model": os.environ["LLM_MODEL"],
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "max_tokens": max_tokens,
        "temperature": 0,
    }

    def post(data: dict) -> dict:
        request = urllib.request.Request(
            os.environ["LLM_BASE_URL"].rstrip("/") + "/chat/completions",
            data=json.dumps(data).encode(),
            headers={"Authorization": f"Bearer {os.environ['LLM_API_KEY']}", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read())

    try:
        try:
            payload = post(body)
        except urllib.error.HTTPError as err:
            text = err.read()
            # OpenAI's gpt-5 family and the o-series reject max_tokens and temperature: they want max_completion_tokens.
            if err.code != 400 or b"max_completion_tokens" not in text and b"temperature" not in text:
                raise RuntimeError(f"LLM HTTP {err.code}: {text[:300]!r}") from err
            body = {k: v for k, v in body.items() if k not in ("max_tokens", "temperature")}
            payload = post({**body, "max_completion_tokens": max_tokens})
    except urllib.error.HTTPError as err:
        raise RuntimeError(f"LLM HTTP {err.code}: {err.read()[:300]!r}") from err
    return payload["choices"][0]["message"]["content"] or ""


def extract_json(text: str):
    """Models sometimes wrap JSON in ```json ... ```. Take the first object that parses."""
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    candidate = fenced.group(1) if fenced else text[text.find("{"): text.rfind("}") + 1]
    return json.loads(candidate)
