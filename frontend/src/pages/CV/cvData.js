// Shape helpers for the CV editor — the single place the client agrees with the
// backend on what a CV (and a bullet) looks like. The bullet contract with the
// PDF renderer is: experience[i].bullets = [{ text: string, condition: string | null }].
//   condition null / "" -> "Always" (in every CV)
//   condition non-empty  -> "Conditional" (only when a job matches the condition)
// Legacy tolerance: a bullet may load as a plain string — we normalize it to
// { text, condition: null }. We always SAVE bullets as { text, condition } objects.

export const EMPTY_CV = {
	header: { name: "", email: "", phone: "", location: "", linkedin: "", github: "", portfolio: "" },
	summary: "",
	competencies: [],
	experience: [],
	projects: [],
	education: [],
	certifications: [],
	skills: [],
	languages: [],
};

let _seq = 0;

// Client-only stable id — used for React keys so reordering never bleeds focus
// or component state between rows. Stripped from what we persist.
export function genId() {
	if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
	_seq += 1;
	return `b_${Date.now().toString(36)}_${_seq}`;
}

export function newBullet() {
	return { _id: genId(), text: "", condition: null };
}

// Normalize any incoming bullet (legacy string or object) to { _id, text, condition }.
// An empty / whitespace-only condition collapses to null (Always).
export function normalizeBullet(b) {
	if (typeof b === "string") return { _id: genId(), text: b, condition: null };
	if (b && typeof b === "object") {
		const cond = typeof b.condition === "string" && b.condition.trim() ? b.condition : null;
		return { _id: b._id ?? genId(), text: typeof b.text === "string" ? b.text : "", condition: cond };
	}
	return newBullet();
}

// In-editor "conditional mode" is on whenever condition is a string (even ""),
// so the panel can stay open while the user is still typing the condition.
export function isConditionMode(b) {
	return b != null && b.condition != null;
}

// A bullet is truly conditional (for the preview marker / save) only when its
// condition has real, non-whitespace text.
export function hasCondition(b) {
	return !!(b && typeof b.condition === "string" && b.condition.trim());
}

export function bulletText(b) {
	return typeof b === "string" ? b : b?.text ?? "";
}

// A role's alternate titles (other titles equally true of it — the backend
// only ever retitles a role to one of these) are edited as one comma-separated
// line, kept in a client-only field so a half-typed comma survives re-renders.
export function altTitlesText(exp) {
	return (exp.alternateTitles || []).join(", ");
}

export function parseAltTitles(text) {
	return (text || "")
		.split(",")
		.map((t) => t.trim())
		.filter(Boolean);
}

// Merge loaded data over EMPTY_CV and normalize every experience bullet.
export function normalizeCv(raw) {
	const base = { ...EMPTY_CV, ...(raw || {}) };
	return {
		...base,
		header: { ...EMPTY_CV.header, ...(base.header || {}) },
		experience: (base.experience || []).map((exp) => ({
			...exp,
			_altTitlesText: altTitlesText(exp),
			bullets: (exp.bullets || []).map(normalizeBullet),
		})),
	};
}

// Produce the payload we send to the backend. Bullets are always plain
// { text, condition } objects (no client _id, empty condition -> null).
export function serializeForSave(cv) {
	return {
		...cv,
		experience: (cv.experience || []).map(({ _altTitlesText, ...exp }) => ({
			...exp,
			alternateTitles: _altTitlesText != null ? parseAltTitles(_altTitlesText) : exp.alternateTitles || [],
			bullets: (exp.bullets || []).map((b) => {
				const nb = normalizeBullet(b);
				return { text: nb.text, condition: hasCondition(nb) ? nb.condition : null };
			}),
		})),
	};
}
