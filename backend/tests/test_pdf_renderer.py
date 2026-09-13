"""The PDF renderer: one deep fit/trim loop, WeasyPrint behind a seam.

The fake renderer reports canned page counts, so the whole auto-fit + trim
algorithm is exercised without WeasyPrint or the font/template filesystem. One
real render at the end proves the production path still works end to end.
"""

from app.services import pdf_generator

_CV = {
    "header": {"name": "Omar", "email": "o@x.com", "phone": "+1", "location": "Berlin"},
    "summary": "Backend engineer.",
    "experience": [
        {"company": "Acme", "title": "SWE", "location": "Berlin", "period": "2020-2024",
         "bullets": ["Built Python FastAPI services", "Shipped Docker deploys"]}
    ],
    "skills": [{"category": "Languages", "items": ["Python"]}],
    "languages": [{"name": "English", "level": "Native"}],
}


class _FakeDoc:
    def __init__(self, pages):
        self.pages = [None] * pages

    def write_pdf(self):
        return b"%PDF-FAKE"


class FakeRenderer:
    """Reports page counts in order; records how many renders happened."""

    def __init__(self, page_counts):
        self._counts = list(page_counts)
        self.calls = 0

    def render(self, html_content, css_strings, base_url):
        self.calls += 1
        pages = self._counts.pop(0) if self._counts else 1
        return _FakeDoc(pages)


def test_fit_returns_at_first_one_page_step():
    pdf_generator.use_renderer(FakeRenderer([1]))
    pdf, data = pdf_generator.fit_and_render(_CV)
    assert pdf == b"%PDF-FAKE"
    assert data == _CV  # unchanged when CSS alone fits


def test_fit_tightens_css_until_one_page():
    fake = FakeRenderer([2, 2, 1])  # steps 0,1 overflow; step 2 fits
    pdf_generator.use_renderer(fake)
    pdf, _ = pdf_generator.fit_and_render(_CV)
    assert pdf == b"%PDF-FAKE"
    assert fake.calls == 3


def test_fit_invokes_trim_when_css_is_exhausted():
    # All 8 CSS steps overflow; after one trim, the first step fits.
    fake = FakeRenderer([2] * 8 + [1])
    pdf_generator.use_renderer(fake)

    trims = []

    def trim(data, overflow_words):
        trims.append(overflow_words)
        return {**data, "_trimmed": True}

    pdf, final = pdf_generator.fit_and_render(_CV, trim_callback=trim)
    assert pdf == b"%PDF-FAKE"
    assert len(trims) == 1  # trimmed once, then it fit
    assert final["_trimmed"] is True
    assert fake.calls == 9  # 8 CSS steps + 1 after the trim


def test_fit_returns_best_effort_when_never_fits():
    # Never converges and no trim callback → best-effort multi-page PDF.
    pdf_generator.use_renderer(FakeRenderer([3] * 8))
    pdf, data = pdf_generator.fit_and_render(_CV)
    assert pdf == b"%PDF-FAKE"
    assert data == _CV


def test_real_render_produces_a_pdf():
    # Default WeasyPrint renderer — the production path, template + fonts on disk.
    pdf, _ = pdf_generator.fit_and_render(_CV)
    assert pdf[:5] == b"%PDF-"
    assert len(pdf) > 1000


def test_header_renders_profile_links():
    """LinkedIn / GitHub / portfolio live in the header schema; the header must
    print them (the old renderer printed location, email and phone only, so a
    tweak that added them never showed up)."""
    data = {
        **_CV,
        "header": {
            **_CV["header"],
            "linkedin": "linkedin.com/in/omar",
            "github": "https://github.com/omar",
            "portfolio": None,
        },
    }
    html = pdf_generator.render_html(data)
    # Scheme-less input is still a working link; the visible text stays short.
    assert 'href="https://linkedin.com/in/omar"' in html
    assert ">linkedin.com/in/omar</a>" in html
    assert 'href="https://github.com/omar"' in html
    assert ">github.com/omar</a>" in html
    assert "portfolio" not in html.lower().split("<body>")[1]


def test_header_without_links_prints_none():
    html = pdf_generator.render_html(_CV)
    body = html.split("<body>")[1]
    assert "linkedin" not in body.lower()
    assert "github" not in body.lower()


_PARSE_CV = {
    "header": {"name": "Omar Assouma", "email": "o@x.com", "phone": "+971 58 525 1231",
               "location": "Dubai, UAE", "linkedin": "linkedin.com/in/omar", "github": "github.com/omar"},
    "summary": "Engineer building efficient office workflows.",
    "experience": [
        {"company": "Odoo", "title": "Software Engineer", "location": "Dubai, UAE",
         "period": "Mar 2024 - Present", "bullets": ["Shipped fintech flows for offline clients"]},
        {"company": "Meikosoft", "title": "Software Engineer", "location": "Istanbul",
         "period": "Nov 2022 - Mar 2024", "bullets": ["Built dashboards"]},
    ],
    "education": [{"degree": "BSc Computer Engineering", "institution": "Sabanci University", "year": "2019 - 2023"}],
    "certifications": [{"title": "LangChain for Python", "org": "LangChain", "year": "2026"}],
    "skills": [{"category": "Backend", "items": ["Python"]}],
    "languages": [{"name": "English", "level": "Fluent"}],
}


def test_parse_back_recovers_every_fact_from_the_real_pdf():
    """What a résumé parser reads back must be what we put in: name, contact,
    links, every company, title, date range, school and degree."""
    pdf, _ = pdf_generator.fit_and_render(_PARSE_CV)
    assert pdf_generator.parse_back_issues(pdf, _PARSE_CV) == []


