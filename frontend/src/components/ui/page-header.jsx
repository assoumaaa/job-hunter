import { cn } from "utils/cn";

export function PageHeader({ title, subtitle, actions, badge, className }) {
	return (
		<div
			className={cn(
				"flex items-center gap-3 px-6 h-14 border-b border-zinc-100 shrink-0 bg-white/60 backdrop-blur-sm",
				className,
			)}
		>
			<h1 className="text-[16px] font-semibold text-zinc-900 tracking-tight">{title}</h1>
			{badge != null && (
				<span className="text-[12px] font-medium text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded-md tabular-nums">
					{badge}
				</span>
			)}
			{subtitle && <span className="text-[13px] text-zinc-400">{subtitle}</span>}
			{actions && <div className="flex items-center gap-2 ml-auto">{actions}</div>}
		</div>
	);
}
