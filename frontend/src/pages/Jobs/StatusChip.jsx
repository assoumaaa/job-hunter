import { Check, ChevronDown } from "lucide-react";
import { useRef, useState } from "react";

import { PortalMenu } from "components/ui/portal-menu";

export default function StatusChip({ value, options, colorMap, onChange }) {
	const [open, setOpen] = useState(false);
	const triggerRef = useRef(null);

	const cls = colorMap[value] ?? colorMap.__default ?? "bg-zinc-100 text-zinc-600";
	const label = options.find((o) => o.value === value)?.label ?? value;

	return (
		<>
			<button
				ref={triggerRef}
				type="button"
				onClick={() => setOpen((o) => !o)}
				className={`inline-flex items-center gap-1 ${cls} rounded-full pl-2.5 pr-1.5 h-[22px] text-[11px] font-medium leading-none cursor-pointer hover:opacity-90 transition-opacity`}
			>
				<span>{label}</span>
				<ChevronDown
					className={`h-3 w-3 opacity-60 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
				/>
			</button>
			<PortalMenu
				open={open}
				onClose={() => setOpen(false)}
				triggerRef={triggerRef}
				align="left"
				className="min-w-[140px]"
			>
				{options.map((o) => {
					const optCls = colorMap[o.value] ?? "bg-zinc-100 text-zinc-600";
					return (
						<button
							key={o.value}
							type="button"
							onClick={() => {
								onChange(o.value);
								setOpen(false);
							}}
							className="w-full flex items-center justify-between gap-3 px-2.5 h-8 text-[13px] text-zinc-700 hover:bg-zinc-50 cursor-pointer text-left"
						>
							<span
								className={`inline-flex items-center ${optCls} rounded-full px-2 h-[18px] text-[11px] font-medium leading-none`}
							>
								{o.label}
							</span>
							{o.value === value && <Check className="h-3.5 w-3.5 text-zinc-900 shrink-0" />}
						</button>
					);
				})}
			</PortalMenu>
		</>
	);
}

// Single source of truth for relevance statuses: dropdown label, chip classes
// (tailwind) and the row's left-border hex. Mirrors backend job.py default
// relevanceStatus="unscreened".
export const RELEVANCE_META = {
	unscreened: { label: "Unscreened", chip: "bg-zinc-100 text-zinc-500", hex: "#e4e4e7" },
	good_fit: { label: "Good fit", chip: "bg-emerald-100 text-emerald-700", hex: "#10b981" },
	maybe: { label: "Maybe", chip: "bg-amber-100 text-amber-700", hex: "#f59e0b" },
	irrelevant: { label: "No fit", chip: "bg-red-100 text-red-700", hex: "#ef4444" },
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
	new: "bg-zinc-100 text-zinc-600",
	applied: "bg-blue-100 text-blue-700",
	interview: "bg-violet-100 text-violet-700",
	offer: "bg-emerald-100 text-emerald-700",
	rejected: "bg-red-100 text-red-700",
};
