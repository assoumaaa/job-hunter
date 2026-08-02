import { Briefcase, Plus } from "lucide-react";

import BulletRow from "./BulletRow";
import { Field, ListItem, Section } from "./FormWidgets";
import { newBullet } from "./cvData";
import { Button } from "components/ui/button";

function BulletList({ bullets, onChange }) {
	const updateAt = (i, next) => onChange(bullets.map((b, j) => (j === i ? next : b)));
	const removeAt = (i) => onChange(bullets.filter((_, j) => j !== i));
	const move = (i, dir) => {
		const j = i + dir;
		if (j < 0 || j >= bullets.length) return;
		const next = bullets.slice();
		[next[i], next[j]] = [next[j], next[i]];
		onChange(next);
	};

	return (
		<div className="space-y-2" role="group" aria-label="Bullets">
			<span className="text-micro font-medium text-ink-2">Bullets</span>
			<div className="space-y-2">
				{bullets.map((b, i) => (
					<BulletRow
						key={b._id ?? i}
						bullet={b}
						isFirst={i === 0}
						isLast={i === bullets.length - 1}
						onChange={(nb) => updateAt(i, nb)}
						onRemove={() => removeAt(i)}
						onMove={(dir) => move(i, dir)}
					/>
				))}
			</div>
			<button
				type="button"
				onClick={() => onChange([...bullets, newBullet()])}
				className="mt-1 flex items-center gap-1 text-micro font-medium text-ink-2 transition-colors hover:text-ink cursor-pointer focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1"
			>
				<Plus className="h-3 w-3" aria-hidden="true" /> Add bullet
			</button>
		</div>
	);
}

export default function ExperienceSection({ experience, onChange }) {
	const updateJob = (i, patch) => onChange(experience.map((e, j) => (j === i ? { ...e, ...patch } : e)));
	const removeJob = (i) => onChange(experience.filter((_, j) => j !== i));
	const addJob = () =>
		onChange([...experience, { company: "", title: "", period: "", location: "", bullets: [newBullet()] }]);

	return (
		<Section bare id="experience" icon={Briefcase} title="Work experience">

			{experience.length === 0 && (
				<p className="text-label text-ink-3 py-1">No roles yet. Add your first position below.</p>
			)}
			{experience.map((exp, i) => (
				<ListItem key={i} onRemove={() => removeJob(i)}>
					<div className="grid grid-cols-2 gap-2.5">
						<Field label="Company" value={exp.company} onChange={(v) => updateJob(i, { company: v })} placeholder="e.g. Datadog" />
						<Field label="Job title" value={exp.title} onChange={(v) => updateJob(i, { title: v })} placeholder="Senior Engineer" />
						<Field label="Period" value={exp.period} onChange={(v) => updateJob(i, { period: v })} placeholder="Jan 2022 - Present" />
						<Field label="Location" value={exp.location} onChange={(v) => updateJob(i, { location: v })} placeholder="Remote" />
					</div>
					<BulletList bullets={exp.bullets || []} onChange={(b) => updateJob(i, { bullets: b })} />
				</ListItem>
			))}
			<Button variant="outline" size="sm" onClick={addJob}>
				<Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add experience
			</Button>
		</Section>
	);
}
