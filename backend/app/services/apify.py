from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import quote

from apify_client import ApifyClient

from ..core.config import settings

# Country code → LinkedIn geoId + locationName
# Same subset as the TypeScript version
COUNTRIES: dict[str, dict] = {
    "AE": {"geoId": "104305776", "locationName": "United Arab Emirates"},
    "AU": {"geoId": "101452733", "locationName": "Australia"},
    "CA": {"geoId": "101174742", "locationName": "Canada"},
    "DE": {"geoId": "101282230", "locationName": "Germany"},
    "FR": {"geoId": "105015875", "locationName": "France"},
    "GB": {"geoId": "101165590", "locationName": "United Kingdom"},
    "NL": {"geoId": "102890719", "locationName": "Netherlands"},
    "SG": {"geoId": "102454443", "locationName": "Singapore"},
    "US": {"geoId": "103644278", "locationName": "United States"},
    "MA": {"geoId": "102787409", "locationName": "Morocco"},
    "TN": {"geoId": "104527395", "locationName": "Tunisia"},
    "DZ": {"geoId": "104667471", "locationName": "Algeria"},
    "EG": {"geoId": "106112869", "locationName": "Egypt"},
}

DATE_POSTED_FILTERS = {"24h": "r86400", "week": "r604800", "month": "r2592000"}

JOB_TYPE_CODES = {"fulltime": "F", "parttime": "P", "contract": "C", "internship": "I"}


@dataclass
class ApifyJob:
    id: str
    title: str
    company: str
    location: str
    description: str
    url: str
    salary: str | None = None
    job_type: str | None = None
    seniority_level: str | None = None


def fetch_linkedin_jobs(
    positions: list[str],
    country_codes: list[str] | None = None,
    date_posted: str = "month",
    job_types: list[str] | None = None,
) -> list[ApifyJob]:
    country_codes = [] if country_codes is None else country_codes
    job_types = ["fulltime"] if job_types is None else job_types
    apify = ApifyClient(settings.APIFY_TOKEN)

    tpr = DATE_POSTED_FILTERS.get(date_posted, DATE_POSTED_FILTERS["month"])
    jt_codes = [JOB_TYPE_CODES.get(t, t) for t in job_types if JOB_TYPE_CODES.get(t, t)]
    jt_param = "&f_JT=" + "%2C".join(jt_codes) if jt_codes else ""

    urls = []
    for pos in positions:
        keywords = quote(pos)
        if not country_codes:
            urls.append(
                f"https://www.linkedin.com/jobs/search/?keywords={keywords}&f_TPR={tpr}{jt_param}&position=1&pageNum=0"
            )
        else:
            for code in country_codes:
                country = COUNTRIES.get(code.upper())
                if not country:
                    continue
                loc = quote(country["locationName"])
                urls.append(
                    f"https://www.linkedin.com/jobs/search/?keywords={keywords}&location={loc}&geoId={country['geoId']}&f_TPR={tpr}{jt_param}&position=1&pageNum=0"
                )

    count_per_url = 15 if len(urls) > 6 else 35

    run = apify.actor("curious_coder/linkedin-jobs-scraper").call(
        run_input={"urls": urls, "count": count_per_url, "scrapeCompany": False}
    )

    items = apify.dataset(run["defaultDatasetId"]).list_items().items

    result = []
    for item in items:
        raw_url = str(item.get("link") or "")
        clean_url = raw_url.split("?")[0] if raw_url else raw_url

        salary_info = item.get("salaryInfo")
        salary = (
            " - ".join(salary_info)
            if isinstance(salary_info, list) and salary_info
            else None
        )

        result.append(
            ApifyJob(
                id=str(item.get("id") or ""),
                title=str(item.get("title") or ""),
                company=str(item.get("companyName") or ""),
                location=str(item.get("location") or ""),
                description=str(item.get("descriptionText") or ""),
                url=clean_url,
                salary=salary,
                job_type=(
                    str(item["employmentType"]) if item.get("employmentType") else None
                ),
                seniority_level=(
                    str(item["seniorityLevel"]) if item.get("seniorityLevel") else None
                ),
            )
        )

    return result
