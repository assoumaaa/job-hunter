import { cn } from "utils/cn";

const tones = {
	neutral: "bg-st-neutral text-st-neutral-fg",
	muted: "bg-muted text-ink-3",
	ok: "bg-st-ok text-st-ok-fg",
	warn: "bg-st-warn text-st-warn-fg",
	bad: "bg-st-bad text-st-bad-fg",
	info: "bg-st-info text-st-info-fg",
	accent: "bg-accent-soft text-accent-text",
};

const dotColors = {
	neutral: "bg-ink-3",
	muted: "bg-ink-3",
	ok: "bg-(--st-ok-solid)",
	warn: "bg-(--st-warn-solid)",
	bad: "bg-(--st-bad-solid)",
	info: "bg-(--st-info-solid)",
	accent: "bg-accent",
};

export function Badge({ tone = "neutral", className, children, dot = false, ...props }) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-micro font-medium",
				tones[tone] ?? tones.neutral,
				className,
			)}
			{...props}
		>
			{dot && <span className={cn("h-1.5 w-1.5 rounded-full", dotColors[tone] ?? dotColors.neutral)} />}
			{children}
		</span>
	);
}
