"""
HTML -> PDF generation via WeasyPrint (lightweight, no browser needed).

Renders structured CV data into the HTML template and produces an ATS-compatible PDF.
WeasyPrint is pure Python — no Chromium, no browser startup, SaaS-friendly.
"""

from __future__ import annotations

import html
import re
from pathlib import Path

import weasyprint

# Paths
_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
_TEMPLATE_PATH = _BACKEND_DIR / "templates" / "cv-template.html"
_FONTS_DIR = _BACKEND_DIR / "static" / "fonts"


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
def _build_experience_html(experience: list) -> str:
    parts = []
    for job in experience:
        bullets = "".join(f"<li>{_esc(b)}</li>" for b in job.get("bullets", []))
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


def _build_competencies_html(competencies: list) -> str:
    if not competencies:
        return ""
    items = "".join(f"<li>{_esc(c)}</li>" for c in competencies)
    return f'<ul class="competencies-list">{items}</ul>'


def render_html(data: dict, lang: str = "en", page_format: str = "a4") -> str:
    """Render structured CV data into the HTML template (LaTeX-matching style)."""
    template = _TEMPLATE_PATH.read_text(encoding="utf-8")

    header = data.get("header", {})
    page_width = "8.5in" if page_format == "letter" else "210mm"

    # Build header left subtitle (location + links on separate lines, like LaTeX)
    subtitle_parts = []
    if header.get("location"):
        subtitle_parts.append(_esc(header["location"]))
    link_parts = []
    if header.get("linkedin"):
        display = header["linkedin"].replace("https://", "").replace("http://", "").rstrip("/")
        link_parts.append(f'<a href="{_esc(header["linkedin"])}">{_esc(display)}</a>')
    if header.get("github"):
        display = header["github"].replace("https://", "").replace("http://", "").rstrip("/")
        link_parts.append(f'<a href="{_esc(header["github"])}">{_esc(display)}</a>')
    if header.get("portfolio"):
        display = header["portfolio"].replace("https://", "").replace("http://", "").rstrip("/")
        link_parts.append(f'<a href="{_esc(header["portfolio"])}">{_esc(display)}</a>')
    if link_parts:
        subtitle_parts.append(" | ".join(link_parts))
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
        "competencies": "Core Competencies" if is_en else "Competencias",
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
    competencies_html = _build_competencies_html(data.get("competencies", []))
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
        "{{BLOCK_COMPETENCIES}}": _section(labels["competencies"], competencies_html) if competencies_html else "",
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


def generate_pdf(
    data: dict,
    lang: str = "en",
    page_format: str = "a4",
) -> bytes:
    """Generate a PDF from structured CV data. Returns raw PDF bytes.

    Uses WeasyPrint — pure Python, no browser, SaaS-friendly.
    """
    html_content = render_html(data, lang, page_format)

    # WeasyPrint handles page size via CSS @page rule
    # We inject a @page rule based on the requested format
    if page_format == "letter":
        page_css = "@page { size: letter; margin: 0.45in 0.5in; }"
    else:
        page_css = "@page { size: A4; margin: 0.45in 0.5in; }"

    css = weasyprint.CSS(string=page_css)
    html_doc = weasyprint.HTML(
        string=html_content,
        base_url=str(_BACKEND_DIR),
    )

    return html_doc.write_pdf(stylesheets=[css])
