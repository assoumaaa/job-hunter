import { ArrowDown, ArrowUp, GripVertical, Pencil, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

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
			aria-label={title}
			className={cn(
				"h-6 w-6 rounded-md flex items-center justify-center transition-colors",
				"text-ink-3 hover:bg-muted hover:text-ink",
				"focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1",
				"disabled:opacity-30 disabled:pointer-events-none",
				danger && "hover:bg-red-600/10 hover:text-red-600",
			)}
		>
			<Icon className="h-3.5 w-3.5" aria-hidden="true" />
		</button>
	);
}

// One work-experience bullet. Text is an auto-growing textarea; below it a tag
// row toggles the bullet between "Always" (in every CV) and "Conditional"
// (an accent "If job asks" pill). When conditional, an accent-tinted inline
// panel holds the plain-English condition.
export default function BulletRow({ bullet, isFirst, isLast, onChange, onRemove, onMove }) {
	const condMode = isConditionMode(bullet);
	const condRef = useRef(null);
	const wasCond = useRef(condMode);
	const condId = useId();

	// Focus the condition editor the moment it opens.
	useEffect(() => {
		if (condMode && !wasCond.current) condRef.current?.focus();
		wasCond.current = condMode;
	}, [condMode]);

	const toggleCondition = () =>
		onChange({ ...bullet, condition: condMode ? null : "" });

	return (
		<div className="group/bullet relative rounded-xl border border-line bg-surface p-3.5 transition-colors hover:border-line-strong hover:shadow-raised">
			<div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/bullet:opacity-100 focus-within:opacity-100">
				<IconBtn icon={ArrowUp} onClick={() => onMove(-1)} disabled={isFirst} title="Move up" />
				<IconBtn icon={ArrowDown} onClick={() => onMove(1)} disabled={isLast} title="Move down" />
				<IconBtn icon={X} onClick={onRemove} danger title="Remove bullet" />
			</div>

			<div className="flex gap-2.5">
				<GripVertical className="mt-2 h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />
				<div className="min-w-0 flex-1 space-y-2.5">
					<AutoTextarea
						value={bullet.text}
						onChange={(e) => onChange({ ...bullet, text: e.target.value })}
						placeholder="Describe an achievement or responsibility…"
						aria-label="Bullet text"
						className="pr-16"
					/>

					<div className="flex items-center gap-2">
						{condMode ? (
							<button
								type="button"
								onClick={toggleCondition}
								aria-pressed="true"
								className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-micro font-semibold text-accent-text transition-colors hover:opacity-80 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1"
								title="Make this bullet always-on"
							>
								If job asks <Pencil className="h-3 w-3" aria-hidden="true" />
							</button>
						) : (
							<button
								type="button"
								onClick={toggleCondition}
								aria-pressed="false"
								className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-micro font-medium text-ink-2 transition-colors hover:bg-hovertint hover:text-ink focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1"
								title="Only include this bullet when a job matches a condition"
							>
								Always
							</button>
						)}
					</div>

					{condMode && (
						<div className="rounded-lg border-l-2 border-l-accent bg-accent-soft/60 px-3 py-2.5">
							<label
								htmlFor={condId}
								className="mb-1.5 block text-micro font-semibold uppercase tracking-wide text-accent-text"
							>
								Show when…
							</label>
							<AutoTextarea
								ref={condRef}
								id={condId}
								value={bullet.condition ?? ""}
								onChange={(e) => onChange({ ...bullet, condition: e.target.value })}
								placeholder="e.g. the job mentions Kubernetes or container orchestration"
								className="bg-surface/70 text-body"
							/>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
