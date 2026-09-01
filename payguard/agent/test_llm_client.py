import json
import pytest
from llm_client import LLMClient


class FakeResponse:
    def __init__(self, json_data, status_code=200):
        self._json_data = json_data
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise Exception(f"HTTP {self.status_code}")

    def json(self):
        return self._json_data


def make_fake_post(reply_content, captured=None):
    def fake_post(url, headers, json, timeout):
        if captured is not None:
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            captured["timeout"] = timeout
        return FakeResponse({"choices": [{"message": {"content": reply_content}}]})

    return fake_post


def test_complete_json_parses_valid_json_reply():
    fake_post = make_fake_post('{"productId": "abc123", "quantity": 1}')
    client = LLMClient(api_key="fake-key", http_post=fake_post)

    result = client.complete_json("system prompt", "user message")

    assert result == {"productId": "abc123", "quantity": 1}


def test_complete_json_sends_correct_request_shape():
    captured = {}
    fake_post = make_fake_post('{"ok": true}', captured=captured)
    client = LLMClient(api_key="fake-key", model="test-model", http_post=fake_post)

    client.complete_json("SYS", "USER")

    assert captured["json"]["model"] == "test-model"
    assert captured["json"]["messages"][0] == {"role": "system", "content": "SYS"}
    assert captured["json"]["messages"][1] == {"role": "user", "content": "USER"}
    assert captured["headers"]["Authorization"] == "Bearer fake-key"


def test_complete_json_raises_on_malformed_json_reply():
    fake_post = make_fake_post("not valid json")
    client = LLMClient(api_key="fake-key", http_post=fake_post)

    with pytest.raises(json.JSONDecodeError):
        client.complete_json("system", "user")


def test_complete_json_raises_on_http_error():
    def fake_post(url, headers, json, timeout):
        return FakeResponse({}, status_code=500)

    client = LLMClient(api_key="fake-key", http_post=fake_post)

    with pytest.raises(Exception):
        client.complete_json("system", "user")