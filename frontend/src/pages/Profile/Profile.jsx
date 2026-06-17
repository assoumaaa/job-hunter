import { useEffect, useState } from "react";
import { CheckCircle2, Save, X } from "lucide-react";

import { Button } from "components/ui/button";
import { Input } from "components/ui/input";
import { PageHeader } from "components/ui/page-header";
import { useCallApi } from "services";

const SENIORITY = ["Junior", "Mid", "Senior", "Lead", "Principal"];
const NOTICE = ["Immediately", "2 weeks", "1 month", "2 months", "3 months"];
const LANG_LEVELS = ["Basic", "Conversational", "Fluent", "Native"];
const COMMON_LANGS = ["English", "Arabic", "French", "German", "Spanish", "Mandarin", "Portuguese", "Dutch"];

function Row({ label, description, children, align = "center" }) {
	return (
		<div className={`flex ${align === "start" ? "items-start" : "items-center"} justify-between px-5 py-4 gap-6`}>
			<div className="min-w-[180px] max-w-[220px]">
				<p className="text-[13px] font-medium text-zinc-900">{label}</p>
				{description && <p className="text-[11.5px] text-zinc-400 mt-0.5 leading-relaxed">{description}</p>}
			</div>
			<div className="flex-1 flex justify-end flex-wrap gap-2">{children}</div>
		</div>
	);
}

const pillCls = (active) =>
	`px-3 h-7 rounded-full text-[12px] font-medium border transition-colors cursor-pointer ${
		active
			? "bg-zinc-900 text-white border-zinc-900"
			: "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
	}`;

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
			success: "Profile saved",
		});
		setSaved(true);
		setTimeout(() => setSaved(false), 2000);
		setSaving(false);
	};

	return (
		<div className="flex flex-col h-full overflow-hidden">
			<PageHeader
				title="Profile"
				subtitle="Used by Claude to score and tailor your applications"
				actions={
					<Button variant="primary" size="sm" onClick={save} disabled={saving}>
						{saved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
						{saved ? "Saved" : saving ? "Saving…" : "Save"}
					</Button>
				}
			/>

			<div className="flex-1 overflow-y-auto">
				<div className="max-w-[760px] mx-auto px-8 py-8">
					<div className="bg-white border border-zinc-200/80 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.02)] divide-y divide-zinc-100">
						<Row label="Full name" description="Used in cover letters">
							<Input value={form.fullName} onChange={(e) => set("fullName", e.target.value)} placeholder="Your full name" className="w-56" />
						</Row>
						<Row label="LinkedIn URL" description="Used in cover letters">
							<Input value={form.linkedinUrl} onChange={(e) => set("linkedinUrl", e.target.value)} placeholder="linkedin.com/in/you" className="w-72" />
						</Row>
						<Row label="GitHub URL" description="Used in cover letters">
							<Input value={form.githubUrl} onChange={(e) => set("githubUrl", e.target.value)} placeholder="github.com/you" className="w-72" />
						</Row>
						<Row label="Years of experience" description="Total professional experience">
							<Input type="number" min={0} max={40} value={form.totalYearsExperience} onChange={(e) => set("totalYearsExperience", e.target.value)} className="w-20 text-center" />
						</Row>
						<Row label="Seniority" description="Your current level">
							{SENIORITY.map((s) => (
								<button key={s} onClick={() => set("seniority", s)} className={pillCls(form.seniority === s)}>
									{s}
								</button>
							))}
						</Row>
						<Row label="Current location" description="Where you are based">
							<Input value={form.currentLocation} onChange={(e) => set("currentLocation", e.target.value)} placeholder="e.g. Dubai, UAE" className="w-56" />
						</Row>
						<Row label="Notice period" description="How soon can you start">
							{NOTICE.map((n) => (
								<button key={n} onClick={() => set("noticePeriod", n)} className={pillCls(form.noticePeriod === n)}>
									{n}
								</button>
							))}
						</Row>

						<div className="px-5 py-4 flex flex-col gap-3">
							<div>
								<p className="text-[13px] font-medium text-zinc-900">Languages</p>
								<p className="text-[11.5px] text-zinc-400 mt-0.5">Included in CV and screening</p>
							</div>
							{form.languages.length > 0 && (
								<div className="flex flex-wrap gap-1.5">
									{form.languages.map((l) => (
										<div key={l.name} className="inline-flex items-center gap-1.5 bg-zinc-100 text-zinc-800 rounded-full px-2.5 py-1 text-[12px] font-medium">
											<span>{l.name}</span>
											<span className="text-zinc-400">·</span>
											<span className="text-zinc-500">{l.level}</span>
											<button
												onClick={() => set("languages", form.languages.filter((x) => x.name !== l.name))}
												className="ml-0.5 text-zinc-400 hover:text-red-500"
											>
												<X className="h-3 w-3" />
											</button>
										</div>
									))}
								</div>
							)}
							<div className="flex flex-wrap gap-1.5">
								{COMMON_LANGS.filter((l) => !form.languages.some((x) => x.name === l)).map((l) => (
									<button key={l} onClick={() => addLang(l)} className={pillCls(false)}>
										+ {l}
									</button>
								))}
							</div>
							<div className="flex gap-2 items-center flex-wrap pt-1">
								<Input
									placeholder="Other language…"
									value={langName}
									onChange={(e) => setLangName(e.target.value)}
									onKeyDown={(e) => e.key === "Enter" && addLang(langName)}
									className="flex-1 min-w-[160px]"
								/>
								<div className="flex gap-1">
									{LANG_LEVELS.map((lv) => (
										<button
											key={lv}
											onClick={() => setLangLevel(lv)}
											className={`px-2.5 h-8 rounded-md text-[12px] font-medium border transition-colors cursor-pointer ${
												langLevel === lv
													? "bg-zinc-900 text-white border-zinc-900"
													: "border-zinc-200 text-zinc-600 hover:border-zinc-400"
											}`}
										>
											{lv}
										</button>
									))}
								</div>
								<Button variant="outline" size="sm" onClick={() => addLang(langName)}>Add</Button>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
