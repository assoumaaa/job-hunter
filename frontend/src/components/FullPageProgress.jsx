import BrandMark from "./BrandMark";

export default function FullPageProgress() {
	return (
		<div
			role="status"
			aria-label="Loading"
			className="flex flex-col items-center justify-center h-screen gap-4 bg-canvas"
		>
			<div className="h-10 w-10 rounded-xl bg-accent-solid flex items-center justify-center shadow-raised">
				<BrandMark className="h-5 w-5 text-white" />
			</div>
			<div className="h-1 w-32 rounded-full bg-muted overflow-hidden">
				<div className="h-full w-1/3 bg-ink animate-shimmer rounded-full" />
			</div>
		</div>
	);
}
