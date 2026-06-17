import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Plus, Save, X } from "lucide-react";

import { Button } from "components/ui/button";
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
	`px-3 h-7 rounded-full text-[12px] font-medium border transition-colors cursor-pointer ${
		active
			? "bg-zinc-900 text-white border-zinc-900"
			: "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
	}`;

function SectionCard({ title, description, action, children, padding = "p-5" }) {
	return (
		<div className="bg-white border border-zinc-200/80 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.02)] overflow-hidden">
			{(title || action) && (
				<div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between gap-4">
					<div>
						{title && <p className="text-[13px] font-semibold text-zinc-900">{title}</p>}
						{description && <p className="text-[11.5px] text-zinc-400 mt-0.5">{description}</p>}
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
		callApi("/positions", { onSuccess: setPositions });
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
			<PageHeader
				title="Targeting"
				subtitle="What to search for and where"
				actions={
					<Button variant="primary" size="sm" onClick={saveSettings} disabled={saving}>
						{saved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
						{saved ? "Saved" : saving ? "Saving…" : "Save"}
					</Button>
				}
			/>

			<div className="flex-1 overflow-y-auto">
				<div className="max-w-[860px] mx-auto px-8 py-8 flex flex-col gap-5">

					<SectionCard title="Job titles" description="Roles we'll search for on every sync">
						{positions.length > 0 && (
							<div className="flex flex-wrap gap-1.5 mb-3">
								{positions.map((p) => (
									<div key={p.id} className="inline-flex items-center gap-1.5 bg-zinc-100 rounded-full px-3 py-1 text-[12px] font-medium text-zinc-800">
										{p.label}
										<button onClick={() => removePosition(p.id)} className="text-zinc-400 hover:text-red-500">
											<X className="h-3 w-3" />
										</button>
									</div>
								))}
							</div>
						)}
						<div className="flex gap-2">
							<Input
								placeholder="e.g. Platform Engineer"
								value={input}
								onChange={(e) => setInput(e.target.value)}
								onKeyDown={(e) => e.key === "Enter" && addPosition(input)}
							/>
							<Button variant="outline" onClick={() => addPosition(input)}>
								<Plus className="h-4 w-4" /> Add
							</Button>
						</div>
						<div className="flex flex-wrap gap-1.5 pt-4 mt-4 border-t border-zinc-100">
							<span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide self-center mr-1">Suggested</span>
							{SUGGESTED.map((s) => (
								<button
									key={s}
									onClick={() => addPosition(s)}
									disabled={!!positions.find((p) => p.label === s)}
									className="text-[12px] px-3 h-7 rounded-full border border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 disabled:opacity-40 disabled:cursor-default cursor-pointer transition-colors"
								>
									+ {s}
								</button>
							))}
						</div>
					</SectionCard>

					<SectionCard title="Job type" description="Employment types to include">
						<div className="flex gap-1.5 flex-wrap">
							{JOB_TYPES.map(({ value, label }) => (
								<button key={value} onClick={() => toggleJobType(value)} className={pillCls(selectedJobTypes.includes(value))}>
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
										<div key={code} className="inline-flex items-center gap-1.5 bg-zinc-100 text-zinc-800 rounded-full px-3 py-1 text-[12px] font-medium">
											{c?.name ?? code}
											<button onClick={() => toggleCountry(code)} className="text-zinc-400 hover:text-red-500">
												<X className="h-3 w-3" />
											</button>
										</div>
									);
								})}
							</div>
						)}
						<select
							className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-[13px] text-zinc-700 max-w-xs cursor-pointer hover:border-zinc-300 focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/5"
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
									<div key={kw} className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 rounded-full px-3 py-1 text-[12px] font-medium ring-1 ring-inset ring-indigo-200/60">
										{kw}
										<button onClick={() => setKeywords((prev) => prev.filter((k) => k !== kw))} className="text-indigo-400 hover:text-red-500">
											<X className="h-3 w-3" />
										</button>
									</div>
								))}
							</div>
						)}
						<div className="flex gap-2">
							<Input
								ref={kwRef}
								value={keywordInput}
								onChange={(e) => setKeywordInput(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === ",") {
										e.preventDefault();
										addKeyword(keywordInput);
									}
								}}
								placeholder="Python, AWS, React — press Enter"
								className="flex-1"
							/>
							<Button variant="outline" onClick={() => addKeyword(keywordInput)}>Add</Button>
						</div>
					</SectionCard>
				</div>
			</div>
		</div>
	);
}
