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


def test_merge_identity_ignores_generated_facts():
    """Education, certifications and each role's dates are copied from the base
    CV, so a model that abbreviates or invents them can't reach the document."""
    generated = {
        "education": [{"degree": "BSc Computer Engineering", "year": "2023"}],
        "certifications": [{"title": "Invented Cert", "org": "Nowhere"}],
        "experience": [
            {"company": "Renamed", "location": "Mars", "period": "2020",
             "bullets": ["Designed and shipped Python FastAPI services handling 12k req/s"]}
        ],
    }
    base = {
        "education": [
            {"degree": "Bachelor of Science in Computer Engineering", "year": "Sep 2019 - Jun 2023"}
        ],
        "certifications": [],
        "experience": [
            {"company": "Odoo", "location": "Dubai, UAE", "period": "Mar 2024 - Present",
             "bullets": ["Built Python FastAPI services handling 12k req/s"]}
        ],
    }
    merged = resume.merge_identity(generated, base)

    assert merged["education"] == base["education"]  # full degree + range survive
    assert merged["certifications"] == []  # invented cert dropped
    role = merged["experience"][0]
    assert (role["company"], role["location"], role["period"]) == (
        "Odoo",
        "Dubai, UAE",
        "Mar 2024 - Present",
    )
    # Only the prose comes from generation — and it kept the bullet's facts.
    assert role["bullets"] == ["Designed and shipped Python FastAPI services handling 12k req/s"]


def test_merge_identity_keeps_the_base_job_list():
    """Job count and order come from the base CV — generation can't drop a role."""
    generated = {"experience": [{"company": "Odoo", "title": "Consultant", "bullets": ["a"]}]}
    base = {
        "experience": [
            {"company": "Odoo", "title": "Software Engineer",
             "alternateTitles": ["Consultant"], "bullets": ["x"]},
            {"company": "Edenred", "title": "Intern", "bullets": ["y"]},
        ]
    }
    merged = resume.merge_identity(generated, base)

    assert [r["company"] for r in merged["experience"]] == ["Odoo", "Edenred"]
    assert merged["experience"][0]["title"] == "Consultant"  # declared alternate honoured
    assert merged["experience"][1]["bullets"] == ["y"]  # unwritten role falls back to base


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


def test_merge_identity_strips_spoken_languages_from_skills():
    """Languages are rendered in their own section from the base CV. A model
    that also lists them under Skills (with whatever level the prompt happened
    to mention) makes the page say 'Native' in one place and 'Fluent' in
    another. Strip them structurally rather than trusting the prompt."""
    generated = {
        "skills": [
            {"category": "Languages", "items": ["Python", "SQL"]},  # programming: keep
            {
                "category": "Client & Communication",
                "items": ["Technical Pre-Sales", "Arabic (Native)", "English (Fluent)"],
            },
            {"category": "Spoken Languages", "items": ["Arabic", "English"]},
        ]
    }
    base = {
        "languages": [{"name": "Arabic", "level": "Fluent"}, {"name": "English", "level": "Fluent"}],
        # The base CV claims the real skills; only the language rows are foreign.
        "skills": [{"category": "Stack", "items": ["Python", "SQL", "Technical Pre-Sales"]}],
    }
    merged = resume.merge_identity(generated, base)

    assert merged["skills"] == [
        {"category": "Languages", "items": ["Python", "SQL"]},
        {"category": "Client & Communication", "items": ["Technical Pre-Sales"]},
    ]
    assert merged["languages"] == base["languages"]


def test_merge_identity_fills_identity_gaps_from_profile():
    """The Profile is the fallback home for links and languages: used only for
    what the base CV header leaves blank, never overriding what it states."""
    generated = {"summary": "x"}
    base = {
        "header": {"name": "Omar", "linkedin": "linkedin.com/in/from-cv"},
        "languages": [],
    }
    merged = resume.merge_identity(
        generated,
        base,
        links={"linkedin": "linkedin.com/in/from-profile", "github": "github.com/omar"},
        languages=[{"name": "Arabic", "level": "Native"}],
    )
    assert merged["header"]["linkedin"] == "linkedin.com/in/from-cv"  # CV wins
    assert merged["header"]["github"] == "github.com/omar"  # gap filled
    assert merged["languages"] == [{"name": "Arabic", "level": "Native"}]  # gap filled

    # When the base CV already has languages, the profile's are ignored.
    base_with = {**base, "languages": [{"name": "Arabic", "level": "Fluent"}]}
    merged = resume.merge_identity(
        generated, base_with, languages=[{"name": "Arabic", "level": "Native"}]
    )
    assert merged["languages"] == [{"name": "Arabic", "level": "Fluent"}]


