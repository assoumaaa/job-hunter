import BrandMark from "./BrandMark";

export default function FullPageProgress() {
	return (
		<div className="flex flex-col items-center justify-center h-screen gap-4 bg-zinc-50">
			<div className="h-10 w-10 rounded-xl bg-gradient-to-br from-zinc-900 to-zinc-700 flex items-center justify-center shadow-sm">
				<BrandMark className="h-5 w-5 text-white" />
			</div>
			<div className="h-1 w-32 rounded-full bg-zinc-200 overflow-hidden">
				<div className="h-full w-1/3 bg-zinc-900 animate-shimmer rounded-full" />
			</div>
		</div>
	);
}