def test_parse_back_reports_facts_the_pdf_lost():
    pdf, _ = pdf_generator.fit_and_render(_PARSE_CV)
    other = {**_PARSE_CV, "header": {**_PARSE_CV["header"], "phone": "+1 555 0100"},
             "experience": [{**_PARSE_CV["experience"][0], "company": "Globex"}]}
    issues = pdf_generator.parse_back_issues(pdf, other)
    assert any("+1 555 0100" in i for i in issues)
    assert any("Globex" in i for i in issues)


def test_pdf_text_contains_no_ligature_glyphs():
    """'fi', 'fl', 'ffi' must come out as plain letters. Parsers that do not
    decompose ligatures would otherwise index 'e\\ufb03cient' and 'o\\ufb04ine'."""
    import pymupdf

    pdf, _ = pdf_generator.fit_and_render(_PARSE_CV)
    text = pymupdf.open(stream=pdf, filetype="pdf")[0].get_text()
    assert "efficient office workflows" in text
    assert "offline" in text
    assert not any(ch in text for ch in "ﬀﬁﬂﬃﬄ")


def test_header_contact_block_stays_two_lines_with_links():
    """Links must not make the header taller: contact on one line, links on the
    next. Every extra header line is a bullet the fitter will later shorten."""
    import re

    data = {**_CV, "header": {**_CV["header"], "linkedin": "linkedin.com/in/o",
                              "github": "github.com/o", "portfolio": "omar.dev"}}
    html = pdf_generator.render_html(data)
    right = re.search(r'<div class="header-right">(.*?)</div>', html, re.DOTALL).group(1)
    assert right.count("<br>") == 1
    assert "omar.dev" in right


# --- deterministic content trim: never rewrites a bullet -------------------

_TRIM_CV = {
    **_CV,
    "summary": "One sentence. Two sentences. Three sentences.",
    "skills": [{"category": "A", "items": ["a", "b", "c", "d", "e"]}, {"category": "B", "items": ["x", "y"]}],
    "experience": [
        {"company": "Acme", "title": "SWE", "bullets": ["b1", "b2", "b3"]},
        {"company": "Beta", "title": "SWE", "bullets": ["c1", "c2"]},
    ],
}


def test_trim_content_shortens_the_summary_first():
    out = pdf_generator.trim_content(_TRIM_CV, 30)
    assert out["summary"] == "One sentence. Two sentences."
    assert out["skills"] == _TRIM_CV["skills"]
    assert out["experience"] == _TRIM_CV["experience"]


def test_trim_content_then_drops_the_last_item_of_the_longest_skill_row():
    data = {**_TRIM_CV, "summary": "One sentence. Two sentences."}
    out = pdf_generator.trim_content(data, 30)
    assert out["skills"] == [{"category": "A", "items": ["a", "b", "c", "d"]}, {"category": "B", "items": ["x", "y"]}]
    assert out["experience"] == data["experience"]


def test_trim_content_last_resort_drops_the_last_bullet_of_the_longest_role_and_says_so():
    data = {**_TRIM_CV, "summary": "One sentence.", "skills": [{"category": "A", "items": ["a", "b", "c"]}]}
    out = pdf_generator.trim_content(data, 30)
    assert out["experience"][0]["bullets"] == ["b1", "b2"]
    assert out["experience"][1]["bullets"] == ["c1", "c2"]
    assert out["fitNotes"] == ["Dropped to fit one page: Acme bullet 3 ('b3')"]


def test_trim_content_never_rewrites_wording_and_keeps_two_bullets_per_role():
    data = {**_TRIM_CV, "summary": "One sentence.", "skills": [{"category": "A", "items": ["a"]}],
            "experience": [{"company": "Acme", "title": "SWE", "bullets": ["a long bullet", "another long bullet"]}]}
    out = pdf_generator.trim_content(data, 60)
    assert out["experience"] == data["experience"]
    assert out["summary"] == "One sentence."


def test_fit_and_render_converges_with_the_deterministic_trimmer():
    # Every CSS step overflows until the trimmer has dropped a bullet (3 trims:
    # summary sentence, skill item, bullet), then the first step fits.
    fake = FakeRenderer([2] * 8 * 3 + [1])
    pdf_generator.use_renderer(fake)
    pdf, final = pdf_generator.fit_and_render(_TRIM_CV, trim_callback=pdf_generator.trim_content)
    assert pdf == b"%PDF-FAKE"
    assert final["summary"] == "One sentence. Two sentences."
    assert final["skills"][0]["items"] == ["a", "b", "c", "d"]
    assert final["experience"][0]["bullets"] == ["b1", "b2"]
    assert final["fitNotes"] == ["Dropped to fit one page: Acme bullet 3 ('b3')"]


def test_trim_content_first_takes_back_bullets_a_role_holds_beyond_its_base_count():
    note = "Scaled Kafka consumers from 3 to 12."
    data = {
        **_TRIM_CV,
        "experience": [
            {"company": "Acme", "title": "SWE", "bullets": ["b1", "n1", "b2", note], "baseBulletCount": 2},
            {"company": "Beta", "title": "SWE", "bullets": ["c1", "c2"]},
        ],
    }
    out = pdf_generator.trim_content(data, 30)
    # Summary and skills are untouched while a role holds more than its base size.
    assert out["summary"] == _TRIM_CV["summary"]
    assert out["skills"] == _TRIM_CV["skills"]
    assert out["experience"][0]["bullets"] == ["b1", "n1", "b2"]
    assert out["fitNotes"] == [f"Dropped to fit one page: Acme bullet 4 ({note!r})"]
