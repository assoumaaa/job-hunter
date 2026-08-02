"""The single seam to the language model.

One place knows the Anthropic SDK: how the client is built, how a response is
decoded (text block vs forced tool call), how JSON is pulled out of a reply, and
how transient failures are retried. Everything else in the app crosses *this*
interface instead of touching `anthropic` directly.

Interface (everything a caller must know):

    complete_text(model=..., messages=[...], system=..., max_tokens=...) -> str
    complete_json(model=..., messages=[...], system=..., max_tokens=...) -> dict
    complete_tool(model=..., messages=[...], tool={...}, system=...) -> dict

`messages`/`system`/`tools` use the Anthropic message shape (dicts), so prompt
caching via `cache_control` blocks still works — that's part of the interface,
not a leak. What does NOT cross the seam is the SDK *response* object: callers
get a `str`, a parsed `dict`, or a forced tool's input `dict`.

Test seam: swap the whole model with `llm.use(FakeLLM([...]))` and restore with
`llm.reset()`. No call site changes; nothing hits the network.
"""

from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass
from typing import Any, Protocol

import anthropic

from . import credentials

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Model registry — the two tiers, resolved per request. Haiku for cheap bulk
# work (screening, parsing, scoring); Sonnet for quality generation and
# judgment. The concrete model id comes from the active credential bundle
# (per-user choice → config default), so callers say which *tier* they want.
# ---------------------------------------------------------------------------
def screening_model() -> str:
    """The model id for cheap bulk work, for the current request."""
    return credentials.current().screening_model


def generation_model() -> str:
    """The model id for quality generation, for the current request."""
    return credentials.current().generation_model

# A system prompt is either a plain string or a list of cache-control blocks.
System = str | list[dict[str, Any]]

# Retry policy for transient API failures.
_MAX_RETRIES = 2
_BACKOFF_BASE = 0.75  # seconds; doubles each attempt
_RETRYABLE = (
    anthropic.RateLimitError,
    anthropic.APIConnectionError,
    anthropic.InternalServerError,
)


# ---------------------------------------------------------------------------
# Normalized result — what every adapter returns. The SDK response shape stops
# here.
# ---------------------------------------------------------------------------
@dataclass
class LLMResult:
    text: str = ""
    tool_input: dict | None = None


class LLMAdapter(Protocol):
    """A thing that can run one message and return a normalized result."""

    def run(
        self,
        *,
        model: str,
        messages: list[dict],
        system: System | None = None,
        max_tokens: int = 4096,
        tools: list[dict] | None = None,
        tool_choice: dict | None = None,
    ) -> LLMResult: ...


def _decode(resp) -> LLMResult:
    """Collapse an Anthropic response into text + optional forced-tool input.

    Takes the first text block and the first tool_use block — which is all any
    caller in this app needs, since tool calls are always forced to a single
    tool.
    """
    text = ""
    tool_input: dict | None = None
    for block in getattr(resp, "content", None) or []:
        btype = getattr(block, "type", None)
        if btype == "text" and not text:
            text = getattr(block, "text", "") or ""
        elif btype == "tool_use" and tool_input is None:
            tool_input = getattr(block, "input", None) or {}
    return LLMResult(text=text, tool_input=tool_input)


# Anthropic clients cached per API key — a request uses the current user's key
# (or the .env fallback), and we don't rebuild the client on every call.
_clients: dict[str, anthropic.Anthropic] = {}


def _client_for(api_key: str) -> anthropic.Anthropic:
    client = _clients.get(api_key)
    if client is None:
        client = anthropic.Anthropic(api_key=api_key)
        _clients[api_key] = client
    return client


class AnthropicLLM:
    """The production adapter: resolves the active user's key per call and reuses
    a cached client per distinct key."""

    def __init__(self, client: anthropic.Anthropic | None = None) -> None:
        # An explicit client is an escape hatch (tests); otherwise the key is
        # resolved per call from the active credential bundle.
        self._client = client

    def run(
        self,
        *,
        model: str,
        messages: list[dict],
        system: System | None = None,
        max_tokens: int = 4096,
        tools: list[dict] | None = None,
        tool_choice: dict | None = None,
    ) -> LLMResult:
        client = self._client or _client_for(credentials.require_anthropic())
        kwargs: dict[str, Any] = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": messages,
        }
        if system is not None:
            kwargs["system"] = system
        if tools is not None:
            kwargs["tools"] = tools
        if tool_choice is not None:
            kwargs["tool_choice"] = tool_choice
        return _decode(client.messages.create(**kwargs))


