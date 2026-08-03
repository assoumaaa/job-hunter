import { Minus, Plus, X } from "lucide-react";
import { useState } from "react";

import { Button } from "components/ui/button";
import { Input } from "components/ui/input";

// ── Notice period: "Immediately", or an amount + unit (e.g. "2 weeks") ───────

const UNITS = [
	{ value: "day", label: "days" },
	{ value: "week", label: "weeks" },
	{ value: "month", label: "months" },
];

function parseNotice(value) {
	if (value === "Immediately") return { immediate: true, amount: 1, unit: "month" };
	const m = (value || "").match(/^(\d+)\s+(day|week|month)/i);
	if (m) return { immediate: false, amount: Math.min(12, Math.max(1, parseInt(m[1], 10))), unit: m[2].toLowerCase() };
	return { immediate: false, amount: 1, unit: "month" };
}

const formatNotice = (amount, unit) => `${amount} ${unit}${amount === 1 ? "" : "s"}`;

export function NoticePeriodField({ value, onChange }) {
	const { immediate, amount, unit } = parseNotice(value);
	const setInterval = (a, u) => onChange(formatNotice(Math.min(12, Math.max(1, a)), u));

	return (
		<div className="flex items-center gap-2">
			<button
				type="button"
				aria-pressed={immediate}
				onClick={() => onChange("Immediately")}
				className={`px-3 h-9 rounded-lg text-label font-medium border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 ${
					immediate
						? "bg-ink text-canvas border-transparent"
						: "bg-surface border-line text-ink-2 hover:border-line-strong hover:text-ink"
				}`}
			>
				Immediately
			</button>

			<span className="text-micro text-ink-3">or</span>

			<div
				className={`inline-flex items-center rounded-lg border transition-colors ${
					immediate ? "border-line opacity-50" : "border-line-strong"
				}`}
			>
				<button
					type="button"
					aria-label="Decrease amount"
					onClick={() => setInterval(amount - 1, unit)}
					disabled={!immediate && amount <= 1}
					className="h-9 w-8 flex items-center justify-center text-ink-2 hover:text-ink disabled:opacity-30 disabled:pointer-events-none cursor-pointer rounded-l-lg focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-1"
				>
					<Minus className="h-3.5 w-3.5" aria-hidden="true" />
				</button>
				<span className="w-7 text-center text-body font-mono tabular-nums text-ink" aria-live="polite">
					{amount}
				</span>
				<button
					type="button"
					aria-label="Increase amount"
					onClick={() => setInterval(amount + 1, unit)}
					disabled={!immediate && amount >= 12}
					className="h-9 w-8 flex items-center justify-center text-ink-2 hover:text-ink disabled:opacity-30 disabled:pointer-events-none cursor-pointer focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-1"
				>
					<Plus className="h-3.5 w-3.5" aria-hidden="true" />
				</button>
				<select
					aria-label="Notice period unit"
					value={unit}
					onChange={(e) => setInterval(amount, e.target.value)}
					className="h-9 pl-1.5 pr-2 bg-transparent text-body text-ink border-l border-line cursor-pointer focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-1 rounded-r-lg"
				>
					{UNITS.map((u) => (
						<option key={u.value} value={u.value}>{u.label}</option>
					))}
				</select>
			</div>
		</div>
	);
}

// ── Languages: editable chips (inline level) + one compact add row ───────────

const LEVELS = ["Basic", "Conversational", "Fluent", "Native"];
const COMMON = ["English", "Arabic", "French", "German", "Spanish", "Mandarin", "Portuguese", "Dutch", "Italian", "Russian", "Hindi", "Japanese"];

export function LanguagesField({ value, onChange }) {
	const [name, setName] = useState("");
	const [level, setLevel] = useState("Fluent");

	const add = () => {
		const t = name.trim();
		if (!t || value.some((l) => l.name.toLowerCase() === t.toLowerCase())) return;
		onChange([...value, { name: t, level }]);
		setName("");
	};
	const setLevelAt = (i, lvl) => onChange(value.map((l, j) => (j === i ? { ...l, level: lvl } : l)));
	const removeAt = (i) => onChange(value.filter((_, j) => j !== i));

	return (
		<div className="flex flex-col gap-3">
			{value.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{value.map((l, i) => (
						<div key={l.name} className="inline-flex items-center h-8 rounded-lg border border-line bg-surface pl-2.5 pr-1 gap-1">
							<span className="text-label font-medium text-ink">{l.name}</span>
							<select
								aria-label={`${l.name} level`}
								value={l.level}
								onChange={(e) => setLevelAt(i, e.target.value)}
								className="h-7 bg-transparent text-label text-ink-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-1 rounded"
							>
								{LEVELS.map((lv) => (
									<option key={lv} value={lv}>{lv}</option>
								))}
							</select>
							<button
								type="button"
								onClick={() => removeAt(i)}
								aria-label={`Remove ${l.name}`}
								className="h-6 w-6 rounded-md flex items-center justify-center text-ink-3 hover:text-red-500 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1"
							>
								<X className="h-3 w-3" aria-hidden="true" />
							</button>
						</div>
					))}
				</div>
			)}

			<div className="flex gap-2">
				<div className="flex-1 min-w-0">
					<Input
						value={name}
						list="common-languages"
						aria-label="Add a language"
						placeholder="Add a language"
						onChange={(e) => setName(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
					/>
					<datalist id="common-languages">
						{COMMON.filter((c) => !value.some((l) => l.name === c)).map((c) => (
							<option key={c} value={c} />
						))}
					</datalist>
				</div>
				<select
					aria-label="Level for the new language"
					value={level}
					onChange={(e) => setLevel(e.target.value)}
					className="h-9 px-2.5 rounded-lg border border-line bg-surface text-body text-ink cursor-pointer hover:border-line-strong focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-0"
				>
					{LEVELS.map((lv) => (
						<option key={lv} value={lv}>{lv}</option>
					))}
				</select>
				<Button variant="outline" size="sm" onClick={add} disabled={!name.trim()}>
					Add
				</Button>
			</div>
		</div>
	);
}
