import { useMemo } from "react";

import { contactFromProfile, EMPTY_STATS, parseCvJson } from "models/job";
import useCallApi from "services/callApi";

// Every call to the jobs/cv/profile endpoints, in one place.
//
// Pages ask for jobs, not for "/jobs?view=…": endpoint paths, query params and
// the shape of what comes back are this module's business. Methods return the
// decoded value, or `undefined` when the request failed — `useCallApi` has
// already surfaced the error to the user by then.

export function useJobsApi() {
	const [callApi, loading] = useCallApi();

	// Memoized on `callApi` alone — NOT on `loading`, which flips on every
	// request. A resource object that changed identity mid-flight would retrigger
	// every effect that depends on it.
	const api = useMemo(() => {
		const api = {
			list: ({ company = "", title = "", view = "all", sort = "fetchedAt", direction = "desc", page = 1, pageSize = 50 } = {}, opts = {}) =>
				callApi("/jobs", {
					params: { company, title, view, sort, direction, page, pageSize },
					error: "Failed to load jobs",
					...opts,
				}).then((res) => ({ items: res?.items ?? [], total: res?.total ?? 0 })),

			stats: (opts = {}) =>
				callApi("/jobs/stats", { error: "Failed to load stats", ...opts }).then(
					(s) => s ?? EMPTY_STATS,
				),

			get: (jobId, opts = {}) =>
				callApi(`/jobs/${jobId}`, { error: "Failed to load job", ...opts }),

			patch: (fields, opts = {}) =>
				callApi("/jobs", { method: "PATCH", json: fields, error: "Update failed", ...opts }),

			remove: (ids, opts = {}) =>
				callApi("/jobs/delete", { json: { ids }, error: "Delete failed", ...opts }),

			screen: (ids, opts = {}) =>
				callApi("/jobs/screen", {
					json: ids ? { ids } : {},
					error: "Screening failed",
					alias: "screenJobs",
					...opts,
				}),

			fetchNew: (datePosted, opts = {}) =>
				callApi("/jobs/fetch", {
					json: { datePosted },
					error: "Fetch failed",
					alias: "fetchJobs",
					...opts,
				}),

			generate: (jobIds, opts = {}) =>
				callApi("/jobs/generate", {
					json: { jobIds },
					error: "Generation failed",
					alias: "generateJobs",
					...opts,
				}),

			extractUrl: (url, opts = {}) =>
				callApi("/jobs/extract-url", { json: { url }, error: "Could not read that page", ...opts }),

			addManual: (job, opts = {}) =>
				callApi("/jobs/manual", { json: job, error: "Could not add the job", ...opts }),

			tweak: (jobId, target, prompt, opts = {}) =>
				callApi(`/jobs/${jobId}/tweak`, {
					json: { target, prompt },
					error: "Tweak failed",
					...opts,
				}),

			resetTweaks: (jobId, opts = {}) =>
				callApi(`/jobs/${jobId}/reset-tweaks`, { json: {}, error: "Reset failed", ...opts }),

			// The list rows don't carry document content, so opening one is
			// "load the job, then compile the document it holds".
			compileDocument: async (jobId, target, contact) => {
				const job = await api.get(jobId);
				if (!job) return undefined;
				if (target === "cv") {
					const structuredData = parseCvJson(job.generatedCv);
					return structuredData ? api.compileCv(structuredData) : undefined;
				}
				return job.generatedCl ? api.compileCl(job.generatedCl, contact) : undefined;
			},

			compileCv: (structuredData, { trim = false } = {}) =>
				callApi(`/cv/compile${trim ? "?trim=true" : ""}`, {
					json: { structuredData },
					responseType: "blob",
					error: "PDF compile failed",
				}),

			compileCl: (text, contact) =>
				callApi("/cv/compile-cl", {
					json: { text, contact },
					responseType: "blob",
					error: "PDF compile failed",
				}),

			// Used by pages that render a cover letter and need the candidate's
			// details for the letterhead.
			contact: () =>
				callApi("/profile", { suppressError: true }).then(contactFromProfile),
		};
		return api;
	}, [callApi]);

	return [api, loading];
}

export default useJobsApi;
