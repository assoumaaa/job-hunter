import { Badge } from "components/ui/badge";

export default function AtsScoreCell({ value }) {
	if (value == null) return <span className="text-zinc-300 text-xs">—</span>;
	const tone = value >= 85 ? "success" : value >= 70 ? "warning" : "danger";
	return (
		<Badge
			tone={tone}
			className="justify-center min-w-[34px] h-[22px] rounded-md px-0 text-[11.5px] font-semibold tabular-nums"
		>
			{value}
		</Badge>
	);
}
