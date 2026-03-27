import { ApifyClient } from "apify-client";
import { getCountryByCode } from "./countries";

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

export interface ApifyJob {
	id: string;
	title: string;
	company: string;
	location: string;
	description: string;
	url: string;
	salary?: string;
	jobType?: string;
	seniorityLevel?: string;
}

// LinkedIn f_TPR values for time-based filtering
const DATE_POSTED_FILTERS: Record<string, string> = {
	"24h": "r86400",
	"week": "r604800",
	"month": "r2592000",
};

// LinkedIn f_JT values for job type filtering
const JOB_TYPE_CODES: Record<string, string> = {
	fulltime: "F",
	parttime: "P",
	contract: "C",
	internship: "I",
};

export async function fetchLinkedInJobs(
	positions: string[],
	countryCodes: string[] = [],
	datePosted: string = "month",
	jobTypes: string[] = ["fulltime"],
): Promise<ApifyJob[]> {
	const urls: string[] = [];
	const tpr = DATE_POSTED_FILTERS[datePosted] ?? DATE_POSTED_FILTERS["month"];
	const jtParam =
		jobTypes.length > 0
			? "&f_JT=" +
				jobTypes
					.map((t) => JOB_TYPE_CODES[t] ?? t)
					.filter(Boolean)
					.join("%2C")
			: "";

	for (const pos of positions) {
		const keywords = encodeURIComponent(pos);
		if (countryCodes.length === 0) {
			urls.push(
				`https://www.linkedin.com/jobs/search/?keywords=${keywords}&f_TPR=${tpr}${jtParam}&position=1&pageNum=0`,
			);
		} else {
			for (const code of countryCodes) {
				const country = getCountryByCode(code);
				if (!country) continue;
				const loc = encodeURIComponent(country.locationName);
				urls.push(
					`https://www.linkedin.com/jobs/search/?keywords=${keywords}&location=${loc}&geoId=${country.geoId}&f_TPR=${tpr}${jtParam}&position=1&pageNum=0`,
				);
			}
		}
	}

	const countPerUrl = urls.length > 6 ? 15 : 35;

	const run = await client.actor("curious_coder/linkedin-jobs-scraper").call({
		urls,
		count: countPerUrl,
		scrapeCompany: false,
	});

	const { items } = await client.dataset(run.defaultDatasetId).listItems();

	return items.map((item: Record<string, unknown>) => {
		const rawUrl = String(item.link ?? "");
		const cleanUrl = rawUrl ? rawUrl.split("?")[0] : rawUrl;
		return {
			id: String(item.id ?? Math.random()),
			title: String(item.title ?? ""),
			company: String(item.companyName ?? ""),
			location: String(item.location ?? ""),
			description: String(item.descriptionText ?? ""),
			url: cleanUrl,
			salary:
				Array.isArray(item.salaryInfo) && item.salaryInfo.length
					? (item.salaryInfo as string[]).join(" - ")
					: undefined,
			jobType: item.employmentType ? String(item.employmentType) : undefined,
			seniorityLevel: item.seniorityLevel
				? String(item.seniorityLevel)
				: undefined,
		};
	});
}
