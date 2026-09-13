"""The generate pipeline end to end, offline.

`intake.generate_for_jobs` is where the well-tested pure parts get *assembled*:
conditional bullets resolved, the tailor loop run, factual identity grafted back
on, the result fitted to a page, the score's own decision read, everything
persisted. Each of those pieces has its own test; this covers the assembly —
that they run in the right order, and that what lands in the DB is what the
last step produced.

It routes FakeLLM by question rather than by position, because the call order
here depends on the data: a base CV with no conditional bullets skips a call
entirely, and an approved score skips the critique pass.
"""

import json

from app.models import CV, Job, Profile, User
from app.services import intake, llm, pdf_generator
from tests.test_pdf_renderer import FakeRenderer

BASE_CV = {
    "header": {"name": "Omar Assouma", "email": "o@x.com", "location": "Berlin"},
    "summary": "Backend engineer.",
    "experience": [
        {
            "company": "Acme",
            "title": "Software Engineer",
            "location": "Berlin",
            "period": "2020-2024",
            "bullets": [
                "Built Python FastAPI services handling 12k req/s",
                {
                    "text": "Ran Kubernetes clusters across three regions",
                    "condition": "the job mentions Kubernetes or infrastructure",
                },
            ],
        }
    ],
    "skills": [{"category": "Languages", "items": ["Python"]}],
    "languages": [{"name": "English", "level": "Native"}],
}

TAILORED = {
    "summary": "Backend engineer.",
    "experience": [
        {
            "company": "Acme",
            "title": "Software Engineer",
            "location": "Berlin",
            "period": "2020-2024",
            "bullets": ["Built Python FastAPI services handling 12k req/s"],
        }
    ],
    "skills": [{"category": "Languages", "items": ["Python"]}],
}

GENERATION_TEXT = (
    "## KEYWORDS\nPython, FastAPI\n"
    "## ARCHETYPE\nbackend\n"
    "## RESUME\n" + json.dumps(TAILORED) + "\n"
    "## COVER LETTER\nDear team, I built Python systems.\n"
)


def _seed(db):
    user = User(id="u1", email="o@x.com", name="Omar")
    db.add(user)
    db.add(CV(userId="u1", structuredData=json.dumps(BASE_CV)))
    db.add(Profile(userId="u1", fullName="Omar Assouma", totalYearsExperience=4))
    db.add(
        Job(
            id="j1",
            userId="u1",
            title="Backend Engineer",
            company="Acme",
            description="We need Python and FastAPI.",
            relevanceStatus="good_fit",
            agentStatus="pending",
            applicationStatus="new",
        )
    )
    db.commit()
    return user


def _staged_llm(generation_text: str = GENERATION_TEXT) -> llm.FakeLLM:
    """One adapter that answers each step of the pipeline by what it was asked."""
    fake = llm.FakeLLM(default="{}")
    # The job has no Kubernetes in it, so this bullet is dropped.
    fake.when("[false]", prompt="CONDITIONS:")
    fake.when(
        {
            "must_have_keywords": ["Python", "FastAPI"],
            "nice_to_have_keywords": [],
            "required_years": None,
            "seniority": "mid",
            "hard_requirements": [],
            "role_summary": "Builds services.",
        },
        prompt="must_have_keywords",
    )
    fake.when(generation_text, prompt="professional CV writer")
    fake.when(
        {"semantic": 15, "impact": 15, "recruiter": 10, "notes": "strong"},
        prompt="skeptical, time-pressed technical recruiter",
    )
    return fake


