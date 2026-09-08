import { useMemo } from "react";

import { contactFromProfile } from "models/job";
import useCallApi from "services/callApi";

// Profile, saved positions and job-search settings.
export function useProfileApi() {
	const [callApi, loading] = useCallApi();

	// Memoized on `callApi` alone — `loading` flips per request.
	const api = useMemo(() => {
		const api = {
			get: (opts = {}) => callApi("/profile", { error: "Failed to load profile", ...opts }),

			save: (profile, opts = {}) =>
				callApi("/profile", {
					json: profile,
					success: "Profile saved",
					error: "Save failed",
					...opts,
				}),

			// The letterhead subset, derived in one place rather than re-picked
			// on every page that renders a cover letter.
			contact: (opts = {}) =>
				callApi("/profile", { suppressError: true, ...opts }).then(contactFromProfile),

			positions: (opts = {}) =>
				callApi("/positions", { error: "Failed to load positions", ...opts }),

			addPosition: (title, opts = {}) =>
				callApi("/positions", { json: { title }, error: "Could not add", ...opts }),

			removePosition: (id, opts = {}) =>
				callApi("/positions", { method: "DELETE", json: { id }, error: "Could not remove", ...opts }),

			jobSettings: (opts = {}) =>
				callApi("/job-settings", { error: "Failed to load settings", ...opts }),

			saveJobSettings: (settings, opts = {}) =>
				callApi("/job-settings", {
					json: settings,
					success: "Settings saved",
					error: "Save failed",
					...opts,
				}),

			appSettings: (opts = {}) =>
				callApi("/settings", { error: "Failed to load settings", ...opts }),

			saveAppSettings: (settings, opts = {}) =>
				callApi("/settings", {
					method: "PUT",
					json: settings,
					success: "Settings saved",
					error: "Save failed",
					...opts,
				}),
		};
		return api;
	}, [callApi]);

	return [api, loading];
}

export default useProfileApi;
