import { cn } from "utils/cn";

export function EmptyState({ icon: Icon, title, description, action, className }) {
	return (
		<div className={cn("flex flex-col items-center justify-center text-center py-16 px-4", className)}>
			{Icon && (
				<div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-4">
					<Icon className="h-5 w-5 text-ink-3" aria-hidden="true" />
				</div>
			)}
			{title && <p className="text-body font-medium text-ink">{title}</p>}
			{description && <p className="text-label text-ink-2 mt-1 max-w-xs">{description}</p>}
			{action && <div className="mt-4">{action}</div>}
		</div>
	);
}