def test_generate_for_jobs_assembles_and_persists(db):
    user = _seed(db)
    fake = _staged_llm()
    llm.use(fake)
    pdf_generator.use_renderer(FakeRenderer([1]))

    jobs = intake.generate_for_jobs(db, user, ["j1"])

    assert len(jobs) == 1
    job = jobs[0]

    # The scorer's own decision drives the status — no threshold of intake's own.
    assert job.agentStatus == "done"
    assert job.atsScore > 0
    assert job.generatedCl.startswith("Dear team")

    stored = json.loads(job.generatedCv)

    # merge_identity grafted the factual header + languages back on. The model
    # never produced these; they were copied from the base CV.
    assert stored["header"]["name"] == "Omar Assouma"
    assert stored["languages"] == [{"name": "English", "level": "Native"}]

    # The conditional bullet the LLM voted down is gone, and the plain one stayed.
    bullets = stored["experience"][0]["bullets"]
    assert any("FastAPI" in str(b) for b in bullets)
    assert not any("Kubernetes" in str(b) for b in bullets)

    # The whole score survived to the transport edge, under its own field names.
    breakdown = json.loads(job.atsBreakdown)
    assert breakdown["decision"] == "APPROVED"
    assert breakdown["semantic"] == 15


def test_generate_for_jobs_skips_the_bullet_call_when_there_are_no_conditions(db):
    """The branch that shifts a positional queue: no conditions, no LLM call."""
    plain = {**BASE_CV, "experience": [
        {**BASE_CV["experience"][0], "bullets": ["Built Python FastAPI services"]}
    ]}
    user = User(id="u1", email="o@x.com", name="Omar")
    db.add(user)
    db.add(CV(userId="u1", structuredData=json.dumps(plain)))
    db.add(
        Job(
            id="j1", userId="u1", title="Backend Engineer", company="Acme",
            description="We need Python and FastAPI.", relevanceStatus="good_fit",
            agentStatus="pending", applicationStatus="new",
        )
    )
    db.commit()

    fake = _staged_llm()
    llm.use(fake)
    pdf_generator.use_renderer(FakeRenderer([1]))

    intake.generate_for_jobs(db, user, ["j1"])

    # Same staged adapter, one fewer call — and every other step still matched.
    assert not any("CONDITIONS:" in llm._call_text(c) for c in fake.calls)
    assert any("professional CV writer" in llm._call_text(c) for c in fake.calls)


def test_generate_for_jobs_without_a_cv_is_a_domain_error(db):
    import pytest

    user = User(id="u1", email="o@x.com", name="Omar")
    db.add(user)
    db.commit()

    with pytest.raises(intake.IntakeError) as excinfo:
        intake.generate_for_jobs(db, user, ["j1"])
    assert excinfo.value.status_code == 400


def test_generate_reads_languages_from_the_cv_it_renders(db):
    """The prompt and the rendered Languages section must agree. The profile
    said 'Native', the base CV said 'Fluent', and the model wrote the profile's
    word into the summary while the page printed the CV's."""
    user = _seed(db)
    profile = db.query(Profile).filter(Profile.userId == "u1").first()
    profile.languages = json.dumps([{"name": "English", "level": "Native"}])
    profile.linkedinUrl = "https://linkedin.com/in/omar"
    db.commit()

    fake = _staged_llm()
    llm.use(fake)
    pdf_generator.use_renderer(FakeRenderer([1]))

    jobs = intake.generate_for_jobs(db, user, ["j1"])

    generation_calls = [
        llm._call_text(c) for c in fake.calls if "professional CV writer" in llm._call_text(c)
    ]
    assert generation_calls
    assert "English (Native)" in generation_calls[0]  # base CV's level wins
    assert "English (Fluent)" not in generation_calls[0]

    stored = json.loads(jobs[0].generatedCv)
    # The base header had no LinkedIn; the profile's fills the gap.
    assert stored["header"]["linkedin"] == "https://linkedin.com/in/omar"


