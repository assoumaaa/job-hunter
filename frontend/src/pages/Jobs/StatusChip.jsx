import { ChevronDown } from "lucide-react";

export default function StatusChip({ value, options, colorMap, onChange }) {
	const cls = colorMap[value] ?? colorMap.__default ?? "bg-zinc-100 text-zinc-600";
	return (
		<div className={`relative inline-flex items-center ${cls} rounded-full pl-2.5 pr-6 h-[22px] text-[11px] font-medium leading-none cursor-pointer hover:opacity-90 transition-opacity`}>
			<select
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
			>
				{options.map((o) => (
					<option key={o.value} value={o.value}>{o.label}</option>
				))}
			</select>
			<span>{options.find(o => o.value === value)?.label ?? value}</span>
			<ChevronDown className="absolute right-1.5 h-3 w-3 opacity-50" />
		</div>
	);
}

export const RELEVANCE_OPTIONS = [
	{ value: "unscreened", label: "Unscreened" },
	{ value: "good_fit",   label: "Good fit"   },
	{ value: "maybe",      label: "Maybe"      },
	{ value: "irrelevant", label: "No fit"     },
];
export const RELEVANCE_COLORS = {
	unscreened: "bg-zinc-100 text-zinc-500",
	good_fit:   "bg-emerald-100 text-emerald-700",
	maybe:      "bg-amber-100 text-amber-700",
	irrelevant: "bg-red-100 text-red-700",
};

export const APP_OPTIONS = [
	{ value: "new",       label: "New"       },
	{ value: "applied",   label: "Applied"   },
	{ value: "interview", label: "Interview" },
	{ value: "offer",     label: "Offer"     },
	{ value: "rejected",  label: "Rejected"  },
];
export const APP_COLORS = {
	new:       "bg-zinc-100 text-zinc-600",
	applied:   "bg-blue-100 text-blue-700",
	interview: "bg-violet-100 text-violet-700",
	offer:     "bg-emerald-100 text-emerald-700",
	rejected:  "bg-red-100 text-red-700",
};
