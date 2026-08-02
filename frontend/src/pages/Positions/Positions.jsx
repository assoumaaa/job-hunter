import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Plus, Save, X } from "lucide-react";

import { Button } from "components/ui/button";
import { CardSkeleton } from "components/ui/skeleton";
import { Input } from "components/ui/input";
import { PageHeader } from "components/ui/page-header";
import { useCallApi } from "services";
import { COUNTRIES, COUNTRY_REGIONS } from "models";

const SUGGESTED = ["Backend Engineer", "Frontend Engineer", "Full Stack Engineer", "Software Engineer", "Solution Engineer", "DevOps Engineer"];
const JOB_TYPES = [
	{ value: "fulltime",   label: "Full-time"  },
	{ value: "contract",   label: "Contract"   },
	{ value: "parttime",   label: "Part-time"  },
	{ value: "internship", label: "Internship" },
];

const pillCls = (active) =>
	`px-3 h-7 rounded-full text-label font-medium border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 ${
		active
			? "bg-ink text-canvas border-transparent"
			: "bg-surface border-line text-ink-2 hover:border-line-strong hover:text-ink"
	}`;

function SectionCard({ title, description, action, children, padding = "p-5" }) {
	return (
		<div className="bg-surface border border-line rounded-xl shadow-raised overflow-hidden">
			{(title || action) && (
				<div className="px-5 py-4 border-b border-line flex items-center justify-between gap-4">
					<div>
						{title && <p className="text-body font-semibold text-ink">{title}</p>}
						{description && <p className="text-micro text-ink-3 mt-0.5">{description}</p>}
					</div>
					{action}
				</div>
			)}
			<div className={padding}>{children}</div>
		</div>
	);
}

