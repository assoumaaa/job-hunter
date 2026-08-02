import { Badge } from "components/ui/badge";

export default function AtsScoreCell({ value }) {
	if (value == null) return <span className="text-ink-3 text-label">-</span>;
	const tone = value >= 85 ? "ok" : value >= 70 ? "warn" : "bad";
	return (
		<Badge
			tone={tone}
			className="justify-center min-w-[34px] h-[22px] rounded-md px-0 text-micro font-semibold font-mono tabular-nums"
		>
			{value}
		</Badge>
	);
}
