"""
HTML -> PDF generation via WeasyPrint (lightweight, no browser needed).

Renders structured CV data into the HTML template and produces an ATS-compatible PDF.
WeasyPrint is pure Python — no Chromium, no browser startup, SaaS-friendly.
"""

from __future__ import annotations

import html
import logging
import re
from pathlib import Path

import weasyprint

from . import resume as _resume

logger = logging.getLogger(__name__)

# Paths
_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
_TEMPLATE_PATH = _BACKEND_DIR / "templates" / "cv-template.html"
_FONTS_DIR = _BACKEND_DIR / "static" / "fonts"


# ---------------------------------------------------------------------------
# Rendering seam: the one place WeasyPrint is called. The fit loop counts pages
# by rendering, so swapping this out (`use_renderer(FakeRenderer([...]))`) lets a
# test exercise the whole fit/trim algorithm without WeasyPrint or the
# font/template filesystem. The returned document only needs `.pages` (sized to
# the page count) and `.write_pdf()`.
# ---------------------------------------------------------------------------
class WeasyPrintRenderer:
    def render(self, html_content: str, css_strings: list[str], base_url: str):
        stylesheets = [weasyprint.CSS(string=s) for s in css_strings]
        return weasyprint.HTML(string=html_content, base_url=base_url).render(
            stylesheets=stylesheets
        )


_renderer = WeasyPrintRenderer()


def use_renderer(renderer) -> None:
    """Install a page renderer (tests: `use_renderer(FakeRenderer([...]))`)."""
    global _renderer
    _renderer = renderer


def reset_renderer() -> None:
    """Restore the default WeasyPrint renderer."""
    global _renderer
    _renderer = WeasyPrintRenderer()


def _render_doc(html_content: str, css_strings: list[str]):
    """Render to a document via the active renderer (has .pages, .write_pdf())."""
    return _renderer.render(html_content, css_strings, str(_BACKEND_DIR))


def _esc(text: str) -> str:
    """HTML-escape user content."""
    return html.escape(str(text or ""))


# ---------------------------------------------------------------------------
# ATS text normalization (ported from career-ops generate-pdf.mjs)
# ---------------------------------------------------------------------------
def _normalize_for_ats(text: str) -> str:
    """Replace problematic Unicode with ASCII equivalents for ATS parsers."""
    replacements = {
        "\u2014": "-",   # em-dash
        "\u2013": "-",   # en-dash
        "\u201c": '"', "\u201d": '"', "\u201e": '"', "\u201f": '"',
        "\u2018": "'", "\u2019": "'", "\u201a": "'", "\u201b": "'",
        "\u2026": "...",
        "\u00a0": " ",
    }
    for char, repl in replacements.items():
        text = text.replace(char, repl)
    text = re.sub(r"[\u200b\u200c\u200d\u2060\ufeff]", "", text)
    return text


# ---------------------------------------------------------------------------
# Build HTML from structured CV data
# ---------------------------------------------------------------------------
def _bullet_text(b) -> str:
    """A bullet is either a plain string (legacy/always-on) or {text, condition}."""
    return b.get("text", "") if isinstance(b, dict) else str(b)


def _build_experience_html(experience: list) -> str:
    parts = []
    for job in experience:
        bullets = "".join(f"<li>{_esc(_bullet_text(b))}</li>" for b in job.get("bullets", []))
        location = _esc(job.get("location", ""))
        parts.append(f"""<div class="job avoid-break">
  <div class="job-header">
    <span class="job-company">{_esc(job.get("company", ""))}</span>
    <span class="job-location">{location}</span>
  </div>
  <div class="job-sub">
    <span class="job-role">{_esc(job.get("title", ""))}</span>
    <span class="job-period">{_esc(job.get("period", ""))}</span>
  </div>
  <ul>{bullets}</ul>
</div>""")
    return "\n".join(parts)


def _build_projects_html(projects: list) -> str:
    parts = []
    for p in projects:
        badge = f' <span class="project-badge">({_esc(p.get("badge", ""))})</span>' if p.get("badge") else ""
        tech = f'<div class="project-tech">{_esc(p.get("tech", ""))}</div>' if p.get("tech") else ""
        parts.append(f"""<div class="project avoid-break">
  <div><span class="project-title">{_esc(p.get("name", ""))}</span>{badge}</div>
  <div class="project-desc">{_esc(p.get("description", ""))}</div>
  {tech}
</div>""")
    return "\n".join(parts)


