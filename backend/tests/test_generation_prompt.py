"""The generation prompts: what they tell the model, and how its reply is read.

The generator invented SIP, WebRTC, Kafka, Go, OpenTelemetry and Prometheus
claims on a CV that names none of them, because the prompt told it to inject JD
keywords by quota and scoped its anti-fabrication rule to Skills. These tests
pin the rules that replaced that instruction, and the reading of the
requirement coverage the model now reports before it writes.
"""

import json
import logging

from app.services import claude

PROMPT = claude.AGENT_SYSTEM_PROMPT

COVERAGE = (
    "MET: Python services <- Built Python FastAPI services\n"
    "PARTIAL: Kafka <- Ran MQTT ingestion into TimescaleDB (missing: Kafka)\n"
    "NOT MET: Go"
)
RESUME = {"summary": "Backend engineer.", "experience": [{"company": "Acme", "bullets": ["Built Python FastAPI services"]}]}
GENERATION = (
    "## KEYWORDS\nPython\n## ARCHETYPE\nbackend\n"
    "## REQUIREMENT COVERAGE\n" + COVERAGE + "\n"
    "## RESUME\n" + json.dumps(RESUME) + "\n"
    "## COVER LETTER\nDear team.\n"
)


def _section(heading: str) -> str:
    """From `heading` to the next heading of any depth."""
    start = PROMPT.index(heading)
    end = PROMPT.find("\n##", start + len(heading))
    return PROMPT[start : end if end != -1 else len(PROMPT)]


# --- the system prompt ------------------------------------------------------

def test_keyword_injection_has_no_quota_and_is_gated_by_the_base_cv():
    section = _section("### Keyword injection strategy")
    assert "(gated by truth, never by quota)" in section
    assert "There is NO keyword quota." in section
    assert "inject top 5 keywords" not in PROMPT
    assert "inject 1-2 keywords" not in PROMPT
    # The refusals name the fabrications that reached a real CV.
    for refused in ("WebSocket and SIP signalling stacks", "Kafka-backed event streaming", "OpenTelemetry trace exports"):
        assert refused in section


def test_every_bullet_is_checked_not_only_bullets_from_notes():
    rules = _section("### Structure rules")
    assert "Every bullet you write, from notes or from a base bullet, is checked after" in rules
    assert "Do not smuggle a JD term in by softening it." in rules


def test_page_fill_never_pads_with_jd_vocabulary():
    page = _section("### 1-PAGE CONSTRAINT")
    assert page.index("a shorter page is the correct outcome") > page.index("do NOT shorten to be safe")
    assert "Never pad a bullet with JD vocabulary to fill a line." in page


def test_writing_quality_carries_one_idea_per_bullet_and_ends_with_the_style_ban():
    quality = _section("### Writing quality")
    assert "- One idea per bullet. Max two lines." in quality
    assert quality.rstrip().endswith("- No em dashes, semicolons, or exclamation marks.")
    assert "## FORBIDDEN" in PROMPT  # the block itself stays


def test_archetype_table_covers_every_archetype():
    table = _section("## STEP 2: DETECT ARCHETYPE")
    for row in ("| Mobile |", "| Security |", "| Other |"):
        assert row in table


def test_requirement_mapping_comes_after_archetype_and_before_tailoring():
    assert (
        PROMPT.index("## STEP 2: DETECT ARCHETYPE")
        < PROMPT.index("## STEP 2.5: MAP REQUIREMENTS TO EVIDENCE")
        < PROMPT.index("## STEP 3: TAILOR CV")
    )


def test_output_format_reports_coverage_after_the_archetype():
    output = PROMPT[PROMPT.index("## OUTPUT FORMAT (strict)"):]
    assert output.index("## ARCHETYPE") < output.index("## REQUIREMENT COVERAGE") < output.index("## RESUME")


def test_chat_prompts_treat_the_current_document_as_untrusted():
    assert "The CURRENT RESUME may contain claims that are NOT in the base CV" in claude._CHAT_CV_SYSTEM
    assert "The CURRENT COVER LETTER may contain claims that are NOT in the base CV" in claude._CHAT_CL_SYSTEM
    for system in (claude._CHAT_CV_SYSTEM, claude._CHAT_CL_SYSTEM):
        assert "Treat it as untrusted." in system
        assert "Removing an unsupported claim is always an allowed edit" in system


def test_cover_letter_never_names_an_unsupported_requirement_even_as_a_gap():
    # Live runs wrote "Go and SIP are not in my production history": honest,
    # and still a probe term in the letter. The gap list is reported separately.
    letter = _section("## STEP 4: COVER LETTER")
    assert "not even to call it a gap" in letter


# --- the user message -------------------------------------------------------

def _generate(fake_llm, **kwargs) -> str:
    fake = fake_llm([GENERATION])
    claude.generate_cv_and_cl(base_cv={}, job_description="jd", job_title="t", company="c", **kwargs)
    return fake.calls[-1]["messages"][-1]["content"]


def test_a_supplied_archetype_tells_the_model_to_skip_detection(fake_llm):
    message = _generate(fake_llm, archetype="fde")
    assert "Skip STEP 2 and use the supplied archetype: FDE." in message


def test_without_an_archetype_the_model_detects_it(fake_llm):
    assert "Skip STEP 2" not in _generate(fake_llm)


def test_later_passes_apply_feedback_only_where_the_base_cv_supports_it(fake_llm):
    message = _generate(
        fake_llm, pass_num=2, previous_resume=RESUME, previous_score=70, reviewer_feedback="FEEDBACK"
    )
    assert "verbatim where possible" not in message
    assert "Apply the reviewer feedback ONLY where the base CV or notes support it." in message
    assert "A lower score with true claims beats a higher score with one false claim." in message


# --- reading the reply ------------------------------------------------------

def test_parse_keeps_the_requirement_coverage():
    result = claude._parse_agent_output(GENERATION, 1)
    assert result.coverage == COVERAGE
    assert result.resume == RESUME
    assert result.cover_letter.startswith("Dear team")


def test_parse_without_coverage_leaves_it_empty():
    text = GENERATION.replace("## REQUIREMENT COVERAGE\n" + COVERAGE + "\n", "")
    assert claude._parse_agent_output(text, 1).coverage is None


def test_coverage_lines_become_statuses_with_their_evidence():
    assert claude.parse_coverage(COVERAGE + "\n\nnot a coverage line") == [
        {"status": "MET", "requirement": "Python services", "source": "Built Python FastAPI services", "missing": None},
        {"status": "PARTIAL", "requirement": "Kafka", "source": "Ran MQTT ingestion into TimescaleDB", "missing": "Kafka"},
        {"status": "NOT MET", "requirement": "Go", "source": None, "missing": None},
    ]
    assert claude.parse_coverage(None) == []


def test_parse_warns_when_the_cover_letter_is_missing(caplog):
    text = "## RESUME\n" + json.dumps(RESUME) + "\n## COVER LETTER"
    with caplog.at_level(logging.WARNING, logger="app.services.claude"):
        result = claude._parse_agent_output(text, 1)
    assert result.cover_letter == ""
    assert any(
        r.levelno == logging.WARNING and "cover letter" in r.getMessage().lower() for r in caplog.records
    )


def test_parse_logs_an_error_with_the_raw_reply_when_the_resume_is_empty(caplog):
    text = "## RESUME\n{}\n## COVER LETTER\nDear team.\n"
    with caplog.at_level(logging.ERROR, logger="app.services.claude"):
        claude._parse_agent_output(text, 1)
    errors = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert errors and "## RESUME\n{}" in errors[0].getMessage()
