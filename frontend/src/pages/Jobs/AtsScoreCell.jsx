import { Badge } from "components/ui/badge";
import { atsTone } from "models/job";

export default function AtsScoreCell({ value }) {
	if (value == null) return <span className="text-ink-3 text-label">-</span>;
	return (
		<Badge
			tone={atsTone(value)}
			className="justify-center min-w-[34px] h-[22px] rounded-md px-0 text-micro font-semibold font-mono tabular-nums"
		>
			{value}
		</Badge>
	);
}
