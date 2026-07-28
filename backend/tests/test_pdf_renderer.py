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
