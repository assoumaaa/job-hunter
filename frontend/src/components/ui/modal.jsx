import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "utils/cn";

/**
 * Accessible dialog: portaled to <body>, role="dialog" + aria-modal, labelled
 * by its title, focus moves in on open and back to the trigger on close, and
 * the app root behind it is made inert (which also traps Tab).
 */
export function Modal({ open = true, onClose, title, ariaLabel, icon: Icon, children, footer, width = 480 }) {
	const panelRef = useRef(null);
	const titleId = useId();

	useEffect(() => {
		if (!open) return;
		const onKey = (e) => e.key === "Escape" && onClose?.();
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	useEffect(() => {
		if (!open) return;
		const previouslyFocused = document.activeElement;
		const root = document.getElementById("root");
		if (root) root.inert = true;
		panelRef.current?.focus();
		return () => {
			if (root) root.inert = false;
			if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
		};
	}, [open]);

	if (!open) return null;

	return createPortal(
		<div
			className="fixed inset-0 z-[9999] flex items-center justify-center bg-zinc-950/40 backdrop-blur-[2px] p-4 overscroll-contain"
			onClick={onClose}
		>
			<div
				ref={panelRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={title ? titleId : undefined}
				aria-label={title ? undefined : ariaLabel}
				tabIndex={-1}
				onClick={(e) => e.stopPropagation()}
				className={cn(
					"bg-surface rounded-xl shadow-modal border border-line flex flex-col max-h-[90vh] overflow-hidden focus-visible:outline-none",
				)}
				style={{ width }}
			>
				{(title || Icon) && (
					<div className="flex items-center gap-3 px-5 py-4 border-b border-line">
						{Icon && (
							<div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
								<Icon className="h-4 w-4 text-ink-2" aria-hidden="true" />
							</div>
						)}
						<h2 id={titleId} className="text-body font-semibold text-ink flex-1">
							{title}
						</h2>
						<button
							type="button"
							onClick={onClose}
							aria-label="Close"
							className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-ink-3 hover:text-ink transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
						>
							<X className="h-4 w-4" aria-hidden="true" />
						</button>
					</div>
				)}
				<div className="overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
				{footer && (
					<div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-line bg-canvas/50">
						{footer}
					</div>
				)}
			</div>
		</div>,
		document.body,
	);
}
