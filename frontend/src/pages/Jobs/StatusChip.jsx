import { Check, ChevronDown } from "lucide-react";
import { useRef, useState } from "react";

import { PortalMenu } from "components/ui/portal-menu";

export default function StatusChip({ value, options, colorMap, onChange, menuLabel = "Change status" }) {
	const [open, setOpen] = useState(false);
	const triggerRef = useRef(null);

	const cls = colorMap[value] ?? colorMap.__default ?? "bg-st-neutral text-st-neutral-fg";
	const label = options.find((o) => o.value === value)?.label ?? value;

	return (
		<>
			<button
				ref={triggerRef}
				type="button"
				onClick={() => setOpen((o) => !o)}
				aria-haspopup="menu"
				aria-expanded={open}
				aria-label={`${menuLabel} (currently ${label})`}
				className={`inline-flex items-center gap-1 ${cls} rounded-full pl-2.5 pr-1.5 h-[22px] text-micro font-medium leading-none cursor-pointer hover:opacity-90 transition-opacity focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2`}
			>
				<span>{label}</span>
				<ChevronDown
					aria-hidden="true"
					className={`h-3 w-3 opacity-60 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
				/>
			</button>
			<PortalMenu
				open={open}
				onClose={() => setOpen(false)}
				triggerRef={triggerRef}
				align="left"
				className="min-w-[140px]"
				ariaLabel={menuLabel}
			>
				{options.map((o) => {
					const optCls = colorMap[o.value] ?? "bg-st-neutral text-st-neutral-fg";
					return (
						<button
							key={o.value}
							type="button"
							role="menuitem"
							onClick={() => {
								onChange(o.value);
								setOpen(false);
							}}
							className="w-full flex items-center justify-between gap-3 px-2.5 h-8 text-body text-ink cursor-pointer text-left hover:bg-hovertint focus:bg-hovertint focus:outline-none"
						>
							<span
								className={`inline-flex items-center ${optCls} rounded-full px-2 h-[18px] text-micro font-medium leading-none`}
							>
								{o.label}
							</span>
							{o.value === value && <Check className="h-3.5 w-3.5 text-ink shrink-0" aria-hidden="true" />}
						</button>
					);
				})}
			</PortalMenu>
		</>
	);
}

// Single source of truth for relevance statuses: dropdown label, chip classes
// (semantic status tokens) and the row's left-border color (CSS var, flips
// with the theme). Mirrors backend job.py default relevanceStatus="unscreened".
export const RELEVANCE_META = {
	unscreened: { label: "Unscreened", chip: "bg-st-neutral text-st-neutral-fg", border: "var(--st-neutral-solid)" },
	good_fit: { label: "Good fit", chip: "bg-st-ok text-st-ok-fg", border: "var(--st-ok-solid)" },
	maybe: { label: "Maybe", chip: "bg-st-warn text-st-warn-fg", border: "var(--st-warn-solid)" },
	irrelevant: { label: "No fit", chip: "bg-st-bad text-st-bad-fg", border: "var(--st-bad-solid)" },
};

export const RELEVANCE_OPTIONS = Object.entries(RELEVANCE_META).map(([value, meta]) => ({
	value,
	label: meta.label,
}));
export const RELEVANCE_COLORS = Object.fromEntries(
	Object.entries(RELEVANCE_META).map(([value, meta]) => [value, meta.chip]),
);

export const APP_OPTIONS = [
	{ value: "new", label: "New" },
	{ value: "applied", label: "Applied" },
	{ value: "interview", label: "Interview" },
	{ value: "offer", label: "Offer" },
	{ value: "rejected", label: "Rejected" },
];
export const APP_COLORS = {
	new: "bg-st-neutral text-st-neutral-fg",
	applied: "bg-st-info text-st-info-fg",
	interview: "bg-st-warn text-st-warn-fg",
	offer: "bg-st-ok text-st-ok-fg",
	rejected: "bg-st-bad text-st-bad-fg",
};
