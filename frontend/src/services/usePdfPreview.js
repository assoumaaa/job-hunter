import { useCallback, useEffect, useRef, useState } from "react";

// The object-URL lifecycle for a rendered PDF preview.
//
// A blob URL leaks until it's revoked, and the "revoke the previous one, keep
// the new one, revoke the last on unmount" dance was written out at five call
// sites. Pass a function that resolves to a blob; get back a URL you can point
// an <iframe> at.
export default function usePdfPreview() {
	const [url, setUrl] = useState(null);
	const [loading, setLoading] = useState(false);
	const current = useRef(null);

	const revoke = useCallback(() => {
		if (current.current) URL.revokeObjectURL(current.current);
		current.current = null;
	}, []);

	const render = useCallback(
		async (compile) => {
			if (!compile) {
				revoke();
				setUrl(null);
				return;
			}
			setLoading(true);
			try {
				const blob = await compile();
				if (!blob) return; // the failure has already been surfaced
				const next = URL.createObjectURL(blob);
				revoke();
				current.current = next;
				setUrl(next);
			} finally {
				setLoading(false);
			}
		},
		[revoke],
	);

	useEffect(() => revoke, [revoke]);

	return [url, { loading, render }];
}
