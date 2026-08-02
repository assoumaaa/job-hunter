import {
	Award,
	Briefcase,
	CheckCircle2,
	FileDown,
	FileText,
	FolderGit2,
	GraduationCap,
	Languages,
	Save,
	Sparkles,
	User,
	Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";

import CvEditor from "./CvEditor";
import { EMPTY_CV, normalizeCv, serializeForSave } from "./cvData";
import { Button } from "components/ui/button";
import { FormSkeleton } from "components/ui/skeleton";
import { Modal } from "components/ui/modal";
import { PageHeader } from "components/ui/page-header";
import { useAuth } from "@clerk/clerk-react";
import { useCallApi } from "services";
import { useSnackbar } from "notistack";

export default function CV() {
	const [cv, setCv] = useState(EMPTY_CV);
	const [pdfUrl, setPdfUrl] = useState(null);
	const [pdfOpen, setPdfOpen] = useState(false);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [compiling, setCompiling] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [hasData, setHasData] = useState(false);
	const [firstLoad, setFirstLoad] = useState(true);
	const [activeSection, setActiveSection] = useState("contact");

	const [callApi] = useCallApi();
	const { getToken } = useAuth();
	const { enqueueSnackbar } = useSnackbar();

	useEffect(() => {
		callApi("/cv", {
			onSuccess: (d) => {
				if (d.structuredData) {
					const parsed =
						typeof d.structuredData === "string" ? JSON.parse(d.structuredData) : d.structuredData;
					setCv(normalizeCv(parsed));
					setHasData(true);
				}
				setFirstLoad(false);
			},
			onError: () => setFirstLoad(false),
		});
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	const save = async () => {
		setSaving(true);
		await callApi("/cv", { method: "post", json: { structuredData: serializeForSave(cv) }, success: "CV saved" });
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
				setCv(normalizeCv(data.structuredData));
				setHasData(true);
			} else {
				const err = await resp.text();
				enqueueSnackbar(`Upload failed: ${err}`, { variant: "error" });
			}
		} catch {
			enqueueSnackbar("Upload failed, please try again", { variant: "error" });
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
				body: JSON.stringify({ structuredData: serializeForSave(cv) }),
			});
			if (resp.ok) {
				const blob = await resp.blob();
				setPdfUrl(URL.createObjectURL(blob));
				setPdfOpen(true);
			} else {
				let detail = `${resp.status} ${resp.statusText}`;
				try {
					const body = await resp.json();
					if (body?.detail) detail = body.detail;
				} catch {
					/* body wasn't JSON */
				}
				enqueueSnackbar(`PDF generation failed: ${detail}`, { variant: "error" });
			}
		} finally {
			setCompiling(false);
		}
	};

	const sections = [
		{ id: "contact", label: "Contact", icon: User },
		{ id: "summary", label: "Summary", icon: FileText },
		{ id: "competencies", label: "Core competencies", icon: Sparkles, count: cv.competencies.length },
		{ id: "experience", label: "Work experience", icon: Briefcase, count: cv.experience.length },
		{ id: "projects", label: "Projects", icon: FolderGit2, count: cv.projects.length },
		{ id: "education", label: "Education", icon: GraduationCap, count: cv.education.length },
		{ id: "certifications", label: "Certifications", icon: Award, count: cv.certifications.length },
		{ id: "skills", label: "Skills", icon: Wrench, count: cv.skills.length },
		{ id: "languages", label: "Languages", icon: Languages, count: cv.languages.length },
	];

	return (
		<div className="flex h-full flex-col overflow-hidden">
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
							<FileDown className="h-3.5 w-3.5" />
							{compiling ? "Generating…" : "Preview PDF"}
						</Button>
					</>
				}
			/>

			{/* Section tabs */}
			<div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-zinc-100 px-4 sm:px-6">
				{sections.map((s) => {
					const Icon = s.icon;
					const active = activeSection === s.id;
					return (
						<button
							key={s.id}
							type="button"
							onClick={() => setActiveSection(s.id)}
							className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors ${
								active ? "border-violet-500 text-violet-700" : "border-transparent text-zinc-500 hover:text-zinc-800"
							}`}
						>
							<Icon className="h-3.5 w-3.5" />
							{s.label}
							{s.count != null && (
								<span
									className={`ml-0.5 rounded-full px-1.5 text-[11px] leading-5 ${
										active ? "bg-violet-100 text-violet-700" : "bg-zinc-100 text-zinc-500"
									}`}
								>
									{s.count}
								</span>
							)}
						</button>
					);
				})}
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto w-full max-w-[860px] p-4 sm:p-6">
					{firstLoad ? (
						<FormSkeleton fields={6} />
					) : (
						<CvEditor
							cv={cv}
							setCv={setCv}
							uploading={uploading}
							onUpload={handleUpload}
							activeSection={activeSection}
						/>
					)}
				</div>
			</div>

			<Modal open={pdfOpen} onClose={() => setPdfOpen(false)} title="Résumé PDF" icon={FileText} width={900}>
				{pdfUrl ? (
					<iframe src={pdfUrl} title="CV PDF" className="h-[76vh] w-full rounded-lg border border-zinc-200" />
				) : (
					<div className="flex h-[76vh] items-center justify-center text-[13px] text-zinc-400">
						No PDF generated yet.
					</div>
				)}
			</Modal>
		</div>
	);
}
