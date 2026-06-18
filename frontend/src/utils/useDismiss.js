import { useEffect } from "react";

/**
 * Close a popover when the user mousedowns outside it or presses Escape.
 * `refs` is the set of elements considered "inside" (e.g. trigger + menu);
 * a mousedown within any of them is ignored.
 */
export function useDismiss({ open, onClose, refs }) {
	useEffect(() => {
		if (!open) return;
		const inside = (target) => refs.some((ref) => ref.current?.contains(target));
		const onDoc = (e) => {
			if (!inside(e.target)) onClose();
		};
		const onKey = (e) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("mousedown", onDoc);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onDoc);
			document.removeEventListener("keydown", onKey);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);
}