def _build_education_html(education: list) -> str:
    parts = []
    for e in education:
        institution = _esc(e.get("institution", ""))
        location = _esc(e.get("location", ""))
        desc = f'<div class="edu-desc">{_esc(e.get("description", ""))}</div>' if e.get("description") else ""
        parts.append(f"""<div class="edu-item avoid-break">
  <div class="edu-header">
    <span class="edu-school">{institution}</span>
    <span class="edu-location">{location}</span>
  </div>
  <div class="edu-sub">
    <span class="edu-degree">{_esc(e.get("degree", ""))}</span>
    <span class="edu-year">{_esc(e.get("year", ""))}</span>
  </div>
  {desc}
</div>""")
    return "\n".join(parts)


def _build_certifications_html(certifications: list) -> str:
    parts = []
    for c in certifications:
        org = f" ({_esc(c.get('org', ''))})" if c.get("org") else ""
        parts.append(f"""<div class="cert-item">
  <span class="cert-title">{_esc(c.get("title", ""))}{org}</span>
  <span class="cert-year">{_esc(c.get("year", ""))}</span>
</div>""")
    return "\n".join(parts)


def _build_skills_html(skills: list) -> str:
    if not skills:
        return ""
    parts = []
    for s in skills:
        items = ", ".join(_esc(i) for i in s.get("items", []))
        parts.append(f'<li><span class="cat">{_esc(s.get("category", ""))}:</span> {items}</li>')
    return f'<ul class="skills-list">{"".join(parts)}</ul>'


def _build_languages_html(languages: list) -> str:
    if not languages:
        return ""
    parts = []
    for lang_item in languages:
        name = _esc(lang_item.get("name", ""))
        level = lang_item.get("level", "")
        if level:
            parts.append(f'<strong>{name}</strong> ({_esc(level)})')
        else:
            parts.append(f'<strong>{name}</strong>')
    return ", ".join(parts)


def render_html(data: dict, lang: str = "en", page_format: str = "a4") -> str:
    """Render structured CV data into the HTML template (LaTeX-matching style)."""
    # Read through the canonical résumé shape so the renderer and the parser
    # can never disagree about what a CV contains.
    data = _resume.normalize(data)
    template = _TEMPLATE_PATH.read_text(encoding="utf-8")

    header = data.get("header", {})
    page_width = "8.5in" if page_format == "letter" else "210mm"

    # Build header left subtitle (location only, no links)
    subtitle_parts = []
    if header.get("location"):
        subtitle_parts.append(_esc(header["location"]))
    header_subtitle = "<br>".join(subtitle_parts)

    # Build header right (email + phone)
    right_parts = []
    if header.get("email"):
        right_parts.append(f'Email: <a href="mailto:{_esc(header["email"])}">{_esc(header["email"])}</a>')
    if header.get("phone"):
        right_parts.append(f"Mobile: {_esc(header['phone'])}")
    header_right = "<br>".join(right_parts)

    is_en = lang.startswith("en")
    labels = {
        "summary": "Summary" if is_en else "Resumen",
        "experience": "Experience" if is_en else "Experiencia",
        "projects": "Projects" if is_en else "Proyectos",
        "education": "Education" if is_en else "Formacion",
        "certifications": "Certifications" if is_en else "Certificaciones",
        "skills": "Skills" if is_en else "Competencias",
    }

    def _section(title, content, avoid_break=False):
        if not content.strip():
            return ""
        brk = " avoid-break" if avoid_break else ""
        return f'<div class="section{brk}"><div class="section-title">{title}</div>{content}</div>'

    summary_html = _esc(data.get("summary", ""))
    experience_html = _build_experience_html(data.get("experience", []))
    projects_html = _build_projects_html(data.get("projects", []))
    education_html = _build_education_html(data.get("education", []))
    certifications_html = _build_certifications_html(data.get("certifications", []))
    skills_html = _build_skills_html(data.get("skills", []))
    languages_html = _build_languages_html(data.get("languages", []))

    lang_label = "Languages" if is_en else "Idiomas"

    replacements = {
        "{{LANG}}": lang,
        "{{PAGE_WIDTH}}": page_width,
        "{{NAME}}": _esc(header.get("name", "")),
        "{{HEADER_SUBTITLE}}": header_subtitle,
        "{{HEADER_RIGHT}}": header_right,
        "{{BLOCK_SUMMARY}}": _section(labels["summary"], f'<div class="summary-text">{summary_html}</div>') if summary_html else "",
        "{{BLOCK_SKILLS}}": _section(labels["skills"], skills_html, avoid_break=True),
        # Competencies were removed from the résumé shape; clear the placeholder.
        "{{BLOCK_COMPETENCIES}}": "",
        "{{BLOCK_EXPERIENCE}}": _section(labels["experience"], experience_html),
        "{{BLOCK_PROJECTS}}": _section(labels["projects"], projects_html, avoid_break=True),
        "{{BLOCK_EDUCATION}}": _section(labels["education"], education_html, avoid_break=True),
        "{{BLOCK_CERTIFICATIONS}}": _section(labels["certifications"], certifications_html, avoid_break=True),
        "{{BLOCK_LANGUAGES}}": _section(lang_label, f'<div class="languages-line">{languages_html}</div>', avoid_break=True) if languages_html else "",
    }

    html_out = template
    for placeholder, value in replacements.items():
        html_out = html_out.replace(placeholder, value)

    # ATS normalization
    html_out = _normalize_for_ats(html_out)

    return html_out


