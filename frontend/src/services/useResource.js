import { useCallback, useEffect, useRef, useState } from "react";

// One hook for "load this from the server and tell me where we are".
//
// Every page had its own copy of the same five lines: a `firstLoad` flag for the
// skeleton, an onSuccess setter, an onError that only cleared the flag, and — on
// the one page that needed to refetch — a hand-rolled counter to retrigger the
// effect. This owns that lifecycle.
//
//   const [jobs, { firstLoad, refetch }] = useResource(
//     () => api.list({ view, page }), [view, page], { items: [], total: 0 },
//   );
//
// `fetcher` must resolve to the value, or to undefined when the request failed
// (which is what the resource modules do — the error has already been shown).
export default function useResource(fetcher, deps = [], initial = null) {
	const [data, setData] = useState(initial);
	const [firstLoad, setFirstLoad] = useState(true);
	const [loading, setLoading] = useState(true);
	const [reloadKey, setReloadKey] = useState(0);

	// Keep the latest fetcher without making it a dependency: inline arrow
	// functions change identity every render, and depending on one would loop.
	const fetcherRef = useRef(fetcher);
	fetcherRef.current = fetcher;

	const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);

		Promise.resolve(fetcherRef.current())
			.then((value) => {
				// A late response from a superseded request must not overwrite
				// the current one.
				if (cancelled) return;
				if (value !== undefined) setData(value);
			})
			.finally(() => {
				if (cancelled) return;
				setLoading(false);
				setFirstLoad(false);
			});

		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [...deps, reloadKey]);

	return [data, { firstLoad, loading, refetch, setData }];
}