BASE_FOR_SKILLS = {
    "summary": "Engineer building ERP and fintech systems with Python and React.",
    "experience": [
        {"company": "Acme", "title": "Software Engineer",
         "bullets": ["Architected a dashboard using React and Flask on Google Cloud Platform (GCP)",
                     {"text": "Ran technical pre-sales scoping for enterprise accounts", "condition": None}]},
    ],
    "skills": [{"category": "Backend", "items": ["Python", "SQL (PostgreSQL)", "REST APIs", "Docker"]}],
    "certifications": [{"title": "LangChain for Python", "org": "LangChain"}],
    "languages": [{"name": "English", "level": "Fluent"}],
}


def test_merge_identity_drops_skills_the_base_cv_never_claims():
    """The August CVs listed MySQL, disaster recovery and MLOps that appear
    nowhere in the base CV. The prompt forbade it; this makes it impossible."""
    generated = {
        "skills": [
            {"category": "Backend", "items": ["Python", "PostgreSQL", "RESTful APIs", "MySQL", "Flask"]},
            {"category": "Cloud", "items": ["GCP", "Disaster Recovery", "Zero-Trust Security"]},
            {"category": "AI", "items": ["LangChain", "MLOps", "Vector Search"]},
            {"category": "Delivery", "items": ["Technical Pre-Sales", "Stakeholder Communication"]},
        ]
    }
    merged = resume.merge_identity(generated, BASE_FOR_SKILLS)
    assert merged["skills"] == [
        {"category": "Backend", "items": ["Python", "PostgreSQL", "RESTful APIs", "Flask"]},
        {"category": "Cloud", "items": ["GCP"]},
        {"category": "AI", "items": ["LangChain"]},
        {"category": "Delivery", "items": ["Technical Pre-Sales"]},
    ]


def test_merge_identity_keeps_a_skill_row_only_while_it_has_items():
    generated = {"skills": [{"category": "Invented", "items": ["Terraform", "Ansible"]}]}
    assert resume.merge_identity(generated, BASE_FOR_SKILLS)["skills"] == []


def test_merge_identity_allows_only_declared_alternate_titles():
    """A role's title may be its own or one the candidate declared as an
    equally true alternative. Anything else falls back to the real title, so
    the hardcoded employer-specific rule can leave the prompt."""
    base = {
        "experience": [
            {"company": "Odoo", "title": "Software Engineer",
             "alternateTitles": ["Technical Solutions Consultant"], "bullets": ["x"]},
            {"company": "Edenred", "title": "Software Engineer Intern", "bullets": ["y"]},
        ]
    }
    generated = {
        "experience": [
            {"company": "Odoo", "title": "Technical Solutions Consultant", "bullets": ["a"]},
            {"company": "Edenred", "title": "Solutions Consultant", "bullets": ["b"]},
        ]
    }
    merged = resume.merge_identity(generated, base)
    assert merged["experience"][0]["title"] == "Technical Solutions Consultant"
    assert merged["experience"][1]["title"] == "Software Engineer Intern"


def test_experience_years_is_computed_from_date_ranges():
    cv = {
        "experience": [
            {"period": "Mar 2024 - Present"},
            {"period": "Nov 2022 – Mar 2024"},
            {"period": "Aug 2022 - Nov 2022"},
        ]
    }
    years = resume.experience_years(cv, today=(2026, 9))
    assert years == 4.1  # Aug 2022 -> Sep 2026, contiguous


def test_experience_years_merges_overlaps_and_handles_year_only_ranges():
    cv = {"experience": [{"period": "2020-2024"}, {"period": "Jan 2023 - Dec 2023"}]}
    assert resume.experience_years(cv, today=(2026, 9)) == 4.0
    assert resume.experience_years({"experience": [{"period": "n/a"}]}) is None


# --- detail floor: a tailored bullet is the base bullet re-angled ----------

