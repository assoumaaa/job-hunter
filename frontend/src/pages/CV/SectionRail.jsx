import { cn } from "utils/cn";

// Slim left rail of the CV sections. Clicking one scrolls the editor to it; the
// section currently scrolled into view is highlighted.
export default function SectionRail({ sections, activeId, onJump }) {
	return (
		<nav className="hidden md:flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-zinc-100 p-3">
			<div className="px-2.5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400">
				Sections
			</div>
			{sections.map((s) => {
				const active = s.id === activeId;
				const Icon = s.icon;
				return (
					<button
						key={s.id}
						onClick={() => onJump(s.id)}
						className={cn(
							"group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors cursor-pointer",
							active
								? "bg-zinc-100 font-medium text-zinc-900"
								: "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800",
						)}
					>
						<span
							className={cn(
								"absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-violet-500 transition-opacity",
								active ? "opacity-100" : "opacity-0",
							)}
						/>
						<Icon className={cn("h-4 w-4 shrink-0", active ? "text-violet-500" : "text-zinc-400")} />
						<span className="truncate">{s.label}</span>
						{s.count > 0 && (
							<span
								className={cn(
									"ml-auto rounded-full px-1.5 text-[10.5px] tabular-nums",
									active ? "bg-white text-zinc-500" : "bg-zinc-100 text-zinc-400",
								)}
							>
								{s.count}
							</span>
						)}
					</button>
				);
			})}
		</nav>
	);
}
