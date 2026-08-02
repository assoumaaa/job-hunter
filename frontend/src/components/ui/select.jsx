import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { cn } from "utils/cn";

/**
 * Custom select with APG listbox semantics: the trigger reports
 * aria-haspopup/aria-expanded, the popup is a focused role="listbox" driven
 * by aria-activedescendant, and arrow keys / Home / End / Enter / Escape all
 * work. Pass `label` for a visible label or `ariaLabel` when the context
 * already names the control.
 */
export function Select({ value, onChange, options, className, placeholder, disabled, align = "left", label, ariaLabel }) {
	const [open, setOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);
	const rootRef = useRef(null);
	const triggerRef = useRef(null);
	const listRef = useRef(null);
	const listboxId = useId();
	const labelId = useId();

	const current = options.find((o) => o.value === value);
	const currentIndex = Math.max(
		0,
		options.findIndex((o) => o.value === value),
	);

	const openList = () => {
		if (disabled) return;
		setActiveIndex(currentIndex);
		setOpen(true);
	};

	const close = ({ refocus }) => {
		setOpen(false);
		if (refocus) triggerRef.current?.focus();
	};

	const selectAt = (index) => {
		const option = options[index];
		if (!option) return;
		onChange(option.value);
		close({ refocus: true });
	};

	// Focus the listbox once it renders; close on outside pointer-down.
	useEffect(() => {
		if (!open) return;
		listRef.current?.focus();
		const onDoc = (e) => {
			if (!rootRef.current?.contains(e.target)) close({ refocus: false });
		};
		document.addEventListener("mousedown", onDoc);
		return () => document.removeEventListener("mousedown", onDoc);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	const onTriggerKeyDown = (e) => {
		if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key) && !open) {
			e.preventDefault();
			openList();
		}
	};

	const onListKeyDown = (e) => {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setActiveIndex((i) => Math.min(i + 1, options.length - 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setActiveIndex((i) => Math.max(i - 1, 0));
		} else if (e.key === "Home") {
			e.preventDefault();
			setActiveIndex(0);
		} else if (e.key === "End") {
			e.preventDefault();
			setActiveIndex(options.length - 1);
		} else if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			selectAt(activeIndex);
		} else if (e.key === "Escape") {
			e.preventDefault();
			close({ refocus: true });
		} else if (e.key === "Tab") {
			close({ refocus: false });
		}
	};

	const trigger = (
		<div ref={rootRef} className="relative inline-block">
			<button
				ref={triggerRef}
				type="button"
				disabled={disabled}
				onClick={() => (open ? close({ refocus: false }) : openList())}
				onKeyDown={onTriggerKeyDown}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-label={label ? undefined : ariaLabel}
				aria-labelledby={label ? labelId : undefined}
				className={cn(
					"inline-flex items-center h-9 rounded-lg border border-line bg-surface pl-2.5 pr-7 text-body font-medium text-ink hover:border-line-strong",
					"focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-0",
					"cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors relative whitespace-nowrap",
					className,
				)}
			>
				<span className="truncate">{current?.label ?? placeholder ?? ""}</span>
				<ChevronDown
					aria-hidden="true"
					className={`absolute right-2 h-3.5 w-3.5 text-ink-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
				/>
			</button>
			{open && (
				<div
					ref={listRef}
					role="listbox"
					id={listboxId}
					tabIndex={-1}
					aria-label={label ?? ariaLabel}
					aria-activedescendant={`${listboxId}-${activeIndex}`}
					onKeyDown={onListKeyDown}
					className={cn(
						"absolute z-50 top-[calc(100%+4px)] min-w-full rounded-lg border border-line bg-raised shadow-overlay py-1 focus-visible:outline-none",
						align === "right" ? "right-0" : "left-0",
					)}
				>
					{options.map((o, i) => (
						<div
							key={o.value}
							id={`${listboxId}-${i}`}
							role="option"
							aria-selected={o.value === value}
							onClick={() => selectAt(i)}
							onMouseEnter={() => setActiveIndex(i)}
							className={cn(
								"flex items-center justify-between gap-3 px-2.5 h-8 text-body text-ink cursor-pointer text-left",
								i === activeIndex && "bg-hovertint",
							)}
						>
							<span className="truncate">{o.label}</span>
							{o.value === value && <Check className="h-3.5 w-3.5 text-ink shrink-0" aria-hidden="true" />}
						</div>
					))}
				</div>
			)}
		</div>
	);

	if (!label) return trigger;
	return (
		<div className="flex flex-col gap-1.5">
			<span id={labelId} className="text-micro font-medium text-ink-2">
				{label}
			</span>
			{trigger}
		</div>
	);
}