_MEIKO = {
    "company": "Meikosoft",
    "title": "Software Engineer",
    "bullets": [
        "Architected a Merchant Hub dashboard using React and Flask processing $2M+ in monthly transactions, with load-balanced error handling that maintained consistent uptime across peak payment cycles",
        "Implemented WebSocket-based updates for payment POS systems and engineered a maintainable UI component library by extending Material UI (MUI) for complex data visualization.",
        "Built an Energy IoT platform using MQTT and TimescaleDB, featuring RFID management, EV charging point assignment, and tariff lifecycle management.",
    ],
}
_FAITHFUL_IOT = "Delivered an Energy IoT platform on MQTT and TimescaleDB covering RFID management, EV charging point assignment, and tariff lifecycle management for utility clients."
_FAITHFUL_WS = "Shipped WebSocket-based real-time updates for payment POS systems and a maintainable UI component library extending Material UI (MUI) for complex data visualization."
_FAITHFUL_HUB = "Owned architecture of a Merchant Hub dashboard in React and Flask processing $2M+ in monthly transactions, with load-balanced error handling that held consistent uptime across peak payment cycles."


def _merge_bullets(generated_bullets):
    generated = {"experience": [{"company": "Meikosoft", "bullets": generated_bullets}]}
    return resume.merge_identity(generated, {"experience": [_MEIKO]})["experience"][0]["bullets"]


def test_merge_identity_keeps_faithful_rewrites_in_their_new_order():
    out = _merge_bullets([_FAITHFUL_IOT, _FAITHFUL_WS, _FAITHFUL_HUB])
    assert out == [_FAITHFUL_IOT, _FAITHFUL_WS, _FAITHFUL_HUB]


def test_merge_identity_restores_a_bullet_that_lost_a_number():
    cut = "Architected a Merchant Hub dashboard using React and Flask with load-balanced error handling that maintained consistent uptime across peak payment cycles."
    out = _merge_bullets([cut, _FAITHFUL_WS, _FAITHFUL_IOT])
    assert out[0] == _MEIKO["bullets"][0]  # the $2M+ came back with the original text
    assert out[1:] == [_FAITHFUL_WS, _FAITHFUL_IOT]


def test_merge_identity_restores_a_bullet_that_dropped_its_named_tools():
    vague = "Built an Energy IoT platform with device management, charging assignment, and tariff lifecycle management for utilities."
    out = _merge_bullets([_FAITHFUL_HUB, _FAITHFUL_WS, vague])
    assert out[2] == _MEIKO["bullets"][2]  # MQTT, TimescaleDB, RFID, EV are facts, not filler


def test_merge_identity_restores_a_bullet_cut_short():
    short = "Built an Energy IoT platform using MQTT and TimescaleDB with RFID and EV charging."
    out = _merge_bullets([_FAITHFUL_HUB, _FAITHFUL_WS, short])
    assert out[2] == _MEIKO["bullets"][2]


def test_merge_identity_replaces_a_bullet_with_no_source_in_the_base_cv():
    invented = "Managed cloud platform operations for enterprise clients, running maturity assessments and cost optimisation reviews."
    out = _merge_bullets([invented, _FAITHFUL_WS, _FAITHFUL_IOT])
    # The orphan took the slot; the one base bullet nothing else matched fills it.
    assert out == [_MEIKO["bullets"][0], _FAITHFUL_WS, _FAITHFUL_IOT]


# --- bullets from notes: a role's private record of the work ---------------

_MEIKO_NOTES = (
    "On the Energy IoT platform I ran Kafka between the MQTT bridge and TimescaleDB, "
    "and set up Prometheus and Grafana alerts on consumer lag. When tariff recalculation "
    "spiked we added partitions to go from 3 to 12 consumers. Wrote the OpenAPI spec for "
    "the Merchant Hub public API with idempotency keys and per-merchant rate limits. "
    "Moved the Flask services onto Kubernetes with Helm charts and sealed secrets. "
    "Ran the on-call rotation for the payments gateway and wrote its runbook."
)
_NOTE_KAFKA = "Scaled Kafka consumers from 3 to 12 by adding partitions when tariff recalculation spiked, with Prometheus and Grafana alerts on consumer lag."
_NOTE_API = "Wrote the OpenAPI spec for the Merchant Hub public API, with idempotency keys and per-merchant rate limits."
_NOTE_K8S = "Moved the Flask services onto Kubernetes with Helm charts and sealed secrets."
_NOTE_ONCALL = "Ran the on-call rotation for the payments gateway and wrote its runbook."
_REWRITES = [_FAITHFUL_HUB, _FAITHFUL_WS, _FAITHFUL_IOT]


