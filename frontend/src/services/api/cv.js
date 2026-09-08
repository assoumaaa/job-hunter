import { useMemo } from "react";

import { useAuth } from "@clerk/clerk-react";

import Config from "services/Config";
import useCallApi from "services/callApi";

const API_URL = Config.getEnv("VITE_API_URL") ?? "";

// The base CV: load, save, and the two ways to get one in (a PDF upload or
// pasted text).
export function useCvApi() {
	const [callApi, loading] = useCallApi();
	const { getToken } = useAuth();

	// Memoized on the stable deps only — `loading` flips per request.
	const api = useMemo(() => {
		const api = {
			get: (opts = {}) => callApi("/cv", { error: "Failed to load CV", ...opts }),

			save: (structuredData, opts = {}) =>
				callApi("/cv", {
					json: { structuredData },
					success: "CV saved",
					error: "Save failed",
					...opts,
				}),

			parseText: (text, opts = {}) =>
				callApi("/cv/parse-text", {
					json: { text },
					error: "Could not read that text",
					...opts,
				}),

			// Multipart, so it goes out through fetch rather than the axios
			// instance — but the auth header and the base URL still come from
			// the same places every other call uses.
			upload: async (file) => {
				const form = new FormData();
				form.append("file", file);
				const token = await getToken();
				const resp = await window.fetch(`${API_URL}/cv/upload`, {
					method: "POST",
					headers: token ? { Authorization: `Bearer ${token}` } : {},
					body: form,
				});
				if (!resp.ok) {
					let detail = "Upload failed";
					try {
						detail = (await resp.json())?.detail ?? detail;
					} catch {
						/* non-JSON error body */
					}
					throw new Error(detail);
				}
				return resp.json();
			},

			compile: (structuredData, { trim = false } = {}) =>
				callApi(`/cv/compile${trim ? "?trim=true" : ""}`, {
					json: { structuredData },
					responseType: "blob",
					error: "PDF compile failed",
				}),
		};
		return api;
	}, [callApi, getToken]);

	return [api, loading];
}

export default useCvApi;