class FakeLLM:
    """Test adapter. Feed it canned replies; it records every call it receives.

    A reply may be a ``str`` (becomes ``text``), a ``dict`` (becomes both JSON
    ``text`` and ``tool_input``), or an ``LLMResult``. Replies are consumed in
    order; once exhausted, ``default`` is returned for every further call.
    """

    def __init__(
        self,
        replies: list[str | dict | LLMResult] | None = None,
        default: str | dict | LLMResult = "",
    ) -> None:
        self._replies = list(replies or [])
        self._default = default
        self.calls: list[dict] = []

    @staticmethod
    def _coerce(reply: str | dict | LLMResult) -> LLMResult:
        if isinstance(reply, LLMResult):
            return reply
        if isinstance(reply, dict):
            return LLMResult(text=json.dumps(reply), tool_input=reply)
        return LLMResult(text=str(reply))

    def run(self, **kwargs) -> LLMResult:
        self.calls.append(kwargs)
        reply = self._replies.pop(0) if self._replies else self._default
        return self._coerce(reply)


# ---------------------------------------------------------------------------
# Active adapter — lazily the real one, swappable for tests. Lazy construction
# means merely importing this module has no side effects (no client built, no
# key required).
# ---------------------------------------------------------------------------
_active: LLMAdapter | None = None


def _adapter() -> LLMAdapter:
    global _active
    if _active is None:
        _active = AnthropicLLM()
    return _active


def use(adapter: LLMAdapter) -> None:
    """Install `adapter` as the active model (tests: `use(FakeLLM([...]))`)."""
    global _active
    _active = adapter


def reset() -> None:
    """Restore the default production adapter."""
    global _active
    _active = None


def _run(
    *,
    model: str,
    messages: list[dict],
    system: System | None = None,
    max_tokens: int = 4096,
    tools: list[dict] | None = None,
    tool_choice: dict | None = None,
) -> LLMResult:
    """Call the active adapter, retrying transient failures with backoff."""
    last_err: Exception | None = None
    for attempt in range(_MAX_RETRIES + 1):
        try:
            return _adapter().run(
                model=model,
                messages=messages,
                system=system,
                max_tokens=max_tokens,
                tools=tools,
                tool_choice=tool_choice,
            )
        except _RETRYABLE as e:
            last_err = e
            if attempt >= _MAX_RETRIES:
                break
            delay = _BACKOFF_BASE * (2**attempt)
            logger.warning(
                "LLM call failed (%s); retry %d/%d in %.1fs",
                e.__class__.__name__,
                attempt + 1,
                _MAX_RETRIES,
                delay,
            )
            time.sleep(delay)
    assert last_err is not None
    raise last_err


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------
def complete_text(
    *,
    model: str,
    messages: list[dict],
    system: System | None = None,
    max_tokens: int = 4096,
) -> str:
    """Return the model's reply as plain text ("" if it produced no text)."""
    return _run(
        model=model, messages=messages, system=system, max_tokens=max_tokens
    ).text


def complete_json(
    *,
    model: str,
    messages: list[dict],
    system: System | None = None,
    max_tokens: int = 4096,
) -> dict:
    """Return the model's reply parsed as a JSON object ({} if unparseable)."""
    return extract_json(
        complete_text(
            model=model, messages=messages, system=system, max_tokens=max_tokens
        )
    )


def complete_tool(
    *,
    model: str,
    messages: list[dict],
    tool: dict,
    tool_name: str | None = None,
    system: System | None = None,
    max_tokens: int = 4096,
) -> dict:
    """Force `tool` and return its input dict ({} if the model didn't call it)."""
    name = tool_name or tool["name"]
    result = _run(
        model=model,
        messages=messages,
        system=system,
        max_tokens=max_tokens,
        tools=[tool],
        tool_choice={"type": "tool", "name": name},
    )
    return result.tool_input or {}


# ---------------------------------------------------------------------------
# JSON extraction — the shared reply parser (was claude._extract_json).
# ---------------------------------------------------------------------------
def strip_fences(s: str) -> str:
    """Drop a leading ```lang fence and any trailing backticks."""
    return (
        re.sub(r"^```[a-z]*\n?", "", s.strip(), flags=re.IGNORECASE).rstrip("`").strip()
    )


def extract_json(text: str) -> dict:
    """Extract the first valid JSON object from text, handling code fences."""
    stripped = strip_fences(text)
    try:
        return json.loads(stripped)
    except (json.JSONDecodeError, ValueError):
        pass
    # Find the outermost { ... } with balanced braces
    depth = 0
    start = None
    for i, c in enumerate(stripped):
        if c == "{":
            if depth == 0:
                start = i
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0 and start is not None:
                try:
                    return json.loads(stripped[start : i + 1])
                except json.JSONDecodeError:
                    start = None
    return {}
