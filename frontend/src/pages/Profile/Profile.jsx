import { useEffect, useState } from "react";
import { CheckCircle2, Save } from "lucide-react";

import { Button } from "components/ui/button";
import { FormSkeleton } from "components/ui/skeleton";
import { Input } from "components/ui/input";
import { PageHeader } from "components/ui/page-header";
import { RadioPills } from "components/ui/radio-pills";
import { LanguagesField, NoticePeriodField } from "./ProfileFields";
import { parseJsonList } from "models/job";
import { useProfileApi, useResource } from "services";

const SENIORITY = ["Junior", "Mid", "Senior", "Lead", "Principal"].map((v) => ({ value: v, label: v }));

function Row({ label, description, children, htmlFor, align = "center" }) {
	const LabelTag = htmlFor ? "label" : "p";
	return (
		<div className={`flex ${align === "start" ? "items-start" : "items-center"} justify-between px-5 py-4 gap-6`}>
			<div className="min-w-[180px] max-w-[220px]">
				<LabelTag htmlFor={htmlFor} className="text-body font-medium text-ink block m-0">
					{label}
				</LabelTag>
				{description && <p className="text-micro text-ink-3 mt-0.5 leading-relaxed m-0">{description}</p>}
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

	const [api] = useProfileApi();

	const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

	const [stored, { firstLoad }] = useResource(() => api.get(), []);
	useEffect(() => {
		if (!stored) return;
		setForm({
			fullName: stored.fullName ?? "",
			linkedinUrl: stored.linkedinUrl ?? "",
			githubUrl: stored.githubUrl ?? "",
			totalYearsExperience: stored.totalYearsExperience?.toString() ?? "",
			seniority: stored.seniority ?? "",
			currentLocation: stored.currentLocation ?? "",
			noticePeriod: stored.noticePeriod ?? "",
			languages: parseJsonList(stored.languages),
		});
	}, [stored]);

	const save = async () => {
		setSaving(true);
		await api.save({
			fullName: form.fullName || null,
			linkedinUrl: form.linkedinUrl || null,
			githubUrl: form.githubUrl || null,
			totalYearsExperience: form.totalYearsExperience ? parseInt(form.totalYearsExperience) : null,
			seniority: form.seniority || null,
			currentLocation: form.currentLocation || null,
			noticePeriod: form.noticePeriod || null,
			languages: JSON.stringify(form.languages),
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
				title="Profile"
				subtitle="Used by Claude to score and tailor your applications"
				actions={
					<Button variant="primary" size="sm" onClick={save} disabled={saving}>
						{saved ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Save className="h-3.5 w-3.5" aria-hidden="true" />}
						{saved ? "Saved" : saving ? "Saving…" : "Save"}
					</Button>
				}
			/>

			<div className="flex-1 overflow-y-auto">
				<div className="max-w-[760px] mx-auto px-8 py-8">
					{firstLoad ? (
						<FormSkeleton fields={8} />
					) : (
					<div className="bg-surface border border-line rounded-xl shadow-raised divide-y divide-line">
						<Row label="Full name" description="Used in cover letters" htmlFor="profile-name">
							<Input id="profile-name" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} placeholder="Your full name" autoComplete="name" className="w-56" />
						</Row>
						<Row label="LinkedIn URL" description="Used in cover letters" htmlFor="profile-linkedin">
							<Input id="profile-linkedin" value={form.linkedinUrl} onChange={(e) => set("linkedinUrl", e.target.value)} placeholder="linkedin.com/in/you" className="w-72" />
						</Row>
						<Row label="GitHub URL" description="Used in cover letters" htmlFor="profile-github">
							<Input id="profile-github" value={form.githubUrl} onChange={(e) => set("githubUrl", e.target.value)} placeholder="github.com/you" className="w-72" />
						</Row>
						<Row label="Years of experience" description="Total professional experience" htmlFor="profile-years">
							<Input id="profile-years" type="number" min={0} max={40} value={form.totalYearsExperience} onChange={(e) => set("totalYearsExperience", e.target.value)} className="w-20 text-center" />
						</Row>
						<Row label="Seniority" description="Your current level">
							<RadioPills
								label="Seniority"
								options={SENIORITY}
								value={form.seniority}
								onChange={(v) => set("seniority", v)}
								className="justify-end"
							/>
						</Row>
						<Row label="Current location" description="Where you are based" htmlFor="profile-location">
							<Input id="profile-location" value={form.currentLocation} onChange={(e) => set("currentLocation", e.target.value)} placeholder="e.g. Dubai, UAE" className="w-56" />
						</Row>
						<Row label="Notice period" description="How soon can you start">
							<NoticePeriodField
								value={form.noticePeriod}
								onChange={(v) => set("noticePeriod", v)}
							/>
						</Row>

						<div className="px-5 py-4 flex flex-col gap-3">
							<div>
								<p className="text-body font-medium text-ink m-0">Languages</p>
								<p className="text-micro text-ink-3 mt-0.5 m-0">Included in CV and screening</p>
							</div>
							<LanguagesField
								value={form.languages}
								onChange={(v) => set("languages", v)}
							/>
						</div>
					</div>
					)}
				</div>
			</div>
		</div>
	);
}