# ---------------------------------------------------------------------------
# Auto-fit: progressively scale typography + margins until the CV fits on
# exactly one page. WeasyPrint lets us render the document, count pages, then
# re-render with a tighter stylesheet — far more reliable than asking the LLM
# to count lines or trying to estimate ahead of time.
# ---------------------------------------------------------------------------


def _fit_css(content_pt: float, title_pt: float, name_pt: float,
             line_height: float, section_gap: float, job_gap: float,
             bullet_gap: float = 1.0) -> str:
    """CSS overrides for one scale step.

    Externally-applied stylesheets win the cascade over the template's inline
    <style> block at equal specificity (both are author-origin, our overrides
    come later), so these values replace the template defaults wholesale.
    """
    return f"""
body {{ font-size: {content_pt}pt; line-height: {line_height}; }}
.section {{ margin-bottom: {section_gap}pt; }}
.section-title {{ font-size: {title_pt}pt; }}
.header-left h1 {{ font-size: {name_pt}pt; }}
.header-left .subtitle, .header-right {{ font-size: {max(content_pt - 0.5, 7.5)}pt; }}
.job {{ margin-bottom: {job_gap}pt; }}
.job li {{ margin-bottom: {bullet_gap}pt; line-height: {line_height}; }}
.summary-text {{ font-size: {content_pt}pt; line-height: {line_height}; }}
.skill-line, .skills-list li,
.job-company, .job-location, .job-role, .job-period, .job li,
.edu-school, .edu-location, .edu-degree, .edu-year,
.cert-title, .cert-year,
.project-title, .project-desc,
.languages-line, .competencies-list li {{ font-size: {content_pt}pt; }}
.project-badge, .project-tech, .edu-desc {{ font-size: {max(content_pt - 0.5, 7.5)}pt; }}
"""


# Each step: (margin string for @page, override CSS string).
# Step 0 mirrors the template defaults. Each subsequent step shrinks
# proportionally — typography, gaps, and margins move together so the
# document still looks intentional, not crushed.
_FIT_STEPS: list[tuple[str, str]] = [
    ("0.45in 0.5in",  _fit_css(10.00, 10.50, 16.0, 1.35, 6, 6, 1.0)),
    ("0.4in 0.5in",   _fit_css(9.50,  10.25, 15.5, 1.32, 5, 5, 1.0)),
    ("0.4in 0.45in",  _fit_css(9.25,  10.00, 15.0, 1.28, 5, 4, 0.5)),
    ("0.35in 0.45in", _fit_css(9.00,   9.75, 14.5, 1.25, 4, 4, 0.5)),
    ("0.35in 0.4in",  _fit_css(8.75,   9.50, 14.0, 1.22, 4, 3, 0.0)),
    ("0.3in 0.4in",   _fit_css(8.50,   9.25, 13.5, 1.20, 3, 3, 0.0)),
    ("0.3in 0.35in",  _fit_css(8.25,   9.00, 13.0, 1.18, 3, 2, 0.0)),
    ("0.25in 0.35in", _fit_css(8.00,   8.75, 12.5, 1.15, 2, 2, 0.0)),
]


def _run_css_fit(
    data: dict, lang: str, page_format: str, page_size: str
) -> tuple[bytes | None, weasyprint.Document]:
    """Try all CSS tightening steps. Returns (pdf_bytes, last_doc) if a step
    produced a 1-page render; otherwise (None, last_doc) with the tightest doc."""
    html_content = render_html(data, lang, page_format)
    last_doc = None
    for step_idx, (margin, override_css) in enumerate(_FIT_STEPS):
        page_css = f"@page {{ size: {page_size}; margin: {margin}; }}"
        doc = _render_doc(html_content, [page_css, override_css])
        last_doc = doc

        if len(doc.pages) == 1:
            if step_idx > 0:
                logger.info("CV auto-fit converged at step %d (%s)", step_idx, margin)
            return doc.write_pdf(), doc

    return None, last_doc


