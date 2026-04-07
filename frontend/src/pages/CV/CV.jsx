import { useCallback, useEffect, useRef, useState } from "react";
import {
	Eye,
	Save,
	Upload,
	Plus,
	Trash2,
	ChevronDown,
	ChevronUp,
	FileText,
	GripVertical,
} from "lucide-react";

import { useAuth } from "@clerk/clerk-react";

import { useCallApi } from "services";
import { Button } from "components/ui/button";
import { Input } from "components/ui/input";

const EMPTY_CV = {
	header: { name: "", email: "", phone: "", location: "", linkedin: "", github: "", portfolio: "" },
	summary: "",
	competencies: [],
	experience: [],
	projects: [],
	education: [],
	certifications: [],
	skills: [],
};

// ---------------------------------------------------------------------------
// Drag & drop upload zone
// ---------------------------------------------------------------------------
function UploadZone({ onUpload, uploading }) {
	const [dragOver, setDragOver] = useState(false);
	const inputRef = useRef(null);

	const handleDrop = useCallback(
		(e) => {
			e.preventDefault();
			setDragOver(false);
			const file = e.dataTransfer?.files?.[0];
			if (file && file.type === "application/pdf") onUpload(file);
		},
		[onUpload],
	);

	const handleFileChange = (e) => {
		const file = e.target.files?.[0];
		if (file) onUpload(file);
	};

	return (
		<div
			onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
			onDragLeave={() => setDragOver(false)}
			onDrop={handleDrop}
			onClick={() => inputRef.current?.click()}
			className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
				dragOver ? "border-indigo-400 bg-indigo-50" : "border-zinc-300 hover:border-zinc-400 bg-zinc-50"
			}`}
		>
			<input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
			<Upload className={`h-8 w-8 mx-auto mb-3 ${dragOver ? "text-indigo-500" : "text-zinc-400"}`} />
			{uploading ? (
				<p className="text-sm text-indigo-600 font-medium">Parsing your CV with AI...</p>
			) : (
				<>
					<p className="text-sm font-medium text-zinc-700">Drop your PDF here or click to browse</p>
					<p className="text-xs text-zinc-400 mt-1">We'll extract your info automatically using AI</p>
				</>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Section collapse wrapper
// ---------------------------------------------------------------------------
function Section({ title, children, defaultOpen = true }) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<div className="border border-zinc-200 rounded-lg overflow-hidden">
			<button
				onClick={() => setOpen(!open)}
				className="w-full flex items-center justify-between px-4 py-2.5 bg-zinc-50 hover:bg-zinc-100 transition-colors"
			>
				<span className="text-sm font-semibold text-zinc-700">{title}</span>
				{open ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
			</button>
			{open && <div className="p-4 space-y-3">{children}</div>}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Small labeled input
// ---------------------------------------------------------------------------
function Field({ label, value, onChange, placeholder, type = "text" }) {
	return (
		<div className="flex flex-col gap-1">
			<label className="text-xs font-medium text-zinc-500">{label}</label>
			<Input
				type={type}
				value={value || ""}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				className="text-sm"
			/>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Repeatable list item (experience, education, etc.)
// ---------------------------------------------------------------------------
function ListItem({ children, onRemove }) {
	return (
		<div className="relative group border border-zinc-200 rounded-lg p-3 space-y-2">
			<button
				onClick={onRemove}
				className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-red-500"
			>
				<Trash2 className="h-3.5 w-3.5" />
			</button>
			{children}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Bullet editor (for experience bullets)
// ---------------------------------------------------------------------------
function BulletEditor({ bullets, onChange }) {
	const update = (idx, val) => {
		const next = [...bullets];
		next[idx] = val;
		onChange(next);
	};
	const add = () => onChange([...bullets, ""]);
	const remove = (idx) => onChange(bullets.filter((_, i) => i !== idx));

	return (
		<div className="space-y-1.5">
			<label className="text-xs font-medium text-zinc-500">Bullets</label>
			{bullets.map((b, i) => (
				<div key={i} className="flex gap-1.5 items-start">
					<GripVertical className="h-4 w-4 text-zinc-300 mt-2 flex-shrink-0" />
					<textarea
						value={b}
						onChange={(e) => update(i, e.target.value)}
						rows={1}
						className="flex-1 text-sm border border-zinc-200 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-300"
						style={{ minHeight: 32 }}
					/>
					<button onClick={() => remove(i)} className="text-zinc-300 hover:text-red-500 mt-1.5">
						<Trash2 className="h-3.5 w-3.5" />
					</button>
				</div>
			))}
			<button onClick={add} className="text-xs text-indigo-500 hover:text-indigo-700 flex items-center gap-1 mt-1">
				<Plus className="h-3 w-3" /> Add bullet
			</button>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Tag editor (for competencies, skill items)
// ---------------------------------------------------------------------------
function TagEditor({ tags, onChange, placeholder = "Add..." }) {
	const [input, setInput] = useState("");
	const add = () => {
		if (input.trim()) {
			onChange([...tags, input.trim()]);
			setInput("");
		}
	};
	const remove = (idx) => onChange(tags.filter((_, i) => i !== idx));

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap gap-1.5">
				{tags.map((t, i) => (
					<span key={i} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs px-2 py-1 rounded-md">
						{t}
						<button onClick={() => remove(i)} className="hover:text-red-500">&times;</button>
					</span>
				))}
			</div>
			<div className="flex gap-1.5">
				<Input
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
					placeholder={placeholder}
					className="text-sm flex-1"
				/>
				<Button variant="outline" size="sm" onClick={add}>Add</Button>
			</div>
		</div>
	);
}

// ===========================================================================
// Main CV Page
// ===========================================================================
export default function CV() {
	const [cv, setCv] = useState(EMPTY_CV);
	const [pdfUrl, setPdfUrl] = useState(null);
	const [saving, setSaving] = useState(false);
	const [compiling, setCompiling] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [saved, setSaved] = useState(false);
	const [hasData, setHasData] = useState(false);

	const [callApi] = useCallApi();
	const { getToken } = useAuth();

	// Load existing CV
	useEffect(() => {
		callApi("/cv", {
			onSuccess: (d) => {
				if (d.structuredData) {
					const parsed = typeof d.structuredData === "string" ? JSON.parse(d.structuredData) : d.structuredData;
					setCv({ ...EMPTY_CV, ...parsed });
					setHasData(true);
				}
			},
		});
	}, []);

	// Helper to update nested state
	const updateHeader = (field, value) => setCv((p) => ({ ...p, header: { ...p.header, [field]: value } }));

	const updateExperience = (idx, field, value) => {
		setCv((p) => {
			const next = [...p.experience];
			next[idx] = { ...next[idx], [field]: value };
			return { ...p, experience: next };
		});
	};

	// Save
	const save = async () => {
		setSaving(true);
		await callApi("/cv", { method: "post", json: { structuredData: cv }, success: "CV saved!" });
		setSaved(true);
		setHasData(true);
		setTimeout(() => setSaved(false), 2000);
		setSaving(false);
	};

	// Upload PDF
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

	// Compile to PDF preview
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
				alert("PDF generation failed");
			}
		} finally {
			setCompiling(false);
		}
	};

	return (
		<div className="flex flex-col h-full p-6 gap-4 overflow-hidden">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-xl font-semibold">My CV</h1>
					<p className="text-sm text-zinc-500 mt-0.5">Upload a PDF or edit your CV sections below</p>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" onClick={save} disabled={saving}>
						<Save className="h-4 w-4 mr-2" />
						{saved ? "Saved!" : saving ? "Saving..." : "Save"}
					</Button>
					<Button onClick={compile} disabled={compiling || !hasData}>
						<Eye className="h-4 w-4 mr-2" />
						{compiling ? "Generating..." : "Preview PDF"}
					</Button>
				</div>
			</div>

			{/* Main content */}
			<div className="flex gap-4 flex-1 min-h-0">
				{/* Left: editor */}
				<div className="flex-1 overflow-y-auto space-y-3 pr-1">
					{/* Upload zone */}
					<UploadZone onUpload={handleUpload} uploading={uploading} />

					{/* Contact / header */}
					<Section title="Contact Information">
						<div className="grid grid-cols-2 gap-3">
							<Field label="Full Name" value={cv.header.name} onChange={(v) => updateHeader("name", v)} placeholder="John Doe" />
							<Field label="Email" value={cv.header.email} onChange={(v) => updateHeader("email", v)} placeholder="john@example.com" />
							<Field label="Phone" value={cv.header.phone} onChange={(v) => updateHeader("phone", v)} placeholder="+1 555 000 0000" />
							<Field label="Location" value={cv.header.location} onChange={(v) => updateHeader("location", v)} placeholder="Berlin, Germany" />
							<Field label="LinkedIn URL" value={cv.header.linkedin} onChange={(v) => updateHeader("linkedin", v)} placeholder="https://linkedin.com/in/..." />
							<Field label="GitHub URL" value={cv.header.github} onChange={(v) => updateHeader("github", v)} placeholder="https://github.com/..." />
							<Field label="Portfolio URL" value={cv.header.portfolio} onChange={(v) => updateHeader("portfolio", v)} placeholder="https://yoursite.dev" />
						</div>
					</Section>

					{/* Summary */}
					<Section title="Professional Summary">
						<textarea
							value={cv.summary}
							onChange={(e) => setCv((p) => ({ ...p, summary: e.target.value }))}
							rows={3}
							placeholder="Brief professional summary (2-3 sentences)..."
							className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-300"
						/>
					</Section>

					{/* Competencies */}
					<Section title="Core Competencies" defaultOpen={false}>
						<TagEditor
							tags={cv.competencies}
							onChange={(v) => setCv((p) => ({ ...p, competencies: v }))}
							placeholder="Add a competency (e.g. Distributed Systems)"
						/>
					</Section>

					{/* Experience */}
					<Section title="Work Experience">
						{cv.experience.map((exp, i) => (
							<ListItem key={i} onRemove={() => setCv((p) => ({ ...p, experience: p.experience.filter((_, j) => j !== i) }))}>
								<div className="grid grid-cols-2 gap-2">
									<Field label="Company" value={exp.company} onChange={(v) => updateExperience(i, "company", v)} />
									<Field label="Job Title" value={exp.title} onChange={(v) => updateExperience(i, "title", v)} />
									<Field label="Period" value={exp.period} onChange={(v) => updateExperience(i, "period", v)} placeholder="Jan 2022 - Present" />
									<Field label="Location" value={exp.location} onChange={(v) => updateExperience(i, "location", v)} placeholder="Remote" />
								</div>
								<BulletEditor bullets={exp.bullets || []} onChange={(v) => updateExperience(i, "bullets", v)} />
							</ListItem>
						))}
						<Button
							variant="outline"
							size="sm"
							onClick={() => setCv((p) => ({ ...p, experience: [...p.experience, { company: "", title: "", period: "", location: "", bullets: [""] }] }))}
						>
							<Plus className="h-3.5 w-3.5 mr-1" /> Add Experience
						</Button>
					</Section>

					{/* Projects */}
					<Section title="Projects" defaultOpen={false}>
						{cv.projects.map((proj, i) => (
							<ListItem key={i} onRemove={() => setCv((p) => ({ ...p, projects: p.projects.filter((_, j) => j !== i) }))}>
								<div className="grid grid-cols-2 gap-2">
									<Field label="Name" value={proj.name} onChange={(v) => { const next = [...cv.projects]; next[i] = { ...next[i], name: v }; setCv((p) => ({ ...p, projects: next })); }} />
									<Field label="Badge" value={proj.badge} onChange={(v) => { const next = [...cv.projects]; next[i] = { ...next[i], badge: v }; setCv((p) => ({ ...p, projects: next })); }} placeholder="Open Source" />
								</div>
								<Field label="Description" value={proj.description} onChange={(v) => { const next = [...cv.projects]; next[i] = { ...next[i], description: v }; setCv((p) => ({ ...p, projects: next })); }} />
								<Field label="Tech Stack" value={proj.tech} onChange={(v) => { const next = [...cv.projects]; next[i] = { ...next[i], tech: v }; setCv((p) => ({ ...p, projects: next })); }} placeholder="Python, React, PostgreSQL" />
							</ListItem>
						))}
						<Button
							variant="outline"
							size="sm"
							onClick={() => setCv((p) => ({ ...p, projects: [...p.projects, { name: "", badge: "", description: "", tech: "" }] }))}
						>
							<Plus className="h-3.5 w-3.5 mr-1" /> Add Project
						</Button>
					</Section>

					{/* Education */}
					<Section title="Education" defaultOpen={false}>
						{cv.education.map((edu, i) => (
							<ListItem key={i} onRemove={() => setCv((p) => ({ ...p, education: p.education.filter((_, j) => j !== i) }))}>
								<div className="grid grid-cols-2 gap-2">
									<Field label="Degree" value={edu.degree} onChange={(v) => { const next = [...cv.education]; next[i] = { ...next[i], degree: v }; setCv((p) => ({ ...p, education: next })); }} />
									<Field label="Institution" value={edu.institution} onChange={(v) => { const next = [...cv.education]; next[i] = { ...next[i], institution: v }; setCv((p) => ({ ...p, education: next })); }} />
									<Field label="Year" value={edu.year} onChange={(v) => { const next = [...cv.education]; next[i] = { ...next[i], year: v }; setCv((p) => ({ ...p, education: next })); }} placeholder="2019" />
									<Field label="Description" value={edu.description} onChange={(v) => { const next = [...cv.education]; next[i] = { ...next[i], description: v }; setCv((p) => ({ ...p, education: next })); }} placeholder="Optional" />
								</div>
							</ListItem>
						))}
						<Button
							variant="outline"
							size="sm"
							onClick={() => setCv((p) => ({ ...p, education: [...p.education, { degree: "", institution: "", year: "", description: "" }] }))}
						>
							<Plus className="h-3.5 w-3.5 mr-1" /> Add Education
						</Button>
					</Section>

					{/* Certifications */}
					<Section title="Certifications" defaultOpen={false}>
						{cv.certifications.map((cert, i) => (
							<ListItem key={i} onRemove={() => setCv((p) => ({ ...p, certifications: p.certifications.filter((_, j) => j !== i) }))}>
								<div className="grid grid-cols-3 gap-2">
									<Field label="Title" value={cert.title} onChange={(v) => { const next = [...cv.certifications]; next[i] = { ...next[i], title: v }; setCv((p) => ({ ...p, certifications: next })); }} />
									<Field label="Organization" value={cert.org} onChange={(v) => { const next = [...cv.certifications]; next[i] = { ...next[i], org: v }; setCv((p) => ({ ...p, certifications: next })); }} />
									<Field label="Year" value={cert.year} onChange={(v) => { const next = [...cv.certifications]; next[i] = { ...next[i], year: v }; setCv((p) => ({ ...p, certifications: next })); }} />
								</div>
							</ListItem>
						))}
						<Button
							variant="outline"
							size="sm"
							onClick={() => setCv((p) => ({ ...p, certifications: [...p.certifications, { title: "", org: "", year: "" }] }))}
						>
							<Plus className="h-3.5 w-3.5 mr-1" /> Add Certification
						</Button>
					</Section>

					{/* Skills */}
					<Section title="Skills" defaultOpen={false}>
						{cv.skills.map((skill, i) => (
							<ListItem key={i} onRemove={() => setCv((p) => ({ ...p, skills: p.skills.filter((_, j) => j !== i) }))}>
								<Field
									label="Category"
									value={skill.category}
									onChange={(v) => { const next = [...cv.skills]; next[i] = { ...next[i], category: v }; setCv((p) => ({ ...p, skills: next })); }}
									placeholder="Languages, Frameworks, Tools..."
								/>
								<TagEditor
									tags={skill.items || []}
									onChange={(v) => { const next = [...cv.skills]; next[i] = { ...next[i], items: v }; setCv((p) => ({ ...p, skills: next })); }}
									placeholder="Add skill"
								/>
							</ListItem>
						))}
						<Button
							variant="outline"
							size="sm"
							onClick={() => setCv((p) => ({ ...p, skills: [...p.skills, { category: "", items: [] }] }))}
						>
							<Plus className="h-3.5 w-3.5 mr-1" /> Add Skill Category
						</Button>
					</Section>

					{/* Spacer at bottom for scroll comfort */}
					<div className="h-8" />
				</div>

				{/* Right: PDF preview */}
				<div className="flex-1 rounded-xl overflow-hidden border border-zinc-200 bg-zinc-50 flex flex-col">
					{pdfUrl ? (
						<iframe src={pdfUrl} className="w-full h-full border-none" title="CV Preview" />
					) : (
						<div className="flex flex-col items-center justify-center h-full text-zinc-400 gap-3">
							<FileText className="h-12 w-12 opacity-30" />
							<div className="text-center">
								<p className="text-sm font-medium">No preview yet</p>
								<p className="text-xs mt-1">Upload a PDF or fill in your details, then click Preview PDF</p>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
