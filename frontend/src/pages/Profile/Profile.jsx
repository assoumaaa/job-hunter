import { useEffect, useState } from "react";
import { Save, X } from "lucide-react";

import { useCallApi } from "services";
import { Button } from "components/ui/button";
import { Input } from "components/ui/input";

const SENIORITY = ["Junior", "Mid", "Senior", "Lead", "Principal"];
const NOTICE = ["Immediately", "2 weeks", "1 month", "2 months", "3 months"];
const LANG_LEVELS = ["Basic", "Conversational", "Fluent", "Native"];
const COMMON_LANGS = ["English", "Arabic", "French", "German", "Spanish", "Mandarin", "Portuguese", "Dutch"];

function Section({ label, description, children }) {
	return (
		<div className="flex items-center justify-between px-5 py-4 gap-4">
			<div className="min-w-[160px]">
				<p className="text-sm font-medium">{label}</p>
				{description && <p className="text-xs text-zinc-400 mt-0.5">{description}</p>}
			</div>
			<div className="flex-1 flex justify-end flex-wrap gap-2">{children}</div>
		</div>
	);
}

export default function Profile() {
	const [form, setForm] = useState({
		fullName: "",
		linkedinUrl: "",
		githubUrl: "",
		totalYearsExperience: "",
		seniority: "",
		currentLocation: "",
		noticePeriod: "",
		languages: [],
	});
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [langName, setLangName] = useState("");
	const [langLevel, setLangLevel] = useState("Fluent");

	const [callApi] = useCallApi();

	const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

	const addLang = (name) => {
		const t = name.trim();
		if (!t || form.languages.some((l) => l.name.toLowerCase() === t.toLowerCase())) return;
		set("languages", [...form.languages, { name: t, level: langLevel }]);
		setLangName("");
	};

	useEffect(() => {
		callApi("/profile", {
			onSuccess: (d) =>
				setForm({
					fullName: d.fullName ?? "",
					linkedinUrl: d.linkedinUrl ?? "",
					githubUrl: d.githubUrl ?? "",
					totalYearsExperience: d.totalYearsExperience?.toString() ?? "",
					seniority: d.seniority ?? "",
					currentLocation: d.currentLocation ?? "",
					noticePeriod: d.noticePeriod ?? "",
					languages: d.languages ? JSON.parse(d.languages) : [],
				}),
		});
	}, []);

	const save = async () => {
		setSaving(true);
		await callApi("/profile", {
			method: "post",
			json: {
				fullName: form.fullName || null,
				linkedinUrl: form.linkedinUrl || null,
				githubUrl: form.githubUrl || null,
				totalYearsExperience: form.totalYearsExperience ? parseInt(form.totalYearsExperience) : null,
				seniority: form.seniority || null,
				currentLocation: form.currentLocation || null,
				noticePeriod: form.noticePeriod || null,
				languages: JSON.stringify(form.languages),
			},
			success: "Profile saved!",
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
			<div className="max-w-xl flex flex-col gap-6">
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-xl font-semibold">Profile</h1>
						<p className="text-sm text-zinc-500 mt-0.5">Used by Claude to score and tailor your applications.</p>
					</div>
					<Button onClick={save} disabled={saving}>
						<Save className="h-4 w-4 mr-2" />
						{saved ? "Saved!" : saving ? "Saving..." : "Save"}
					</Button>
				</div>

				<div className="bg-white border border-zinc-200 rounded-xl divide-y divide-zinc-100">
					<Section label="Full Name" description="Used in cover letters">
						<Input value={form.fullName} onChange={(e) => set("fullName", e.target.value)} placeholder="Your full name" className="w-48" />
					</Section>
					<Section label="LinkedIn URL" description="Used in cover letters">
						<Input value={form.linkedinUrl} onChange={(e) => set("linkedinUrl", e.target.value)} placeholder="linkedin.com/in/you" className="w-64" />
					</Section>
					<Section label="GitHub URL" description="Used in cover letters">
						<Input value={form.githubUrl} onChange={(e) => set("githubUrl", e.target.value)} placeholder="github.com/you" className="w-64" />
					</Section>
					<Section label="Years Experience" description="Total professional experience">
						<Input type="number" min={0} max={40} value={form.totalYearsExperience} onChange={(e) => set("totalYearsExperience", e.target.value)} className="w-20 text-center" />
					</Section>
					<Section label="Seniority" description="Your current level">
						{SENIORITY.map((s) => (
							<button key={s} onClick={() => set("seniority", s)} className={pill(form.seniority === s)}>
								{s}
							</button>
						))}
					</Section>
					<Section label="Current Location" description="Where you are based">
						<Input value={form.currentLocation} onChange={(e) => set("currentLocation", e.target.value)} placeholder="e.g. Dubai, UAE" className="w-48" />
					</Section>
					<Section label="Notice Period" description="How soon can you start">
						{NOTICE.map((n) => (
							<button key={n} onClick={() => set("noticePeriod", n)} className={pill(form.noticePeriod === n)}>
								{n}
							</button>
						))}
					</Section>

					{/* Languages */}
					<div className="px-5 py-4 flex flex-col gap-3">
						<div>
							<p className="text-sm font-medium">Languages</p>
							<p className="text-xs text-zinc-400 mt-0.5">Included in CV and screening</p>
						</div>
						{form.languages.length > 0 && (
							<div className="flex flex-wrap gap-2">
								{form.languages.map((l) => (
									<div key={l.name} className="flex items-center gap-1.5 bg-indigo-100 text-indigo-800 rounded-full px-3 py-1 text-sm">
										<span>{l.name}</span>
										<span className="opacity-50 text-xs">·</span>
										<span className="opacity-70 text-xs">{l.level}</span>
										<button onClick={() => set("languages", form.languages.filter((x) => x.name !== l.name))} className="ml-1 opacity-70 hover:opacity-100">
											<X className="h-3 w-3" />
										</button>
									</div>
								))}
							</div>
						)}
						<div className="flex flex-wrap gap-2">
							{COMMON_LANGS.filter((l) => !form.languages.some((x) => x.name === l)).map((l) => (
								<button key={l} onClick={() => addLang(l)} className={pill(false)}>
									+ {l}
								</button>
							))}
						</div>
						<div className="flex gap-2 items-center flex-wrap">
							<Input
								placeholder="Other language..."
								value={langName}
								onChange={(e) => setLangName(e.target.value)}
								onKeyDown={(e) => e.key === "Enter" && addLang(langName)}
								className="flex-1 min-w-[140px]"
							/>
							<div className="flex gap-1">
								{LANG_LEVELS.map((lv) => (
									<button
										key={lv}
										onClick={() => setLangLevel(lv)}
										className={`px-2.5 py-1 rounded-md text-xs border transition-colors cursor-pointer ${
											langLevel === lv
												? "bg-indigo-50 text-indigo-700 border-indigo-300"
												: "border-zinc-200 text-zinc-600 hover:border-zinc-400"
										}`}
									>
										{lv}
									</button>
								))}
							</div>
							<Button variant="outline" size="sm" onClick={() => addLang(langName)}>
								Add
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
