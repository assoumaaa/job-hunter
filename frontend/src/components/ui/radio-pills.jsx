import { useRef } from "react";
import { cn } from "utils/cn";

/**
 * Single-select pill row with APG radiogroup semantics: one tab stop, arrows
 * move selection, state exposed via aria-checked (not color alone).
 */
export function RadioPills({ label, options, value, onChange, className }) {
	const refs = useRef([]);
	const idx = Math.max(
		0,
		options.findIndex((o) => o.value === value),
	);

	const onKeyDown = (e) => {
		let next = null;
		if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % options.length;
		if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + options.length) % options.length;
		if (e.key === "Home") next = 0;
		if (e.key === "End") next = options.length - 1;
		if (next != null) {
			e.preventDefault();
			onChange(options[next].value);
			refs.current[next]?.focus();
		}
	};

	return (
		<div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
			{options.map((o, i) => {
				const active = o.value === value;
				return (
					<button
						key={o.value}
						ref={(el) => (refs.current[i] = el)}
						type="button"
						role="radio"
						aria-checked={active}
						tabIndex={i === idx ? 0 : -1}
						onClick={() => onChange(o.value)}
						onKeyDown={onKeyDown}
						className={cn(
							"px-3 h-7 rounded-full text-label font-medium border transition-colors cursor-pointer",
							"focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
							active
								? "bg-ink text-canvas border-transparent"
								: "bg-surface border-line text-ink-2 hover:border-line-strong hover:text-ink",
						)}
					>
						{o.label}
					</button>
				);
			})}
		</div>
	);
}
