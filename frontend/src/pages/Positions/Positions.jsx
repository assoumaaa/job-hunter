import { useEffect, useRef, useState } from "react";
import { Plus, Save, X } from "lucide-react";

import { useCallApi } from "services";
import { COUNTRIES, COUNTRY_REGIONS } from "models";
import { Button } from "components/ui/button";
import { Input } from "components/ui/input";

const SUGGESTED = ["Backend Engineer", "Frontend Engineer", "Full Stack Engineer", "Software Engineer", "Solution Engineer", "DevOps Engineer"];
const JOB_TYPES = [
	{ value: "fulltime", label: "Full-time" },
	{ value: "contract", label: "Contract" },
	{ value: "parttime", label: "Part-time" },
	{ value: "internship", label: "Internship" },
];

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
			success: "Settings saved!",
		});
		setSaved(true);
		setTimeout(() => setSaved(false), 2000);
		setSaving(false);
	};

	const pill = (active) =>
		`px-3 py-1 rounded-full text-sm border transition-colors cursor-pointer ${
			active ? "bg-indigo-50 text-indigo-700 border-indigo-300" : "border-zinc-200 text-zinc-600 hover:border-zinc-400"
		}`;

	return (
		<div className="h-full overflow-y-auto p-6">
			<div className="max-w-2xl flex flex-col gap-6">
				<div>
					<h1 className="text-xl font-semibold">Positions &amp; Fetch Settings</h1>
					<p className="text-sm text-zinc-500 mt-1">Configure what to search for and where when syncing from LinkedIn.</p>
				</div>

				{/* Job titles */}
				<div className="bg-white border border-zinc-200 rounded-xl p-5 flex flex-col gap-4">
					<span className="text-sm font-medium">Job Titles</span>
					{positions.length > 0 && (
						<div className="flex flex-wrap gap-2">
							{positions.map((p) => (
								<div key={p.id} className="flex items-center gap-1 bg-zinc-100 rounded-full px-3 py-1 text-sm">
									{p.label}
									<button onClick={() => removePosition(p.id)} className="ml-1 text-zinc-400 hover:text-zinc-700">
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
						<Button onClick={() => addPosition(input)}>
							<Plus className="h-4 w-4 mr-1" /> Add
						</Button>
					</div>
					<div className="flex flex-wrap gap-2 pt-1 border-t border-zinc-100">
						{SUGGESTED.map((s) => (
							<button
								key={s}
								onClick={() => addPosition(s)}
								disabled={!!positions.find((p) => p.label === s)}
								className="text-sm px-3 py-1 rounded-full border border-zinc-200 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-default cursor-pointer"
							>
								+ {s}
							</button>
						))}
					</div>
				</div>

				{/* Fetch settings */}
				<div className="bg-white border border-zinc-200 rounded-xl divide-y divide-zinc-100">
					<div className="px-5 py-4 flex items-center justify-between">
						<div>
							<p className="text-sm font-semibold">Fetch Settings</p>
							<p className="text-xs text-zinc-400 mt-0.5">Applied every time you sync jobs</p>
						</div>
						<Button size="sm" onClick={saveSettings} disabled={saving}>
							<Save className="h-3.5 w-3.5 mr-1.5" />
							{saved ? "Saved!" : saving ? "Saving..." : "Save"}
						</Button>
					</div>

					{/* Job types */}
					<div className="px-5 py-4 flex items-center justify-between gap-4">
						<div>
							<p className="text-sm font-medium">Job Type</p>
							<p className="text-xs text-zinc-400 mt-0.5">Employment types to fetch</p>
						</div>
						<div className="flex gap-2 flex-wrap justify-end">
							{JOB_TYPES.map(({ value, label }) => (
								<button key={value} onClick={() => toggleJobType(value)} className={pill(selectedJobTypes.includes(value))}>
									{label}
								</button>
							))}
						</div>
					</div>

					{/* Countries */}
					<div className="px-5 py-4 flex flex-col gap-3">
						<div>
							<p className="text-sm font-medium">Countries</p>
							<p className="text-xs text-zinc-400 mt-0.5">Jobs fetched from selected countries</p>
						</div>
						{selectedCountries.length > 0 && (
							<div className="flex flex-wrap gap-2">
								{selectedCountries.map((code) => {
									const c = COUNTRIES.find((x) => x.code === code);
									return (
										<div key={code} className="flex items-center gap-1 bg-indigo-100 text-indigo-800 rounded-full px-3 py-1 text-sm">
											{c?.name ?? code}
											<button onClick={() => toggleCountry(code)} className="ml-1 opacity-70 hover:opacity-100">
												<X className="h-3 w-3" />
											</button>
										</div>
									);
								})}
							</div>
						)}
						<select
							className="text-sm border border-zinc-200 rounded-lg px-3 py-2 bg-white text-zinc-700 max-w-xs cursor-pointer"
							value=""
							onChange={(e) => { if (e.target.value) toggleCountry(e.target.value); }}
						>
							<option value="">+ Add country...</option>
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
					</div>

					{/* Keywords */}
					<div className="px-5 py-4 flex flex-col gap-3">
						<div>
							<p className="text-sm font-medium">Keywords</p>
							<p className="text-xs text-zinc-400 mt-0.5">Skills and technologies matched during screening</p>
						</div>
						{keywords.length > 0 && (
							<div className="flex flex-wrap gap-2">
								{keywords.map((kw) => (
									<div key={kw} className="flex items-center gap-1 bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-full px-3 py-1 text-sm">
										{kw}
										<button onClick={() => setKeywords((prev) => prev.filter((k) => k !== kw))} className="ml-1 opacity-60 hover:opacity-100">
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
							<Button variant="outline" size="sm" onClick={() => addKeyword(keywordInput)}>
								Add
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
