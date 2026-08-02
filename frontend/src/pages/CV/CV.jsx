import { CheckCircle2, Eye, FileText, Plus, Save } from "lucide-react";
import { Section, Field, ListItem, BulletEditor, TagEditor } from "./FormWidgets";
import { useEffect, useState } from "react";

import { Button } from "components/ui/button";
import { EmptyState } from "components/ui/empty-state";
import { FormSkeleton } from "components/ui/skeleton";
import { PageHeader } from "components/ui/page-header";
import UploadZone from "./UploadZone";
import { useAuth } from "@clerk/clerk-react";
import { useCallApi } from "services";

const EMPTY_CV = {
	header: { name: "", email: "", phone: "", location: "", linkedin: "", github: "", portfolio: "" },
	summary: "",
	competencies: [],
	experience: [],
	projects: [],
	education: [],
	certifications: [],
	skills: [],
	languages: [],
};

export default function CV() {
	const [cv, setCv] = useState(EMPTY_CV);
	const [pdfUrl, setPdfUrl] = useState(null);
	const [saving, setSaving] = useState(false);
	const [compiling, setCompiling] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [saved, setSaved] = useState(false);
	const [hasData, setHasData] = useState(false);
	const [firstLoad, setFirstLoad] = useState(true);

	const [callApi] = useCallApi();
	const { getToken } = useAuth();

	useEffect(() => {
		callApi("/cv", {
			onSuccess: (d) => {
				if (d.structuredData) {
					const parsed =
						typeof d.structuredData === "string" ? JSON.parse(d.structuredData) : d.structuredData;
					setCv({ ...EMPTY_CV, ...parsed });
					setHasData(true);
				}
				setFirstLoad(false);
			},
			onError: () => setFirstLoad(false),
		});
	}, []);

	const updateHeader = (field, value) => setCv((p) => ({ ...p, header: { ...p.header, [field]: value } }));

	const updateExperience = (idx, field, value) => {
		setCv((p) => {
			const next = [...p.experience];
			next[idx] = { ...next[idx], [field]: value };
			return { ...p, experience: next };
		});
	};

	const save = async () => {
		setSaving(true);
		await callApi("/cv", { method: "post", json: { structuredData: cv }, success: "CV saved" });
		setSaved(true);
		setHasData(true);
		setTimeout(() => setSaved(false), 2000);
		setSaving(false);
	};

	const handleUpload = async (file) => {
		setUploading(true);
		try {
			const token = await getToken();
			const form = new FormData();
			form.append("file", file);
			const resp = await fetch("/api/cv/upload", {
				method: "POST",
				headers: token ? { Authorization: `Bearer ${token}` } : {},
				body: form,
			});
			if (resp.ok) {
				const data = await resp.json();
				setCv({ ...EMPTY_CV, ...data.structuredData });
				setHasData(true);
			} else {
				const err = await resp.text();
				alert("Upload failed: " + err);
			}
		} finally {
			setUploading(false);
		}
	};

	const compile = async () => {
		setCompiling(true);
		if (pdfUrl) URL.revokeObjectURL(pdfUrl);
		try {
			const token = await getToken();
			const resp = await fetch("/api/cv/compile", {
				method: "POST",
				headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
				body: JSON.stringify({ structuredData: cv }),
			});
			if (resp.ok) {
				const blob = await resp.blob();
				setPdfUrl(URL.createObjectURL(blob));
			} else {
				let detail = `${resp.status} ${resp.statusText}`;
				try {
					const body = await resp.json();
					if (body?.detail) detail = body.detail;
				} catch {}
				alert(`PDF generation failed: ${detail}`);
			}
		} finally {
			setCompiling(false);
		}
	};

	return (
		<div className="flex flex-col h-full overflow-hidden">
			<PageHeader
				title="My CV"
				subtitle="Upload a PDF or edit sections inline"
				actions={
					<>
						<Button variant="outline" size="sm" onClick={save} disabled={saving}>
							{saved ? (
								<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
							) : (
								<Save className="h-3.5 w-3.5" />
							)}
							{saved ? "Saved" : saving ? "Saving…" : "Save"}
						</Button>
						<Button variant="primary" size="sm" onClick={compile} disabled={compiling || !hasData}>
							<Eye className="h-3.5 w-3.5" />
							{compiling ? "Generating…" : "Preview PDF"}
						</Button>
					</>
				}
			/>

			<div className="flex gap-4 flex-1 min-h-0 p-4">
				{/* Editor */}
				<div className="flex-1 overflow-y-auto space-y-3 pr-1 max-w-[700px]">
					{firstLoad ? (
						<FormSkeleton fields={6} />
					) : (
						<>
					<UploadZone onUpload={handleUpload} uploading={uploading} />

					<Section title="Contact information">
						<div className="grid grid-cols-2 gap-3">
							<Field
								label="Full name"
								value={cv.header.name}
								onChange={(v) => updateHeader("name", v)}
								placeholder="John Doe"
							/>
							<Field
								label="Email"
								value={cv.header.email}
								onChange={(v) => updateHeader("email", v)}
								placeholder="john@example.com"
							/>
							<Field
								label="Phone"
								value={cv.header.phone}
								onChange={(v) => updateHeader("phone", v)}
								placeholder="+1 555 000 0000"
							/>
							<Field
								label="Location"
								value={cv.header.location}
								onChange={(v) => updateHeader("location", v)}
								placeholder="Berlin, Germany"
							/>
							<Field
								label="LinkedIn URL"
								value={cv.header.linkedin}
								onChange={(v) => updateHeader("linkedin", v)}
								placeholder="https://linkedin.com/in/…"
							/>
							<Field
								label="GitHub URL"
								value={cv.header.github}
								onChange={(v) => updateHeader("github", v)}
								placeholder="https://github.com/…"
							/>
							<Field
								label="Portfolio URL"
								value={cv.header.portfolio}
								onChange={(v) => updateHeader("portfolio", v)}
								placeholder="https://yoursite.dev"
							/>
						</div>
					</Section>

					<Section title="Professional summary">
						<textarea
							value={cv.summary}
							onChange={(e) => setCv((p) => ({ ...p, summary: e.target.value }))}
							rows={3}
							placeholder="Brief professional summary (2–3 sentences)…"
							className="w-full text-[13px] border border-zinc-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/5 hover:border-zinc-300 transition-colors leading-relaxed"
						/>
					</Section>

					<Section title="Core competencies" defaultOpen={false}>
						<TagEditor
							tags={cv.competencies}
							onChange={(v) => setCv((p) => ({ ...p, competencies: v }))}
							placeholder="e.g. Distributed Systems"
						/>
					</Section>

					<Section title="Work experience" hint={`${cv.experience.length} entries`}>
						{cv.experience.map((exp, i) => (
							<ListItem
								key={i}
								onRemove={() =>
									setCv((p) => ({ ...p, experience: p.experience.filter((_, j) => j !== i) }))
								}
							>
								<div className="grid grid-cols-2 gap-2.5">
									<Field
										label="Company"
										value={exp.company}
										onChange={(v) => updateExperience(i, "company", v)}
									/>
									<Field
										label="Job title"
										value={exp.title}
										onChange={(v) => updateExperience(i, "title", v)}
									/>
									<Field
										label="Period"
										value={exp.period}
										onChange={(v) => updateExperience(i, "period", v)}
										placeholder="Jan 2022 – Present"
									/>
									<Field
										label="Location"
										value={exp.location}
										onChange={(v) => updateExperience(i, "location", v)}
										placeholder="Remote"
									/>
								</div>
								<BulletEditor
									bullets={exp.bullets || []}
									onChange={(v) => updateExperience(i, "bullets", v)}
								/>
							</ListItem>
						))}
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								setCv((p) => ({
									...p,
									experience: [
										...p.experience,
										{ company: "", title: "", period: "", location: "", bullets: [""] },
									],
								}))
							}
						>
							<Plus className="h-3.5 w-3.5" /> Add experience
						</Button>
					</Section>

					<Section title="Projects" hint={`${cv.projects.length} entries`} defaultOpen={false}>
						{cv.projects.map((proj, i) => (
							<ListItem
								key={i}
								onRemove={() =>
									setCv((p) => ({ ...p, projects: p.projects.filter((_, j) => j !== i) }))
								}
							>
								<div className="grid grid-cols-2 gap-2.5">
									<Field
										label="Name"
										value={proj.name}
										onChange={(v) => {
											const next = [...cv.projects];
											next[i] = { ...next[i], name: v };
											setCv((p) => ({ ...p, projects: next }));
										}}
									/>
									<Field
										label="Badge"
										value={proj.badge}
										onChange={(v) => {
											const next = [...cv.projects];
											next[i] = { ...next[i], badge: v };
											setCv((p) => ({ ...p, projects: next }));
										}}
										placeholder="Open Source"
									/>
								</div>
								<Field
									label="Description"
									value={proj.description}
									onChange={(v) => {
										const next = [...cv.projects];
										next[i] = { ...next[i], description: v };
										setCv((p) => ({ ...p, projects: next }));
									}}
								/>
								<Field
									label="Tech stack"
									value={proj.tech}
									onChange={(v) => {
										const next = [...cv.projects];
										next[i] = { ...next[i], tech: v };
										setCv((p) => ({ ...p, projects: next }));
									}}
									placeholder="Python, React, PostgreSQL"
								/>
							</ListItem>
						))}
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								setCv((p) => ({
									...p,
									projects: [...p.projects, { name: "", badge: "", description: "", tech: "" }],
								}))
							}
						>
							<Plus className="h-3.5 w-3.5" /> Add project
						</Button>
					</Section>

					<Section title="Education" hint={`${cv.education.length} entries`} defaultOpen={false}>
						{cv.education.map((edu, i) => (
							<ListItem
								key={i}
								onRemove={() =>
									setCv((p) => ({ ...p, education: p.education.filter((_, j) => j !== i) }))
								}
							>
								<div className="grid grid-cols-2 gap-2.5">
									<Field
										label="Degree"
										value={edu.degree}
										onChange={(v) => {
											const next = [...cv.education];
											next[i] = { ...next[i], degree: v };
											setCv((p) => ({ ...p, education: next }));
										}}
									/>
									<Field
										label="Institution"
										value={edu.institution}
										onChange={(v) => {
											const next = [...cv.education];
											next[i] = { ...next[i], institution: v };
											setCv((p) => ({ ...p, education: next }));
										}}
									/>
									<Field
										label="Year"
										value={edu.year}
										onChange={(v) => {
											const next = [...cv.education];
											next[i] = { ...next[i], year: v };
											setCv((p) => ({ ...p, education: next }));
										}}
										placeholder="2019"
									/>
									<Field
										label="Description"
										value={edu.description}
										onChange={(v) => {
											const next = [...cv.education];
											next[i] = { ...next[i], description: v };
											setCv((p) => ({ ...p, education: next }));
										}}
										placeholder="Optional"
									/>
								</div>
							</ListItem>
						))}
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								setCv((p) => ({
									...p,
									education: [
										...p.education,
										{ degree: "", institution: "", year: "", description: "" },
									],
								}))
							}
						>
							<Plus className="h-3.5 w-3.5" /> Add education
						</Button>
					</Section>

					<Section title="Certifications" hint={`${cv.certifications.length} entries`} defaultOpen={false}>
						{cv.certifications.map((cert, i) => (
							<ListItem
								key={i}
								onRemove={() =>
									setCv((p) => ({ ...p, certifications: p.certifications.filter((_, j) => j !== i) }))
								}
							>
								<div className="grid grid-cols-3 gap-2.5">
									<Field
										label="Title"
										value={cert.title}
										onChange={(v) => {
											const next = [...cv.certifications];
											next[i] = { ...next[i], title: v };
											setCv((p) => ({ ...p, certifications: next }));
										}}
									/>
									<Field
										label="Organization"
										value={cert.org}
										onChange={(v) => {
											const next = [...cv.certifications];
											next[i] = { ...next[i], org: v };
											setCv((p) => ({ ...p, certifications: next }));
										}}
									/>
									<Field
										label="Year"
										value={cert.year}
										onChange={(v) => {
											const next = [...cv.certifications];
											next[i] = { ...next[i], year: v };
											setCv((p) => ({ ...p, certifications: next }));
										}}
									/>
								</div>
							</ListItem>
						))}
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								setCv((p) => ({
									...p,
									certifications: [...p.certifications, { title: "", org: "", year: "" }],
								}))
							}
						>
							<Plus className="h-3.5 w-3.5" /> Add certification
						</Button>
					</Section>

					<Section title="Skills" hint={`${cv.skills.length} categories`} defaultOpen={false}>
						{cv.skills.map((skill, i) => (
							<ListItem
								key={i}
								onRemove={() => setCv((p) => ({ ...p, skills: p.skills.filter((_, j) => j !== i) }))}
							>
								<Field
									label="Category"
									value={skill.category}
									onChange={(v) => {
										const next = [...cv.skills];
										next[i] = { ...next[i], category: v };
										setCv((p) => ({ ...p, skills: next }));
									}}
									placeholder="Languages, Frameworks, Tools…"
								/>
								<TagEditor
									tags={skill.items || []}
									onChange={(v) => {
										const next = [...cv.skills];
										next[i] = { ...next[i], items: v };
										setCv((p) => ({ ...p, skills: next }));
									}}
									placeholder="Add skill"
								/>
							</ListItem>
						))}
						<Button
							variant="outline"
							size="sm"
							onClick={() => setCv((p) => ({ ...p, skills: [...p.skills, { category: "", items: [] }] }))}
						>
							<Plus className="h-3.5 w-3.5" /> Add skill category
						</Button>
					</Section>

					<Section title="Languages" hint={`${cv.languages.length} entries`} defaultOpen={false}>
						{cv.languages.map((lang, i) => (
							<ListItem
								key={i}
								onRemove={() =>
									setCv((p) => ({ ...p, languages: p.languages.filter((_, j) => j !== i) }))
								}
							>
								<div className="grid grid-cols-2 gap-2.5">
									<Field
										label="Language"
										value={lang.name}
										onChange={(v) => {
											const next = [...cv.languages];
											next[i] = { ...next[i], name: v };
											setCv((p) => ({ ...p, languages: next }));
										}}
										placeholder="English"
									/>
									<Field
										label="Level"
										value={lang.level}
										onChange={(v) => {
											const next = [...cv.languages];
											next[i] = { ...next[i], level: v };
											setCv((p) => ({ ...p, languages: next }));
										}}
										placeholder="Fluent, Native, Conversational…"
									/>
								</div>
							</ListItem>
						))}
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								setCv((p) => ({ ...p, languages: [...p.languages, { name: "", level: "" }] }))
							}
						>
							<Plus className="h-3.5 w-3.5" /> Add language
						</Button>
					</Section>

					<div className="h-8" />
						</>
					)}
				</div>

				{/* Preview */}
				<div className="flex-1 rounded-xl overflow-hidden border border-zinc-200/80 bg-zinc-50 flex flex-col shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
					{pdfUrl ? (
						<iframe src={pdfUrl} className="w-full h-full border-none" title="CV Preview" />
					) : (
						<EmptyState
							icon={FileText}
							title="No preview yet"
							description="Upload a PDF or fill in your details, then click Preview PDF to see a live preview."
						/>
					)}
				</div>
			</div>
		</div>
	);
}
