import { cn } from "utils/cn";

export function EmptyState({ icon: Icon, title, description, action, className }) {
	return (
		<div className={cn("flex flex-col items-center justify-center text-center py-16 px-4", className)}>
			{Icon && (
				<div className="h-12 w-12 rounded-2xl bg-zinc-100 flex items-center justify-center mb-4">
					<Icon className="h-5 w-5 text-zinc-400" />
				</div>
			)}
			{title && <p className="text-sm font-medium text-zinc-800">{title}</p>}
			{description && <p className="text-xs text-zinc-500 mt-1 max-w-xs">{description}</p>}
			{action && <div className="mt-4">{action}</div>}
		</div>
	);
}
