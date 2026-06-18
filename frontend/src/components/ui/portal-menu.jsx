import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "utils/cn";
import { useDismiss } from "utils/useDismiss";

/**
 * A fixed-position dropdown panel portaled to <body>, anchored under `triggerRef`.
 * The trigger and its open/close state live in the consumer; this owns only the
 * floating panel: position, outside-click/Escape dismiss, and close-on-scroll.
 */
export function PortalMenu({ open, onClose, triggerRef, align = "left", className, children }) {
	const menuRef = useRef(null);
	const [coords, setCoords] = useState(null);

	useLayoutEffect(() => {
		if (!open || !triggerRef.current) return;
		const rect = triggerRef.current.getBoundingClientRect();
		setCoords(
			align === "right"
				? { top: rect.bottom + 4, right: window.innerWidth - rect.right }
				: { top: rect.bottom + 4, left: rect.left },
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	useDismiss({ open, onClose, refs: [triggerRef, menuRef] });

	useEffect(() => {
		if (!open) return;
		const onScroll = () => onClose();
		window.addEventListener("scroll", onScroll, true);
		window.addEventListener("resize", onScroll);
		return () => {
			window.removeEventListener("scroll", onScroll, true);
			window.removeEventListener("resize", onScroll);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	if (!open || !coords) return null;
	return createPortal(
		<div
			ref={menuRef}
			style={{ position: "fixed", zIndex: 50, ...coords }}
			className={cn("rounded-lg border border-zinc-200 bg-white shadow-lg py-1", className)}
		>
			{children}
		</div>,
		document.body,
	);
}