def _merge_role(generated_bullets, notes=_MEIKO_NOTES):
    base_role = {**_MEIKO, "notes": notes} if notes is not None else _MEIKO
    generated = {"experience": [{"company": "Meikosoft", "bullets": generated_bullets}]}
    return resume.merge_identity(generated, {"experience": [base_role]})["experience"][0]


def test_merge_identity_lets_a_proven_note_replace_a_base_bullet():
    # The generator ranked a note above the IoT bullet and left that bullet out.
    role = _merge_role([_FAITHFUL_HUB, _NOTE_KAFKA, _FAITHFUL_WS])
    assert role["bullets"] == [_FAITHFUL_HUB, _NOTE_KAFKA, _FAITHFUL_WS]
    assert "baseBulletCount" not in role  # the base size: nothing extra to give back


def test_merge_identity_lets_a_note_replace_the_base_bullet_it_overlaps():
    # Shares MQTT, TimescaleDB and the platform with the IoT bullet but not its
    # RFID or EV work: no rewrite of that bullet, and the notes prove it instead.
    overlap = "Ran Kafka between the MQTT bridge and TimescaleDB on the Energy IoT platform, scaling consumers from 3 to 12 when tariff recalculation spiked."
    role = _merge_role([_FAITHFUL_HUB, _FAITHFUL_WS, overlap])
    assert role["bullets"] == [_FAITHFUL_HUB, _FAITHFUL_WS, overlap]


def test_merge_identity_restores_the_bullet_an_unproven_note_would_have_replaced():
    inflated = _NOTE_KAFKA.replace("to 12", "to 24")  # the notes say 12
    role = _merge_role([_FAITHFUL_HUB, inflated, _FAITHFUL_WS])
    assert role["bullets"] == [_FAITHFUL_HUB, _MEIKO["bullets"][2], _FAITHFUL_WS]


def test_merge_identity_lets_proven_notes_add_to_a_role_and_marks_its_base_size():
    role = _merge_role([*_REWRITES, _NOTE_KAFKA, _NOTE_API])
    assert role["bullets"] == [*_REWRITES, _NOTE_KAFKA, _NOTE_API]
    # The page-fit step gives back bullets beyond this count first.
    assert role["baseBulletCount"] == 3


def test_merge_identity_never_carries_notes_into_the_tailored_cv():
    assert "notes" not in _merge_role([*_REWRITES, _NOTE_KAFKA])


def test_merge_identity_drops_a_note_naming_a_tool_the_notes_never_mention():
    kong = "Wrote the OpenAPI spec for the Merchant Hub public API behind Kong, with idempotency keys and per-merchant rate limits."
    assert _merge_role([*_REWRITES, kong, _NOTE_KAFKA])["bullets"] == [*_REWRITES, _NOTE_KAFKA]


def test_merge_identity_drops_a_note_the_notes_do_not_support():
    # No number, no named tool: only its words can show it has no source.
    generic = "Led architecture reviews with enterprise executives to steer payment platform decisions."
    role = _merge_role([*_REWRITES, generic])
    assert role["bullets"] == _REWRITES
    assert "baseBulletCount" not in role


def test_merge_identity_drops_a_note_that_restates_a_bullet():
    restated = "Shipped EV charging point assignment, tariff handling and RFID management on the Energy IoT platform for utility clients."
    notes = _MEIKO_NOTES + " " + restated
    role = _merge_role([*_REWRITES, restated, _NOTE_API], notes=notes)
    assert role["bullets"] == [*_REWRITES, _NOTE_API]


def test_merge_identity_keeps_a_role_without_notes_to_its_base_bullets():
    role = _merge_role([_FAITHFUL_HUB, _NOTE_KAFKA, _FAITHFUL_WS], notes=None)
    assert role["bullets"] == [_FAITHFUL_HUB, _MEIKO["bullets"][2], _FAITHFUL_WS]


def test_merge_identity_takes_at_most_three_bullets_per_role_from_notes():
    role = _merge_role([*_REWRITES, _NOTE_KAFKA, _NOTE_API, _NOTE_K8S, _NOTE_ONCALL])
    assert role["bullets"] == [*_REWRITES, _NOTE_KAFKA, _NOTE_API, _NOTE_K8S]
