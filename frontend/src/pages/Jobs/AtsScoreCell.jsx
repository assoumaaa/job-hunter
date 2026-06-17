export default function AtsScoreCell({ value }) {
	if (value == null) return <span className="text-zinc-300 text-xs">—</span>;
	const tone = value >= 85
		? "bg-emerald-50 text-emerald-700 ring-emerald-200/60"
		: value >= 70
		? "bg-amber-50 text-amber-700 ring-amber-200/60"
		: "bg-red-50 text-red-700 ring-red-200/60";
	return (
		<span className={`inline-flex items-center justify-center min-w-[34px] h-[22px] rounded-md text-[11.5px] font-semibold tabular-nums ring-1 ring-inset ${tone}`}>
			{value}
		</span>
	);
}
