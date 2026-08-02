import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "utils/cn";
import { useDismiss } from "utils/useDismiss";

/**
 * A fixed-position dropdown panel portaled to <body>, anchored under `triggerRef`.
 * The trigger and its open/close state live in the consumer; this owns the
 * floating panel: position, dismissal, and the APG menu contract. Consumers
 * mark their items role="menuitem" and give the trigger aria-haspopup="menu"
 * + aria-expanded. On open, focus moves to the first item; arrows/Home/End
 * roam items; Escape or activation returns focus to the trigger.
 */
export function PortalMenu({ open, onClose, triggerRef, align = "left", className, children, role = "menu", ariaLabel }) {
	const menuRef = useRef(null);
	const [coords, setCoords] = useState(null);
	// "outside" closes keep focus where the user clicked; every other close
	// (Escape, Tab, item activation) restores focus to the trigger.
	const closeReasonRef = useRef(null);

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
		const onScroll = () => {
			closeReasonRef.current = "outside";
			onClose();
		};
		const markOutside = (e) => {
			const inside =
				triggerRef.current?.contains(e.target) || menuRef.current?.contains(e.target);
			if (!inside) closeReasonRef.current = "outside";
		};
		window.addEventListener("scroll", onScroll, true);
		window.addEventListener("resize", onScroll);
		document.addEventListener("mousedown", markOutside, true);
		return () => {
			window.removeEventListener("scroll", onScroll, true);
			window.removeEventListener("resize", onScroll);
			document.removeEventListener("mousedown", markOutside, true);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	// Focus management: first item on open, trigger on non-outside close.
	useEffect(() => {
		if (!open || !coords) return;
		const items = menuRef.current?.querySelectorAll('[role="menuitem"]:not([disabled])');
		items?.[0]?.focus();
		const trigger = triggerRef.current;
		return () => {
			if (closeReasonRef.current !== "outside") trigger?.focus();
			closeReasonRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, coords]);

	const onKeyDown = (e) => {
		const items = Array.from(menuRef.current?.querySelectorAll('[role="menuitem"]:not([disabled])') ?? []);
		const index = items.indexOf(document.activeElement);
		if (e.key === "ArrowDown") {
			e.preventDefault();
			items[(index + 1) % items.length]?.focus();
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			items[(index - 1 + items.length) % items.length]?.focus();
		} else if (e.key === "Home") {
			e.preventDefault();
			items[0]?.focus();
		} else if (e.key === "End") {
			e.preventDefault();
			items[items.length - 1]?.focus();
		} else if (e.key === "Escape" || e.key === "Tab") {
			e.preventDefault();
			onClose();
		}
	};

	if (!open || !coords) return null;
	return createPortal(
		<div
			ref={menuRef}
			role={role}
			aria-label={ariaLabel}
			onKeyDown={onKeyDown}
			style={{ position: "fixed", zIndex: 50, ...coords }}
			className={cn("rounded-lg border border-line bg-raised shadow-overlay py-1", className)}
		>
			{children}
		</div>,
		document.body,
	);
}
