// Loading placeholders — swap in while data fetches.

export function Skeleton({ className = "" }) {
	return <div className={`motion-safe:animate-pulse rounded-md bg-muted ${className}`} aria-hidden="true" />;
}

export function TableSkeleton({ rows = 10, className = "" }) {
	return (
		<div className={`flex flex-col ${className}`} aria-hidden="true">
			{Array.from({ length: rows }).map((_, i) => (
				<div key={i} className="flex items-center gap-4 px-6 h-[68px] border-b border-line">
					<Skeleton className="h-4 w-4" />
					<Skeleton className="h-4 flex-1 max-w-[220px]" />
					<Skeleton className="h-4 w-28" />
					<Skeleton className="h-4 w-20" />
					<Skeleton className="h-4 w-10" />
					<Skeleton className="h-5 w-24" />
				</div>
			))}
		</div>
	);
}

export function CardSkeleton({ count = 3, className = "" }) {
	return (
		<div className={`grid gap-4 ${className}`} aria-hidden="true">
			{Array.from({ length: count }).map((_, i) => (
				<div key={i} className="rounded-xl border border-line p-5 flex flex-col gap-3">
					<Skeleton className="h-4 w-1/3" />
					<Skeleton className="h-8 w-1/2" />
					<Skeleton className="h-3 w-2/3" />
				</div>
			))}
		</div>
	);
}

export function FormSkeleton({ fields = 5, className = "" }) {
	return (
		<div className={`flex flex-col gap-6 ${className}`} aria-hidden="true">
			{Array.from({ length: fields }).map((_, i) => (
				<div key={i} className="flex flex-col gap-2">
					<Skeleton className="h-3 w-24" />
					<Skeleton className="h-9 w-full max-w-md" />
				</div>
			))}
		</div>
	);
}
