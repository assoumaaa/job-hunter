"""Keyword matching must not reward copying a JD's grammar mistakes.

`_keyword_hit` used to pluralize only the last word, so the JD phrase
"APIs integration" matched nothing but the literal "APIs integration" — and the
generator, chasing the keyword score, wrote that on the CV. Each word may now
differ by a plural 's'.
"""

from app.services import ats_scorer


def _hit(keyword, text):
    return ats_scorer._keyword_hit(keyword, ats_scorer._haystack(text))


def test_plural_differences_inside_a_phrase_still_match():
    assert _hit("APIs integration", "Owned API integration for payments")
    assert _hit("API integration", "Shipped APIs integrations across teams")
    assert _hit("RESTful APIs", "Designed a RESTful API layer")


def test_unrelated_words_still_miss():
    assert not _hit("Kubernetes", "Ran Python services on GCP")
    assert not _hit("API integration", "Wrote an API client")  # 'integration' missing


def test_short_acronyms_are_not_depluralised():
    assert not _hit("iOS", "Realtime updates over socket.io")
    assert not _hit("AWS", "Said aw shucks")
    assert _hit("AWS", "Deployed to AWS")
