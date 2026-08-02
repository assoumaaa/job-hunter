import { FileText } from "lucide-react";

import { bulletText, hasCondition } from "./cvData";
import { EmptyState } from "components/ui/empty-state";

// Serif stack approximating the PDF's Computer Modern (CMU Serif) — that font
// isn't on the web, so this is the closest common fallback.
const SERIF = "'Times New Roman', Georgia, 'DejaVu Serif', serif";

function SectionBlock({ title, children }) {
	return (
		<div className="mb-3">
			<div className="mb-1.5 border-b border-black pb-[1px] text-[12.5px] font-bold text-black">{title}</div>
			{children}
		</div>
	);
}

// Live, client-side approximation of the compiled résumé PDF. Section order and
// styling mirror templates/cv-template.html + pdf_generator.py. Conditional
// bullets are all shown (the base CV is the master) with a subtle violet dot.
export default function CvPreview({ cv }) {
	const h = cv.header || {};

	const skills = (cv.skills || []).filter((s) => s.category || (s.items || []).length);
	const competencies = (cv.competencies || []).filter(Boolean);
	const experience = (cv.experience || []).filter(
		(j) => j.company || j.title || j.period || (j.bullets || []).some((b) => bulletText(b).trim()),
	);
	const projects = (cv.projects || []).filter((p) => p.name || p.description || p.tech);
	const education = (cv.education || []).filter((e) => e.degree || e.institution || e.year);
	const certifications = (cv.certifications || []).filter((c) => c.title || c.org || c.year);
	const languages = (cv.languages || []).filter((l) => l.name);

	const hasContent =
		h.name ||
		cv.summary ||
		skills.length ||
		competencies.length ||
		experience.length ||
		projects.length ||
		education.length ||
		certifications.length ||
		languages.length;

	if (!hasContent) {
		return (
			<EmptyState
				icon={FileText}
				title="Nothing to preview yet"
				description="Fill in your details or upload a PDF — your résumé takes shape here as you type."
			/>
		);
	}

	return (
		<div
			className="mx-auto w-full max-w-[680px] rounded-sm bg-white px-9 py-8 text-black shadow-[0_1px_3px_rgba(0,0,0,0.12)] ring-1 ring-black/5"
			style={{ fontFamily: SERIF }}
		>
			{/* Header */}
			<div className="mb-2.5 flex items-start justify-between gap-4">
				<div className="min-w-0">
					<h1 className="text-[20px] font-bold leading-tight text-black">{h.name || "Your Name"}</h1>
					{h.location && <div className="text-[11px] text-black">{h.location}</div>}
				</div>
				<div className="shrink-0 text-right text-[11px] leading-snug text-black">
					{h.email && <div>Email: {h.email}</div>}
					{h.phone && <div>Mobile: {h.phone}</div>}
				</div>
			</div>

			{cv.summary && (
				<SectionBlock title="Summary">
					<p className="text-[11.5px] leading-relaxed text-black">{cv.summary}</p>
				</SectionBlock>
			)}

			{skills.length > 0 && (
				<SectionBlock title="Skills">
					<ul className="list-disc space-y-0.5 pl-5 text-[11.5px] text-black marker:text-black">
						{skills.map((s, i) => (
							<li key={i}>
								{s.category && <span className="font-bold">{s.category}: </span>}
								{(s.items || []).join(", ")}
							</li>
						))}
					</ul>
				</SectionBlock>
			)}

			{competencies.length > 0 && (
				<SectionBlock title="Core competencies">
					<ul className="list-disc space-y-0.5 pl-5 text-[11.5px] text-black marker:text-black">
						{competencies.map((c, i) => (
							<li key={i}>{c}</li>
						))}
					</ul>
				</SectionBlock>
			)}

			{experience.length > 0 && (
				<SectionBlock title="Experience">
					<div className="space-y-2.5">
						{experience.map((job, i) => (
							<div key={i}>
								<div className="flex items-baseline justify-between gap-3">
									<span className="text-[11.5px] font-bold text-black">{job.company}</span>
									<span className="text-[11.5px] text-black">{job.location}</span>
								</div>
								<div className="flex items-baseline justify-between gap-3">
									<span className="text-[11.5px] italic text-black">{job.title}</span>
									<span className="whitespace-nowrap text-[11.5px] italic text-black">{job.period}</span>
								</div>
								<ul className="mt-0.5 list-disc space-y-0.5 pl-5 marker:text-black">
									{(job.bullets || [])
										.filter((b) => bulletText(b).trim())
										.map((b, j) => (
											<li key={j} className="text-[11.5px] leading-snug text-black">
												<span>{bulletText(b)}</span>
												{hasCondition(b) && (
													<span
														title={`Conditional — shown when: ${b.condition}`}
														className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-violet-400 align-middle"
													/>
												)}
											</li>
										))}
								</ul>
							</div>
						))}
					</div>
				</SectionBlock>
			)}

			{projects.length > 0 && (
				<SectionBlock title="Projects">
					<div className="space-y-1.5">
						{projects.map((p, i) => (
							<div key={i}>
								<div className="text-[11.5px] text-black">
									<span className="font-bold">{p.name}</span>
									{p.badge && <span className="ml-1 text-[10.5px]">({p.badge})</span>}
								</div>
								{p.description && <div className="text-[11.5px] text-black">{p.description}</div>}
								{p.tech && <div className="text-[10.5px] italic text-zinc-600">{p.tech}</div>}
							</div>
						))}
					</div>
				</SectionBlock>
			)}

			{education.length > 0 && (
				<SectionBlock title="Education">
					<div className="space-y-1">
						{education.map((e, i) => (
							<div key={i}>
								<div className="flex items-baseline justify-between gap-3">
									<span className="text-[11.5px] font-bold text-black">{e.institution}</span>
									<span className="text-[11.5px] text-black">{e.location}</span>
								</div>
								<div className="flex items-baseline justify-between gap-3">
									<span className="text-[11.5px] italic text-black">{e.degree}</span>
									<span className="text-[11.5px] italic text-black">{e.year}</span>
								</div>
								{e.description && <div className="text-[10.5px] text-zinc-600">{e.description}</div>}
							</div>
						))}
					</div>
				</SectionBlock>
			)}

			{certifications.length > 0 && (
				<SectionBlock title="Certifications">
					<div className="space-y-0.5">
						{certifications.map((c, i) => (
							<div key={i} className="flex items-baseline justify-between gap-3">
								<span className="text-[11.5px] text-black">
									{c.title}
									{c.org && ` (${c.org})`}
								</span>
								<span className="text-[11.5px] italic text-black">{c.year}</span>
							</div>
						))}
					</div>
				</SectionBlock>
			)}

			{languages.length > 0 && (
				<SectionBlock title="Languages">
					<div className="text-[11.5px] text-black">
						{languages.map((l, i) => (
							<span key={i}>
								{i > 0 && ", "}
								<strong className="font-bold">{l.name}</strong>
								{l.level && ` (${l.level})`}
							</span>
						))}
					</div>
				</SectionBlock>
			)}
		</div>
	);
}
