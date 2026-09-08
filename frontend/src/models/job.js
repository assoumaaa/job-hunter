// The Job domain as the interface renders it: what a score means, what the
// saved views are called, how a stored document is read.
//
// These lived in whichever page needed them first and drifted. The ATS
// thresholds in particular existed twice with different cut-offs, so the same
// score showed amber on Jobs and blue on Overview.

export const EMPTY_STATS = {
	total: 0,
	toApply: 0,
	applied: 0,
	interviews: 0,
	offers: 0,
	unscreened: 0,
	screened: 0,
	appliedThisWeek: 0,
	avgAts: null,
};

// The saved views, matching backend `job_query.VIEWS`.
export const VIEWS = ["all", "to_apply", "applied", "interview", "rejected", "no_fit"];

export const ATS_BENCHMARK = 80;

// One scale, everywhere a score is shown.
export function atsTone(score) {
	if (score == null) return null;
	if (score >= 90) return "ok";
	if (score >= ATS_BENCHMARK) return "info";
	if (score >= 70) return "warn";
	return "bad";
}

export function agentTag(status) {
	if (status === "generating") return { label: "Optimizing", tone: "accent" };
	if (status === "reviewing") return { label: "Reviewing", tone: "warn" };
	if (status === "done") return { label: "Ready", tone: "ok" };
	if (status === "rejected") return { label: "Rejected", tone: "bad" };
	return null;
}

// dd / mm / yy — the applied-date column's format.
export function formatAppliedDate(value) {
	if (!value) return "";
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return "";
	const pad = (n) => String(n).padStart(2, "0");
	return `${pad(d.getDate())} / ${pad(d.getMonth() + 1)} / ${String(d.getFullYear()).slice(-2)}`;
}

// The value an <input type="date"> wants.
export function toDateInputValue(value) {
	if (!value) return "";
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

// "Berlin, Germany" -> "Berlin"
export function shortLocation(location) {
	return (location ?? "").split(",")[0].trim();
}

// Documents are stored as JSON strings on the Job row. Parse defensively: a
// half-written document should render as empty, not crash the page.
export function parseCvJson(value) {
	if (!value) return null;
	if (typeof value !== "string") return value;
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

export function parseHistory(value) {
	const parsed = parseCvJson(value);
	return Array.isArray(parsed) ? parsed : [];
}

// Several Profile / JobSettings columns are JSON arrays stored as strings.
export function parseJsonList(value, fallback = []) {
	const parsed = parseCvJson(value);
	return Array.isArray(parsed) ? parsed : fallback;
}

// The subset of a Profile the cover-letter renderer needs.
export function contactFromProfile(profile) {
	return {
		name: profile?.fullName ?? "",
		location: profile?.currentLocation ?? "",
		linkedinUrl: profile?.linkedinUrl ?? "",
		githubUrl: profile?.githubUrl ?? "",
	};
}
