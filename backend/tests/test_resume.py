"""The Résumé document is one shape shared by parse, generate, and render."""

from app.services import cv_parser, resume


def test_normalize_fills_every_section():
    out = resume.normalize({"summary": "Hi"})
    for section in ("header", "experience", "projects", "education", "certifications", "skills", "languages"):
        assert section in out
    assert out["summary"] == "Hi"
    assert out["experience"] == []


def test_normalize_preserves_unknown_keys():
    out = resume.normalize({"header": {"name": "A", "customField": "keep"}, "extraTop": 1})
    assert out["header"]["name"] == "A"
    assert out["header"]["customField"] == "keep"  # extra="allow"
    assert out["extraTop"] == 1


def test_normalize_is_defensive_on_bad_shape():
    # A wrong-typed section must not raise — normalize falls back to input.
    bad = {"experience": "not a list"}
    assert resume.normalize(bad) == bad


def test_merge_identity_grafts_header_and_languages():
    generated = {"summary": "tailored", "experience": [{"company": "Acme"}]}
    base = {"header": {"name": "Omar"}, "languages": [{"name": "English", "level": "Native"}]}
    merged = resume.merge_identity(generated, base)
    assert merged["summary"] == "tailored"  # tailored content kept
    assert merged["header"] == {"name": "Omar"}  # identity grafted
    assert merged["languages"] == [{"name": "English", "level": "Native"}]


def test_parse_schema_is_the_single_source():
    # cv_parser shows the model the one canonical schema.
    assert cv_parser.CV_SCHEMA is resume.SCHEMA_JSON


def test_cv_parser_returns_normalized_shape_offline(fake_llm):
    fake_llm([{"header": {"name": "Omar"}, "summary": "Engineer."}])
    parsed = cv_parser.parse_cv_text("Omar\nEngineer")
    # Whatever the model returns is normalized into the canonical shape.
    assert parsed["header"]["name"] == "Omar"
    assert parsed["experience"] == []
    assert "skills" in parsed
