import { Award, FileText, FolderGit2, GraduationCap, Languages, Plus, User, Wrench } from "lucide-react";

import ExperienceSection from "./ExperienceSection";
import UploadZone from "./UploadZone";
import { AutoTextarea, Field, ListItem, Section, TagEditor } from "./FormWidgets";
import { Button } from "components/ui/button";

// Renders just the active section — the top tabs switch which one is shown.
export default function CvEditor({ cv, setCv, uploading, onUpload, activeSection }) {
	const updateHeader = (field, value) =>
		setCv((p) => ({ ...p, header: { ...p.header, [field]: value } }));
	const setList = (key, list) => setCv((p) => ({ ...p, [key]: list }));
	const updateItem = (key, i, patch) =>
		setCv((p) => ({ ...p, [key]: p[key].map((it, j) => (j === i ? { ...it, ...patch } : it)) }));
	const removeItem = (key, i) => setCv((p) => ({ ...p, [key]: p[key].filter((_, j) => j !== i) }));
	const addItem = (key, blank) => setCv((p) => ({ ...p, [key]: [...p[key], blank] }));

	const sections = {
		contact: (
			<Section bare icon={User} title="Contact information">
				<div className="grid grid-cols-2 gap-3">
					<Field label="Full name" value={cv.header.name} onChange={(v) => updateHeader("name", v)} placeholder="John Doe" />
					<Field label="Email" value={cv.header.email} onChange={(v) => updateHeader("email", v)} placeholder="john@example.com" />
					<Field label="Phone" value={cv.header.phone} onChange={(v) => updateHeader("phone", v)} placeholder="+1 555 000 0000" />
					<Field label="Location" value={cv.header.location} onChange={(v) => updateHeader("location", v)} placeholder="Berlin, Germany" />
					<Field label="LinkedIn URL" value={cv.header.linkedin} onChange={(v) => updateHeader("linkedin", v)} placeholder="https://linkedin.com/in/…" />
					<Field label="GitHub URL" value={cv.header.github} onChange={(v) => updateHeader("github", v)} placeholder="https://github.com/…" />
					<Field label="Portfolio URL" value={cv.header.portfolio} onChange={(v) => updateHeader("portfolio", v)} placeholder="https://yoursite.dev" />
				</div>
			</Section>
		),
		summary: (
			<Section bare icon={FileText} title="Professional summary">
				<AutoTextarea
					value={cv.summary}
					onChange={(e) => setCv((p) => ({ ...p, summary: e.target.value }))}
					minRows={3}
					placeholder="Brief professional summary (2–3 sentences)…"
				/>
			</Section>
		),
		experience: <ExperienceSection experience={cv.experience} onChange={(list) => setList("experience", list)} />,
		projects: (
			<Section bare icon={FolderGit2} title="Projects" hint={`${cv.projects.length} entries`}>
				{cv.projects.map((proj, i) => (
					<ListItem key={i} onRemove={() => removeItem("projects", i)}>
						<div className="grid grid-cols-2 gap-2.5">
							<Field label="Name" value={proj.name} onChange={(v) => updateItem("projects", i, { name: v })} />
							<Field label="Badge" value={proj.badge} onChange={(v) => updateItem("projects", i, { badge: v })} placeholder="Open Source" />
						</div>
						<Field label="Description" value={proj.description} onChange={(v) => updateItem("projects", i, { description: v })} />
						<Field label="Tech stack" value={proj.tech} onChange={(v) => updateItem("projects", i, { tech: v })} placeholder="Python, React, PostgreSQL" />
					</ListItem>
				))}
				<Button variant="outline" size="sm" onClick={() => addItem("projects", { name: "", badge: "", description: "", tech: "" })}>
					<Plus className="h-3.5 w-3.5" /> Add project
				</Button>
			</Section>
		),
		education: (
			<Section bare icon={GraduationCap} title="Education" hint={`${cv.education.length} entries`}>
				{cv.education.map((edu, i) => (
					<ListItem key={i} onRemove={() => removeItem("education", i)}>
						<div className="grid grid-cols-2 gap-2.5">
							<Field label="Degree" value={edu.degree} onChange={(v) => updateItem("education", i, { degree: v })} />
							<Field label="Institution" value={edu.institution} onChange={(v) => updateItem("education", i, { institution: v })} />
							<Field label="Year" value={edu.year} onChange={(v) => updateItem("education", i, { year: v })} placeholder="2019" />
							<Field label="Description" value={edu.description} onChange={(v) => updateItem("education", i, { description: v })} placeholder="Optional" />
						</div>
					</ListItem>
				))}
				<Button variant="outline" size="sm" onClick={() => addItem("education", { degree: "", institution: "", year: "", description: "" })}>
					<Plus className="h-3.5 w-3.5" /> Add education
				</Button>
			</Section>
		),
		certifications: (
			<Section bare icon={Award} title="Certifications" hint={`${cv.certifications.length} entries`}>
				{cv.certifications.map((cert, i) => (
					<ListItem key={i} onRemove={() => removeItem("certifications", i)}>
						<div className="grid grid-cols-3 gap-2.5">
							<Field label="Title" value={cert.title} onChange={(v) => updateItem("certifications", i, { title: v })} />
							<Field label="Organization" value={cert.org} onChange={(v) => updateItem("certifications", i, { org: v })} />
							<Field label="Year" value={cert.year} onChange={(v) => updateItem("certifications", i, { year: v })} />
						</div>
					</ListItem>
				))}
				<Button variant="outline" size="sm" onClick={() => addItem("certifications", { title: "", org: "", year: "" })}>
					<Plus className="h-3.5 w-3.5" /> Add certification
				</Button>
			</Section>
		),
		skills: (
			<Section bare icon={Wrench} title="Skills" hint={`${cv.skills.length} categories`}>
				{cv.skills.map((skill, i) => (
					<ListItem key={i} onRemove={() => removeItem("skills", i)}>
						<Field label="Category" value={skill.category} onChange={(v) => updateItem("skills", i, { category: v })} placeholder="Languages, Frameworks, Tools…" />
						<TagEditor tags={skill.items || []} onChange={(v) => updateItem("skills", i, { items: v })} placeholder="Add skill" />
					</ListItem>
				))}
				<Button variant="outline" size="sm" onClick={() => addItem("skills", { category: "", items: [] })}>
					<Plus className="h-3.5 w-3.5" /> Add skill category
				</Button>
			</Section>
		),
		languages: (
			<Section bare icon={Languages} title="Languages" hint={`${cv.languages.length} entries`}>
				{cv.languages.map((lang, i) => (
					<ListItem key={i} onRemove={() => removeItem("languages", i)}>
						<div className="grid grid-cols-2 gap-2.5">
							<Field label="Language" value={lang.name} onChange={(v) => updateItem("languages", i, { name: v })} placeholder="English" />
							<Field label="Level" value={lang.level} onChange={(v) => updateItem("languages", i, { level: v })} placeholder="Fluent, Native, Conversational…" />
						</div>
					</ListItem>
				))}
				<Button variant="outline" size="sm" onClick={() => addItem("languages", { name: "", level: "" })}>
					<Plus className="h-3.5 w-3.5" /> Add language
				</Button>
			</Section>
		),
	};

	return (
		<div className="space-y-3">
			{activeSection === "contact" && <UploadZone onUpload={onUpload} uploading={uploading} />}
			{sections[activeSection] ?? sections.contact}
			<div className="h-8" />
		</div>
	);
}