def fit_and_render(
    data: dict,
    lang: str = "en",
    page_format: str = "a4",
    trim_callback: callable | None = None,
    max_trims: int = 2,
) -> tuple[bytes, dict]:
    """Generate a one-page PDF from structured CV data.

    Returns (pdf_bytes, final_data) where final_data reflects any content
    trims — callers that store the CV must persist final_data so what the
    user sees in the editor matches every future render.

    Strategy:
      1. CSS auto-fit (8 tightening steps). Free, no model calls.
      2. If CSS exhausts itself and `trim_callback(data, overflow_words) -> data`
         is provided, ask it to shorten bullet wording, then re-run CSS auto-fit.
         Repeats up to `max_trims` times.
      3. If still multi-page, returns best-effort PDF.
    """
    page_size = "letter" if page_format == "letter" else "A4"

    pdf_bytes, last_doc = _run_css_fit(data, lang, page_format, page_size)
    if pdf_bytes is not None:
        return pdf_bytes, data

    if trim_callback is None:
        logger.warning(
            "CV overflows at tightest CSS step (%d pages); no trim_callback provided.",
            len(last_doc.pages) if last_doc else 0,
        )
        return last_doc.write_pdf(), data

    current_data = data
    for attempt in range(max_trims):
        page_count = len(last_doc.pages) if last_doc else 2
        # Escalate cut size: 30 words first attempt, 60 second. Multiply by 2 if 3+ pages.
        overflow_words = 30 * (attempt + 1) * (2 if page_count >= 3 else 1)
        logger.info(
            "CV trim attempt %d/%d (pages=%d, target_cut~%d words)",
            attempt + 1, max_trims, page_count, overflow_words,
        )

        try:
            trimmed = trim_callback(current_data, overflow_words)
        except Exception as e:
            logger.warning("trim_callback failed: %s; aborting trim loop.", e)
            break

        if not isinstance(trimmed, dict):
            logger.warning("trim_callback returned non-dict; aborting trim loop.")
            break

        current_data = trimmed
        pdf_bytes, last_doc = _run_css_fit(current_data, lang, page_format, page_size)
        if pdf_bytes is not None:
            logger.info("CV fit via content trim (attempt %d)", attempt + 1)
            return pdf_bytes, current_data

    logger.warning(
        "CV still overflows after %d trim attempts; returning best-effort %d-page PDF.",
        max_trims, len(last_doc.pages) if last_doc else 0,
    )
    return last_doc.write_pdf(), current_data


def generate_cover_letter_pdf(
    text: str,
    contact: dict | None = None,
    page_format: str = "a4",
) -> bytes:
    """Generate a PDF from cover letter text. Returns raw PDF bytes."""
    contact = contact or {}
    page_width = "8.5in" if page_format == "letter" else "210mm"

    # Build header
    header_parts = []
    if contact.get("name"):
        header_parts.append(f'<h1 style="font-size:16pt;font-weight:700;margin-bottom:2pt">{_esc(contact["name"])}</h1>')
    subtitle_bits = []
    if contact.get("location"):
        subtitle_bits.append(_esc(contact["location"]))
    link_bits = []
    if contact.get("linkedinUrl"):
        link_bits.append(f'<a href="{_esc(contact["linkedinUrl"])}">{_esc(contact["linkedinUrl"].replace("https://","").rstrip("/"))}</a>')
    if contact.get("githubUrl"):
        link_bits.append(f'<a href="{_esc(contact["githubUrl"])}">{_esc(contact["githubUrl"].replace("https://","").rstrip("/"))}</a>')
    if link_bits:
        subtitle_bits.append(" | ".join(link_bits))
    if subtitle_bits:
        header_parts.append(f'<div style="font-size:9pt">{"<br>".join(subtitle_bits)}</div>')

    header_html = "\n".join(header_parts)

    # Convert markdown bold and paragraphs
    body = _esc(text)
    body = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', body)
    paragraphs = "\n".join(f"<p>{p.strip()}</p>" for p in body.split("\n\n") if p.strip())
    if not paragraphs:
        paragraphs = f"<p>{body}</p>"

    html_content = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ font-family:'Times New Roman','DejaVu Serif',Georgia,serif; font-size:11pt; line-height:1.5; color:#000; background:#fff; }}
.page {{ width:100%; max-width:{page_width}; margin:0 auto; }}
a {{ color:#000; text-decoration:none; }}
.header {{ text-align:center; margin-bottom:8pt; }}
hr {{ border:none; border-top:1px solid #000; margin:8pt 0 16pt 0; }}
p {{ margin-bottom:11pt; }}
</style></head><body>
<div class="page">
<div class="header">{header_html}</div>
<hr>
{paragraphs}
</div></body></html>"""

    html_content = _normalize_for_ats(html_content)

    if page_format == "letter":
        page_css = "@page { size: letter; margin: 0.9in 1.1in; }"
    else:
        page_css = "@page { size: A4; margin: 0.9in 1.1in; }"

    return _render_doc(html_content, [page_css]).write_pdf()


