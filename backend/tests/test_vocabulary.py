"""One skill vocabulary for the keyword matcher and the skills whitelist.

Real ATS ranking normalises synonyms before matching ("React.js" is "React",
"Postgres" is "PostgreSQL"). Without that, a literal matcher pushes the
generator to write both forms everywhere.
"""

from app.services import ats_scorer, vocabulary


def test_canonicalize_maps_aliases_to_one_form():
    text = "React.js and Postgres on k8s with RESTful APIs, LLMs and GCP"
    out = vocabulary.canonicalize(text)
    assert "react " in out and "react.js" not in out
    assert "postgresql" in out and "postgres " not in out
    assert "kubernetes" in out
    assert "rest apis" in out
    assert "large language models" in out
    assert "google cloud platform" in out


def test_canonicalize_respects_word_boundaries():
    # "js" inside "json" or "go" inside "google" must not be rewritten.
    out = vocabulary.canonicalize("Parsed JSON with Go on Google Cloud")
    assert "json" in out
    assert "golang" in out
    assert "google cloud platform" in out


def test_tokens_drop_stopwords_and_punctuation():
    assert vocabulary.tokens("Cypress (E2E) & Pytest for the Odoo Framework") == [
        "cypress", "e2e", "pytest", "odoo", "framework",
    ]


def test_keyword_hit_sees_through_synonyms():
    hay = ats_scorer._haystack("Built services on Postgres and React.js, deployed to GCP")
    assert ats_scorer._keyword_hit("PostgreSQL", hay)
    assert ats_scorer._keyword_hit("React", hay)
    assert ats_scorer._keyword_hit("Google Cloud Platform", hay)
    assert not ats_scorer._keyword_hit("MySQL", hay)
