import { ArrowDown, ArrowUp, GripVertical, Pencil, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { isConditionMode } from "./cvData";
import { AutoTextarea } from "./FormWidgets";
import { cn } from "utils/cn";

function IconBtn({ icon: Icon, onClick, disabled, danger, title }) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			title={title}
			className={cn(
				"h-6 w-6 rounded-md flex items-center justify-center transition-colors",
				"text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700",
				"disabled:opacity-30 disabled:pointer-events-none",
				danger && "hover:bg-red-50 hover:text-red-600",
			)}
		>
			<Icon className="h-3.5 w-3.5" />
		</button>
	);
}

// One work-experience bullet. Text is an auto-growing textarea; below it a tag
// row toggles the bullet between "Always" (in every CV) and "Conditional"
// (a purple "If job asks" pill). When conditional, a violet-accented inline
// panel holds the plain-English condition.
export default function BulletRow({ bullet, isFirst, isLast, onChange, onRemove, onMove }) {
	const condMode = isConditionMode(bullet);
	const condRef = useRef(null);
	const wasCond = useRef(condMode);

	// Focus the condition editor the moment it opens.
	useEffect(() => {
		if (condMode && !wasCond.current) condRef.current?.focus();
		wasCond.current = condMode;
	}, [condMode]);

	const toggleCondition = () =>
		onChange({ ...bullet, condition: condMode ? null : "" });

	return (
		<div className="group/bullet relative rounded-xl border border-zinc-200/80 bg-white p-3.5 transition-colors hover:border-zinc-300 hover:shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
			<div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/bullet:opacity-100 focus-within:opacity-100">
				<IconBtn icon={ArrowUp} onClick={() => onMove(-1)} disabled={isFirst} title="Move up" />
				<IconBtn icon={ArrowDown} onClick={() => onMove(1)} disabled={isLast} title="Move down" />
				<IconBtn icon={X} onClick={onRemove} danger title="Remove bullet" />
			</div>

			<div className="flex gap-2.5">
				<GripVertical className="mt-2 h-3.5 w-3.5 shrink-0 text-zinc-300" aria-hidden="true" />
				<div className="min-w-0 flex-1 space-y-2.5">
					<AutoTextarea
						value={bullet.text}
						onChange={(e) => onChange({ ...bullet, text: e.target.value })}
						placeholder="Describe an achievement or responsibility…"
						className="pr-16"
					/>

					<div className="flex items-center gap-2">
						{condMode ? (
							<button
								type="button"
								onClick={toggleCondition}
								className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-700 transition-colors hover:bg-violet-200/80"
								title="Make this bullet always-on"
							>
								If job asks <Pencil className="h-3 w-3" />
							</button>
						) : (
							<button
								type="button"
								onClick={toggleCondition}
								className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-zinc-200/70 hover:text-zinc-700"
								title="Only include this bullet when a job matches a condition"
							>
								Always
							</button>
						)}
					</div>

					{condMode && (
						<div className="rounded-lg border-l-2 border-l-[#a78bfa] bg-[#faf5ff] px-3 py-2.5">
							<label className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-wide text-[#6d28d9]">
								Show when…
							</label>
							<AutoTextarea
								ref={condRef}
								value={bullet.condition ?? ""}
								onChange={(e) => onChange({ ...bullet, condition: e.target.value })}
								placeholder="e.g. the job mentions Kubernetes or container orchestration"
								className="border-violet-200/70 bg-white/70 text-[13px] text-[#6d28d9] placeholder:text-violet-300/90 focus:border-violet-300 focus:ring-violet-500/10"
							/>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
