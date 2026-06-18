import { cn } from "utils/cn";

const tones = {
	neutral: "bg-zinc-100 text-zinc-700 ring-zinc-200/60",
	muted: "bg-zinc-50 text-zinc-500 ring-zinc-200/50",
	success: "bg-emerald-50 text-emerald-700 ring-emerald-200/60",
	warning: "bg-amber-50 text-amber-700 ring-amber-200/60",
	danger: "bg-red-50 text-red-700 ring-red-200/60",
	info: "bg-blue-50 text-blue-700 ring-blue-200/60",
	accent: "bg-indigo-50 text-indigo-700 ring-indigo-200/60",
	violet: "bg-violet-50 text-violet-700 ring-violet-200/60",
};

export function Badge({ tone = "neutral", className, children, dot = false, ...props }) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
				tones[tone] ?? tones.neutral,
				className,
			)}
			{...props}
		>
			{dot && <span className={cn("h-1.5 w-1.5 rounded-full", dotColor(tone))} />}
			{children}
		</span>
	);
}

function dotColor(tone) {
	const map = {
		neutral: "bg-zinc-400",
		muted: "bg-zinc-300",
		success: "bg-emerald-500",
		warning: "bg-amber-500",
		danger: "bg-red-500",
		info: "bg-blue-500",
		accent: "bg-indigo-500",
		violet: "bg-violet-500",
	};
	return map[tone] ?? map.neutral;
}