def test_generate_computes_years_from_the_cv_dates_not_the_profile(db):
    """A parser derives tenure from the date ranges; so do we. The profile's
    self-reported number is only the fallback when no range can be read."""
    user = _seed(db)
    profile = db.query(Profile).filter(Profile.userId == "u1").first()
    profile.totalYearsExperience = 1  # stale; BASE_CV says 2020-2024
    db.commit()

    fake = _staged_llm()
    llm.use(fake)
    pdf_generator.use_renderer(FakeRenderer([1]))

    intake.generate_for_jobs(db, user, ["j1"])

    prompt = next(
        llm._call_text(c) for c in fake.calls if "professional CV writer" in llm._call_text(c)
    )
    assert "Years of experience: 4" in prompt
    assert "Years of experience: 1" not in prompt


def test_generate_fits_the_page_by_dropping_items_never_by_rewriting_bullets(db):
    """A CV that overflows past the tightest CSS step loses whole items
    (recorded in fitNotes), not words. The Haiku trimmer, asked for ~30 words,
    cut 88 across every bullet and its output skipped the detail floor — a
    tailored CV read as a summary of the base one."""
    three_bullets = [
        "Built Python FastAPI services handling 12k req/s",
        "Ran Kubernetes clusters across three regions",
        "Interviewed engineering candidates",
    ]
    base = {**BASE_CV, "experience": [{**BASE_CV["experience"][0], "bullets": three_bullets}]}
    user = User(id="u1", email="o@x.com", name="Omar")
    db.add(user)
    db.add(CV(userId="u1", structuredData=json.dumps(base)))
    db.add(
        Job(
            id="j1", userId="u1", title="Backend Engineer", company="Acme",
            description="We need Python and FastAPI.", relevanceStatus="good_fit",
            agentStatus="pending", applicationStatus="new",
        )
    )
    db.commit()

    fake = _staged_llm()
    llm.use(fake)
    # Every CSS step overflows; the first render after one trim fits.
    pdf_generator.use_renderer(FakeRenderer([2] * 8 + [1]))

    jobs = intake.generate_for_jobs(db, user, ["j1"])

    assert not any("overflows page 1" in llm._call_text(c) for c in fake.calls)
    stored = json.loads(jobs[0].generatedCv)
    bullets = stored["experience"][0]["bullets"]
    assert bullets == three_bullets[:2]  # the last bullet went, whole
    assert any("Interviewed engineering candidates" in n for n in stored["fitNotes"])


def test_generate_surfaces_parse_back_problems_as_gaps(db, monkeypatch):
    """What the rendered PDF loses is reported on the job, next to the score."""
    user = _seed(db)
    llm.use(_staged_llm())
    pdf_generator.use_renderer(FakeRenderer([1]))
    monkeypatch.setattr(
        pdf_generator, "parse_back_issues", lambda pdf, data: ["header.phone not found in PDF text: '+1'"]
    )

    jobs = intake.generate_for_jobs(db, user, ["j1"])

    gaps = json.loads(jobs[0].atsBreakdown)["gaps"]
    assert "header.phone not found in PDF text: '+1'" in gaps


def test_generate_stores_the_requirements_the_cv_does_not_meet(db):
    """The honest gap list for this application: reported to the candidate,
    never written into the CV."""
    user = _seed(db)
    coverage = (
        "## REQUIREMENT COVERAGE\n"
        "MET: Python services <- Built Python FastAPI services handling 12k req/s\n"
        "NOT MET: Go\n"
        "NOT MET: SIP\n"
    )
    llm.use(_staged_llm(GENERATION_TEXT.replace("## RESUME\n", coverage + "## RESUME\n")))
    pdf_generator.use_renderer(FakeRenderer([1]))

    jobs = intake.generate_for_jobs(db, user, ["j1"])

    breakdown = json.loads(jobs[0].atsBreakdown)
    assert breakdown["not_met"] == ["Go", "SIP"]
    assert breakdown["coverage"][0] == {
        "status": "MET", "requirement": "Python services",
        "source": "Built Python FastAPI services handling 12k req/s", "missing": None,
    }


# --- bullets written from a role's notes ------------------------------------

