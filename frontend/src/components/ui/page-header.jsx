import { cn } from "utils/cn";

export function PageHeader({ title, subtitle, actions, badge, className }) {
	return (
		<div
			className={cn(
				"flex items-center gap-3 px-6 h-14 border-b border-line shrink-0 bg-surface/60 backdrop-blur-sm",
				className,
			)}
		>
			<h1 className="text-title font-semibold text-ink tracking-tight">{title}</h1>
			{badge != null && (
				<span className="text-label font-medium text-ink-2 bg-muted px-1.5 py-0.5 rounded-md font-mono tabular-nums">
					{badge}
				</span>
			)}
			{subtitle && <span className="text-body text-ink-3">{subtitle}</span>}
			{actions && <div className="flex items-center gap-2 ml-auto">{actions}</div>}
		</div>
	);
}
