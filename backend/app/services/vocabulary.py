"""The skill vocabulary — synonyms and tokenising shared by every stage that
compares skill terms.

Real ATS ranking normalises synonyms before it matches ("React.js" is "React",
"Postgres" is "PostgreSQL", "k8s" is "Kubernetes"). A literal matcher does the
opposite of what we want: it rewards writing both forms everywhere and punishes
a CV that happens to use the other spelling. Both the keyword scorer
(`ats_scorer`) and the skills whitelist (`resume.merge_identity`) read through
`canonicalize`, so they can never disagree about whether two terms are the
same skill.
"""

from __future__ import annotations

import re

# canonical form -> the variants folded into it (all lowercase). The canonical
# forms are also matched, as identities, so a longer canonical ("material ui")
# shields its parts from a shorter variant ("ui").
ALIASES: dict[str, tuple[str, ...]] = {
    "react": ("react.js", "reactjs"),
    "node.js": ("nodejs", "node js"),
    "vue": ("vue.js", "vuejs"),
    "angular": ("angularjs", "angular.js"),
    "next.js": ("nextjs",),
    "postgresql": ("postgres", "psql"),
    "kubernetes": ("k8s",),
    "javascript": ("js",),
    "google cloud platform": ("gcp", "google cloud"),
    "amazon web services": ("aws",),
    "microsoft azure": ("azure",),
    "rest apis": ("restful apis", "restful api", "rest api", "restful services", "restful"),
    "large language models": ("llms", "llm", "large language model"),
    "machine learning": ("ml",),
    "artificial intelligence": ("ai",),
    "natural language processing": ("nlp",),
    "retrieval-augmented generation": ("rag", "retrieval augmented generation"),
    "ci/cd": (
        "ci cd", "ci-cd", "cicd",
        "continuous integration", "continuous delivery", "continuous deployment",
    ),
    "infrastructure as code": ("iac",),
    "material ui": ("mui",),
    "end-to-end": ("e2e", "end to end"),
    "websockets": ("websocket", "web sockets", "web socket"),
    "user interface": ("ui",),
    "user experience": ("ux",),
    "c#": ("csharp", "c sharp"),
    "c++": ("cpp",),
    "golang": ("go",),
    "point of sale": ("pos",),
    "enterprise resource planning": ("erp",),
    "customer relationship management": ("crm",),
    "warehouse management system": ("wms",),
    "test-driven development": ("tdd", "test driven development"),
    "internet of things": ("iot",),
    "two-factor authentication": ("2fa", "two factor authentication"),
    "pre-sales": ("presales", "pre sales"),
    "full-stack": ("fullstack", "full stack"),
    "microservices": ("micro-services", "micro services"),
    "object-relational mapping": ("orm",),
    "software engineer": ("swe", "software developer"),
    "engineer": ("developer",),
}

_LOOKUP: dict[str, str] = {}
for _canonical, _variants in ALIASES.items():
    _LOOKUP[_canonical] = _canonical
    for _variant in _variants:
        _LOOKUP[_variant] = _canonical

# One pass, longest alternative first, so "react.js" is taken before "react"
# and a canonical phrase is never re-scanned for its own parts.
_ALIAS_PATTERN = re.compile(
    r"(?<![\w])("
    + "|".join(re.escape(k) for k in sorted(_LOOKUP, key=len, reverse=True))
    + r")(?![\w])"
)

STOPWORDS = frozenset(
    "a an and at by for from in of on or the to via with using across".split()
)

_TOKEN = re.compile(r"[a-z0-9][a-z0-9+#./\-]*")


def canonicalize(text: str) -> str:
    """Lowercase `text` and fold every known alias into its canonical form."""
    return _ALIAS_PATTERN.sub(lambda m: _LOOKUP[m.group(1)], (text or "").lower())


def tokens(text: str) -> list[str]:
    """The significant words of `text`: lowercase, punctuation stripped, stop
    words dropped. Word-internal + # . / - survive ("c++", "node.js", "ci/cd")."""
    out = []
    for tok in _TOKEN.findall((text or "").lower()):
        tok = tok.strip("./-")
        if tok and tok not in STOPWORDS:
            out.append(tok)
    return out