export default function Positions() {
	const [positions, setPositions] = useState([]);
	const [input, setInput] = useState("");
	const [selectedCountries, setSelectedCountries] = useState([]);
	const [selectedJobTypes, setSelectedJobTypes] = useState(["fulltime"]);
	const [keywords, setKeywords] = useState([]);
	const [keywordInput, setKeywordInput] = useState("");
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [firstLoad, setFirstLoad] = useState(true);

	const kwRef = useRef(null);
	const [callApi] = useCallApi();

	const addPosition = async (label) => {
		if (!label.trim() || positions.find((p) => p.label === label)) return;
		const pos = await callApi("/positions", { method: "post", json: { label } });
		if (pos) {
			setPositions((prev) => [...prev, pos]);
			setInput("");
		}
	};

	const removePosition = async (id) => {
		await callApi("/positions", { method: "delete", json: { id } });
		setPositions((prev) => prev.filter((p) => p.id !== id));
	};

	const toggleCountry = (code) =>
		setSelectedCountries((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

	const toggleJobType = (value) =>
		setSelectedJobTypes((prev) =>
			prev.includes(value) && prev.length > 1 ? prev.filter((t) => t !== value) : prev.includes(value) ? prev : [...prev, value],
		);

	const addKeyword = (raw) => {
		const t = raw.trim().replace(/,+$/, "");
		if (!t || keywords.includes(t)) return;
		setKeywords((prev) => [...prev, t]);
		setKeywordInput("");
	};

	useEffect(() => {
		callApi("/positions", {
			onSuccess: (data) => {
				setPositions(data);
				setFirstLoad(false);
			},
			onError: () => setFirstLoad(false),
		});
		callApi("/job-settings", {
			onSuccess: (d) => {
				setSelectedCountries(d.preferredLocations ? JSON.parse(d.preferredLocations) : []);
				setSelectedJobTypes(d.jobTypes ? JSON.parse(d.jobTypes) : ["fulltime"]);
				setKeywords(d.keywords ? JSON.parse(d.keywords) : []);
			},
		});
	}, []);

	const saveSettings = async () => {
		setSaving(true);
		await callApi("/job-settings", {
			method: "post",
			json: {
				preferredLocations: JSON.stringify(selectedCountries),
				jobTypes: JSON.stringify(selectedJobTypes),
				keywords: JSON.stringify(keywords),
			},
			success: "Settings saved",
		});
		setSaved(true);
		setTimeout(() => setSaved(false), 2000);
		setSaving(false);
	};

	return (
		<div className="flex flex-col h-full overflow-hidden">
			<span role="status" className="sr-only">
				{saving ? "Saving" : saved ? "Saved" : ""}
			</span>
			<PageHeader
				title="Targeting"
				subtitle="What to search for and where"
				actions={
					<Button variant="primary" size="sm" onClick={saveSettings} disabled={saving}>
						{saved ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Save className="h-3.5 w-3.5" aria-hidden="true" />}
						{saved ? "Saved" : saving ? "Saving…" : "Save"}
					</Button>
				}
			/>

			<div className="flex-1 overflow-y-auto">
				<div className="max-w-[860px] mx-auto px-8 py-8 flex flex-col gap-5">

					{firstLoad ? (
						<CardSkeleton count={4} />
					) : (
					<>
					<SectionCard title="Job titles" description="Roles we'll search for on every sync">
						{positions.length > 0 && (
							<div className="flex flex-wrap gap-1.5 mb-3">
								{positions.map((p) => (
									<div key={p.id} className="inline-flex items-center gap-1 bg-muted rounded-full pl-3 pr-1 py-1 text-label font-medium text-ink">
										{p.label}
										<button
											type="button"
											onClick={() => removePosition(p.id)}
											aria-label={`Remove ${p.label}`}
											className="h-5 w-5 rounded-full flex items-center justify-center text-ink-3 hover:text-red-500 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1"
										>
											<X className="h-3 w-3" aria-hidden="true" />
										</button>
									</div>
								))}
							</div>
						)}
						<div className="flex gap-2">
							<Input
								placeholder="e.g. Platform Engineer"
								aria-label="Add a job title"
								value={input}
								onChange={(e) => setInput(e.target.value)}
								onKeyDown={(e) => e.key === "Enter" && addPosition(input)}
							/>
							<Button variant="outline" onClick={() => addPosition(input)}>
								<Plus className="h-4 w-4" aria-hidden="true" /> Add
							</Button>
						</div>
						<div className="flex flex-wrap gap-1.5 pt-4 mt-4 border-t border-line">
							<span className="text-micro font-medium text-ink-3 uppercase tracking-wide self-center mr-1">Suggested</span>
							{SUGGESTED.map((s) => (
								<button
									key={s}
									type="button"
									onClick={() => addPosition(s)}
									disabled={!!positions.find((p) => p.label === s)}
									className="text-label px-3 h-7 rounded-full border border-line text-ink-2 hover:bg-hovertint hover:border-line-strong hover:text-ink disabled:opacity-40 disabled:cursor-default cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
								>
									+ {s}
								</button>
							))}
						</div>
					</SectionCard>

					<SectionCard title="Job type" description="Employment types to include">
						<div className="flex gap-1.5 flex-wrap" role="group" aria-label="Job types">
							{JOB_TYPES.map(({ value, label }) => (
								<button
									key={value}
									type="button"
									aria-pressed={selectedJobTypes.includes(value)}
									onClick={() => toggleJobType(value)}
									className={pillCls(selectedJobTypes.includes(value))}
								>
									{label}
								</button>
							))}
						</div>
					</SectionCard>

					<SectionCard title="Countries" description="Jobs fetched from selected countries">
						{selectedCountries.length > 0 && (
							<div className="flex flex-wrap gap-1.5 mb-3">
								{selectedCountries.map((code) => {
									const c = COUNTRIES.find((x) => x.code === code);
									return (
										<div key={code} className="inline-flex items-center gap-1 bg-muted text-ink rounded-full pl-3 pr-1 py-1 text-label font-medium">
											{c?.name ?? code}
											<button
												type="button"
												onClick={() => toggleCountry(code)}
												aria-label={`Remove ${c?.name ?? code}`}
												className="h-5 w-5 rounded-full flex items-center justify-center text-ink-3 hover:text-red-500 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1"
											>
												<X className="h-3 w-3" aria-hidden="true" />
											</button>
										</div>
									);
								})}
							</div>
						)}
						<select
							aria-label="Add country"
							className="h-9 rounded-lg border border-line bg-surface px-3 text-body text-ink max-w-xs cursor-pointer hover:border-line-strong focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-0"
							value=""
							onChange={(e) => { if (e.target.value) toggleCountry(e.target.value); }}
						>
							<option value="">+ Add country…</option>
							{COUNTRY_REGIONS.map(({ label, codes }) => (
								<optgroup key={label} label={label}>
									{codes
										.map((code) => COUNTRIES.find((c) => c.code === code))
										.filter((c) => c && !selectedCountries.includes(c.code))
										.map((c) => (
											<option key={c.code} value={c.code}>{c.name}</option>
										))}
								</optgroup>
							))}
						</select>
					</SectionCard>

					<SectionCard title="Keywords" description="Skills and technologies matched during screening">
						{keywords.length > 0 && (
							<div className="flex flex-wrap gap-1.5 mb-3">
								{keywords.map((kw) => (
									<div key={kw} className="inline-flex items-center gap-1 bg-accent-soft text-accent-text rounded-full pl-3 pr-1 py-1 text-label font-medium">
										{kw}
										<button
											type="button"
											onClick={() => setKeywords((prev) => prev.filter((k) => k !== kw))}
											aria-label={`Remove ${kw}`}
											className="h-5 w-5 rounded-full flex items-center justify-center text-accent-text/70 hover:text-red-500 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1"
										>
											<X className="h-3 w-3" aria-hidden="true" />
										</button>
									</div>
								))}
							</div>
						)}
						<div className="flex gap-2">
							<Input
								ref={kwRef}
								value={keywordInput}
								aria-label="Add keyword"
								onChange={(e) => setKeywordInput(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === ",") {
										e.preventDefault();
										addKeyword(keywordInput);
									}
								}}
								placeholder="Press Enter to add"
								className="flex-1"
							/>
							<Button variant="outline" onClick={() => addKeyword(keywordInput)}>Add</Button>
						</div>
					</SectionCard>
					</>
					)}
				</div>
			</div>
		</div>
	);
}