NOTES = (
    "Set up Prometheus and Grafana dashboards with alerts on Kafka consumer lag. "
    "Wrote the on-call runbook for the payments API. "
    "Migrated 40 cron jobs to Kubernetes CronJobs."
)
NOTE_BULLETS = [
    "Wired Prometheus and Grafana dashboards with alerting on Kafka consumer lag",
    "Wrote the on-call runbook for the payments API",
    "Migrated 40 cron jobs to Kubernetes CronJobs",
]
BASE_BULLET = "Built Python FastAPI services handling 12k req/s"
EIGHT_SKILLS = [{"category": "Backend", "items": [
    "Python", "FastAPI", "Docker", "Kubernetes", "Redis", "Kafka", "Terraform", "Linux",
]}]


def _seed_with_notes(db, skills):
    base = {
        **BASE_CV,
        "experience": [{**BASE_CV["experience"][0], "bullets": [BASE_BULLET], "notes": NOTES}],
        "skills": skills,
    }
    user = User(id="u1", email="o@x.com", name="Omar")
    db.add(user)
    db.add(CV(userId="u1", structuredData=json.dumps(base)))
    db.add(
        Job(
            id="j1", userId="u1", title="Backend Engineer", company="Acme",
            description="We need Python and FastAPI.", relevanceStatus="good_fit",
            agentStatus="pending", applicationStatus="new",
        )
    )
    db.commit()
    return user


def _writing(summary, skills, bullets):
    tailored = {
        "summary": summary,
        "experience": [{"company": "Acme", "title": "Software Engineer", "bullets": bullets}],
        "skills": skills,
    }
    return (
        "## KEYWORDS\nPython, FastAPI\n## ARCHETYPE\nbackend\n"
        "## RESUME\n" + json.dumps(tailored) + "\n"
        "## COVER LETTER\nDear team, I built Python systems.\n"
    )


def test_generate_writes_bullets_from_notes_and_stores_neither_notes_nor_markers(db):
    user = _seed_with_notes(db, BASE_CV["skills"])
    written = [NOTE_BULLETS[0], BASE_BULLET, NOTE_BULLETS[1]]  # most relevant first
    llm.use(_staged_llm(_writing("Backend engineer.", BASE_CV["skills"], written)))
    pdf_generator.use_renderer(FakeRenderer([1]))

    jobs = intake.generate_for_jobs(db, user, ["j1"])

    role = json.loads(jobs[0].generatedCv)["experience"][0]
    assert role["bullets"] == written
    # The stored CV is what the page shows: private notes and fit markers stay out.
    assert "notes" not in role
    assert "baseBulletCount" not in role


def test_generate_gives_back_bullets_beyond_the_base_count_first_and_trims_until_the_page_fits(db):
    """Three bullets beyond the base count, a summary sentence and four skill
    items: eight trims, more than the six the LLM trimmer was budgeted. Each
    deterministic trim is small and re-measured by a render, so the loop keeps
    going until the page fits."""
    user = _seed_with_notes(db, EIGHT_SKILLS)
    summary = "Backend engineer. Ships Python services. Runs FastAPI in production."
    llm.use(_staged_llm(_writing(summary, EIGHT_SKILLS, [BASE_BULLET, *NOTE_BULLETS])))
    pdf_generator.use_renderer(FakeRenderer([2] * 8 * 8 + [1]))

    jobs = intake.generate_for_jobs(db, user, ["j1"])

    stored = json.loads(jobs[0].generatedCv)
    assert stored["experience"][0]["bullets"] == [BASE_BULLET]
    assert stored["summary"] == "Backend engineer. Ships Python services."
    assert stored["skills"][0]["items"] == ["Python", "FastAPI", "Docker", "Kubernetes"]
    assert stored["fitNotes"] == [
        f"Dropped to fit one page: Acme bullet 4 ({NOTE_BULLETS[2]!r})",
        f"Dropped to fit one page: Acme bullet 3 ({NOTE_BULLETS[1]!r})",
        f"Dropped to fit one page: Acme bullet 2 ({NOTE_BULLETS[0]!r})",
    ]
