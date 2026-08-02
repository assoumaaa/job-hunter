import {
	Award,
	Briefcase,
	CheckCircle2,
	ChevronsRight,
	FileDown,
	FileText,
	FolderGit2,
	GraduationCap,
	Languages,
	PanelRightClose,
	PanelRightOpen,
	Save,
	Sparkles,
	User,
	Wrench,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import CvEditor from "./CvEditor";
import CvPreview from "./CvPreview";
import SectionRail from "./SectionRail";
import { EMPTY_CV, normalizeCv, serializeForSave } from "./cvData";
import { Button } from "components/ui/button";
import { FormSkeleton } from "components/ui/skeleton";
import { Modal } from "components/ui/modal";
import { PageHeader } from "components/ui/page-header";
import { useAuth } from "@clerk/clerk-react";
import { useCallApi } from "services";
import { useSnackbar } from "notistack";

// Keep the live preview a step behind the keystrokes so typing stays snappy.
function useDebounced(value, delay = 250) {
	const [v, setV] = useState(value);
	useEffect(() => {
		const t = setTimeout(() => setV(value), delay);
		return () => clearTimeout(t);
	}, [value, delay]);
	return v;
}

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
	const [showPreview, setShowPreview] = useState(true);
	const [activeSection, setActiveSection] = useState("contact");

	const [callApi] = useCallApi();
	const { getToken } = useAuth();
	const { enqueueSnackbar } = useSnackbar();

	const debouncedCv = useDebounced(cv, 250);

	// --- Scroll-spy: rail highlights whichever section is in view; clicking a
	// rail item scrolls the editor to it. -----------------------------------
	const editorRef = useRef(null);
	const nodesRef = useRef({});
	const refCbs = useRef({});
	const register = useCallback((id) => {
		if (!refCbs.current[id]) {
			refCbs.current[id] = (node) => {
				if (node) nodesRef.current[id] = node;
				else delete nodesRef.current[id];
			};
		}
		return refCbs.current[id];
	}, []);

	const jump = useCallback((id) => {
		nodesRef.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
		setActiveSection(id);
	}, []);

	useEffect(() => {
		if (firstLoad) return;
		const root = editorRef.current;
		const nodes = Object.values(nodesRef.current);
		if (!root || !nodes.length) return;
		const obs = new IntersectionObserver(
			(entries) => {
				const visible = entries
					.filter((e) => e.isIntersecting)
					.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
				if (visible[0]) setActiveSection(visible[0].target.dataset.sectionId);
			},
			{ root, rootMargin: "0px 0px -65% 0px", threshold: 0 },
		);
		nodes.forEach((n) => obs.observe(n));
		return () => obs.disconnect();
	}, [firstLoad]);

	// --- Load ---------------------------------------------------------------
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

	// --- Save / upload / compile -------------------------------------------
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
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setShowPreview((s) => !s)}
							className="hidden lg:inline-flex"
						>
							{showPreview ? (
								<PanelRightClose className="h-3.5 w-3.5" />
							) : (
								<PanelRightOpen className="h-3.5 w-3.5" />
							)}
							{showPreview ? "Hide preview" : "Show preview"}
						</Button>
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

			<div className="flex min-h-0 flex-1">
				<SectionRail sections={sections} activeId={activeSection} onJump={jump} />

				<div ref={editorRef} className="min-w-0 flex-1 overflow-y-auto">
					<div className="mx-auto w-full max-w-[860px] p-4 sm:p-5">
						{firstLoad ? (
							<FormSkeleton fields={6} />
						) : (
							<CvEditor
								cv={cv}
								setCv={setCv}
								uploading={uploading}
								onUpload={handleUpload}
								register={register}
							/>
						)}
					</div>
				</div>

				{showPreview && (
					<aside className="hidden lg:flex w-[440px] shrink-0 flex-col border-l border-zinc-100 bg-zinc-50">
						<div className="flex h-11 shrink-0 items-center gap-2 border-b border-zinc-100 bg-white/60 px-4">
							<span className="text-[12px] font-semibold text-zinc-700">Live preview</span>
							<span className="text-[11px] text-zinc-400">approximation</span>
							<button
								onClick={() => setShowPreview(false)}
								title="Hide preview"
								className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
							>
								<ChevronsRight className="h-4 w-4" />
							</button>
						</div>
						<div className="flex-1 overflow-y-auto p-4">
							<CvPreview cv={debouncedCv} />
						</div>
					</aside>
				)}
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
