import { ArrowLeft, RotateCcw, Send, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSnackbar } from "notistack";

import { Button } from "components/ui/button";
import { PageHeader } from "components/ui/page-header";
import { useCallApi } from "services";

const SUGGESTIONS = {
	cv: [
		"Shorten the summary",
		"Make the bullets more punchy and metric-driven",
		"Reorder skills so Python comes first",
	],
	cl: [
		"Make it shorter — under 200 words",
		"Open with a stronger hook",
		"Make the tone more confident",
	],
};

function parseCv(value) {
	if (!value) return null;
	if (typeof value === "object") return value;
	try { return JSON.parse(value); } catch { return null; }
}

export default function TweakJob() {
	const { jobId } = useParams();
	const navigate = useNavigate();
	const { enqueueSnackbar } = useSnackbar();
	const [callApi] = useCallApi();

	const [job, setJob] = useState(null);
	const [contact, setContact] = useState(null);
	const [cv, setCv] = useState(null);          // parsed CV JSON
	const [cl, setCl] = useState("");            // CL text
	const [hasOriginal, setHasOriginal] = useState(false);
	const [activeTab, setActiveTab] = useState("cv");
	const [prompt, setPrompt] = useState("");
	const [tweaking, setTweaking] = useState(false);
	const [previewUrl, setPreviewUrl] = useState(null);
	const [previewLoading, setPreviewLoading] = useState(false);
	const prevBlobRef = useRef(null);

	// Load job + profile contact on mount
	useEffect(() => {
		callApi("/jobs", {
			onSuccess: (jobs) => {
				const found = jobs.find((j) => j.id === jobId);
				if (!found) {
					enqueueSnackbar("Job not found", { variant: "error" });
					navigate("/jobs");
					return;
				}
				setJob(found);
				setCv(parseCv(found.generatedCv));
				setCl(found.generatedCl || "");
				setHasOriginal(Boolean(found.originalCv || found.originalCl));
			},
			error: "Failed to load job",
		});
		callApi("/profile", {
			onSuccess: (d) => setContact({
				name: d.fullName ?? "",
				location: d.currentLocation ?? "",
				linkedinUrl: d.linkedinUrl ?? "",
				githubUrl: d.githubUrl ?? "",
			}),
			suppressError: true,
		});
	}, [jobId]);

	// Re-render PDF preview whenever the active content changes
	const renderPreview = useCallback(() => {
		if (activeTab === "cv" && cv) {
			setPreviewLoading(true);
			callApi("/cv/compile?trim=false", {
				method: "POST",
				json: { structuredData: cv },
				responseType: "blob",
				error: "CV preview render failed",
				onSuccess: (blob) => {
					const url = URL.createObjectURL(blob);
					if (prevBlobRef.current) URL.revokeObjectURL(prevBlobRef.current);
					prevBlobRef.current = url;
					setPreviewUrl(url);
				},
			}).finally(() => setPreviewLoading(false));
		} else if (activeTab === "cl" && cl) {
			setPreviewLoading(true);
			callApi("/cv/compile-cl", {
				method: "POST",
				json: { text: cl, contact },
				responseType: "blob",
				error: "Cover letter preview render failed",
				onSuccess: (blob) => {
					const url = URL.createObjectURL(blob);
					if (prevBlobRef.current) URL.revokeObjectURL(prevBlobRef.current);
					prevBlobRef.current = url;
					setPreviewUrl(url);
				},
			}).finally(() => setPreviewLoading(false));
		} else {
			setPreviewUrl(null);
		}
	}, [activeTab, cv, cl, contact, callApi]);

	useEffect(() => {
		renderPreview();
	}, [renderPreview]);

	// Cleanup blob on unmount
	useEffect(() => () => {
		if (prevBlobRef.current) URL.revokeObjectURL(prevBlobRef.current);
	}, []);

	const handleTweak = () => {
		const trimmed = prompt.trim();
		if (!trimmed || tweaking) return;
		setTweaking(true);
		callApi(`/jobs/${jobId}/tweak`, {
			method: "POST",
			json: { target: activeTab, prompt: trimmed },
			error: "Tweak failed",
			onSuccess: (resp) => {
				if (resp.generatedCv) setCv(parseCv(resp.generatedCv));
				if (resp.generatedCl != null) setCl(resp.generatedCl || "");
				setHasOriginal(resp.hasOriginal);
				setPrompt("");
				enqueueSnackbar("Applied", { variant: "success" });
			},
		}).finally(() => setTweaking(false));
	};

	const handleReset = () => {
		if (!hasOriginal) return;
		callApi(`/jobs/${jobId}/reset-tweaks`, {
			method: "POST",
			json: {},
			error: "Reset failed",
			onSuccess: (resp) => {
				if (resp.generatedCv) setCv(parseCv(resp.generatedCv));
				if (resp.generatedCl != null) setCl(resp.generatedCl || "");
				enqueueSnackbar("Reset to original", { variant: "success" });
			},
		});
	};

	const handleDownload = () => {
		if (!previewUrl) return;
		const a = document.createElement("a");
		a.href = previewUrl;
		const safeCompany = (job?.company || "doc").replace(/\s+/g, "_");
		a.download = `${safeCompany}_${activeTab.toUpperCase()}.pdf`;
		a.click();
	};

	const onPromptKeyDown = (e) => {
		if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			handleTweak();
		}
	};

	const headerSubtitle = useMemo(() => {
		if (!job) return "";
		return `${job.title} · ${job.company}`;
	}, [job]);

	if (!job) {
		return (
			<div className="flex flex-col h-full overflow-hidden">
				<PageHeader title="Tweak document" />
				<div className="flex-1 flex items-center justify-center text-zinc-400 text-sm">Loading…</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full overflow-hidden">
			<PageHeader
				title="Tweak document"
				subtitle={headerSubtitle}
				actions={
					<>
						<Button variant="ghost" size="sm" onClick={() => navigate("/jobs")}>
							<ArrowLeft className="h-3.5 w-3.5" />
							Back
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={handleReset}
							disabled={!hasOriginal || tweaking}
							title={hasOriginal ? "Restore the originally generated version" : "Nothing to reset"}
						>
							<RotateCcw className="h-3.5 w-3.5" />
							Reset to original
						</Button>
						<Button variant="outline" size="sm" onClick={handleDownload} disabled={!previewUrl}>
							Download
						</Button>
					</>
				}
			/>

			{/* Tab switcher */}
			<div className="flex items-center gap-1 px-6 py-2 border-b border-zinc-100 bg-zinc-50/40">
				{[
					{ key: "cv", label: "CV",            hasContent: Boolean(cv) },
					{ key: "cl", label: "Cover Letter",  hasContent: Boolean(cl) },
				].map((t) => (
					<button
						key={t.key}
						onClick={() => setActiveTab(t.key)}
						disabled={!t.hasContent}
						className={`px-3 h-8 rounded-md text-[12px] font-medium transition-colors ${
							activeTab === t.key
								? "bg-white ring-1 ring-zinc-200 text-zinc-900 shadow-sm"
								: t.hasContent
									? "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100"
									: "text-zinc-300 cursor-not-allowed"
						}`}
					>
						{t.label}
					</button>
				))}
			</div>

			{/* Preview + prompt */}
			<div className="flex-1 flex flex-col overflow-hidden">
				<div className="flex-1 min-h-0 bg-zinc-100 relative">
					{previewUrl && (
						<iframe
							key={previewUrl}
							src={previewUrl}
							title="preview"
							className="w-full h-full border-0 bg-white"
						/>
					)}
					{previewLoading && (
						<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
							<span className="inline-flex items-center gap-2 text-xs text-zinc-600 bg-white/90 backdrop-blur px-3 py-1.5 rounded-full shadow-sm ring-1 ring-zinc-200">
								<span className="h-1.5 w-1.5 rounded-full bg-indigo-500" style={{ animation: "pulse 1.2s ease-in-out infinite" }} />
								Rendering…
							</span>
						</div>
					)}
					{!previewUrl && !previewLoading && (
						<div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-400">
							{activeTab === "cv" ? "No CV generated for this job yet" : "No cover letter generated for this job yet"}
						</div>
					)}
				</div>

				<div className="border-t border-zinc-200 bg-white p-3 shrink-0">
					<div className="flex items-start gap-2">
						<div className="flex-1">
							<textarea
								value={prompt}
								onChange={(e) => setPrompt(e.target.value)}
								onKeyDown={onPromptKeyDown}
								disabled={tweaking}
								placeholder={
									activeTab === "cv"
										? "Tell me what to change. E.g. 'shorten the Odoo bullets' or 'add a bullet about my Python work'"
										: "Tell me what to change. E.g. 'make it shorter' or 'open with a stronger hook'"
								}
								rows={2}
								className="w-full resize-none rounded-md border border-zinc-200 px-3 py-2 text-[13px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/5 disabled:opacity-60"
							/>
							<div className="flex flex-wrap items-center gap-1.5 mt-1.5">
								<span className="text-[10.5px] text-zinc-400 font-medium">Try:</span>
								{SUGGESTIONS[activeTab].map((s) => (
									<button
										key={s}
										onClick={() => setPrompt(s)}
										disabled={tweaking}
										className="text-[10.5px] text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 px-1.5 py-0.5 rounded transition-colors disabled:opacity-40"
									>
										{s}
									</button>
								))}
								<span className="ml-auto text-[10.5px] text-zinc-400">⌘+Enter</span>
							</div>
						</div>
						<Button
							variant="primary"
							onClick={handleTweak}
							disabled={!prompt.trim() || tweaking}
							className="h-[68px] px-4"
						>
							{tweaking ? (
								<>
									<Sparkles className="h-3.5 w-3.5 animate-pulse" />
									Tweaking…
								</>
							) : (
								<>
									<Send className="h-3.5 w-3.5" />
									Send
								</>
							)}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
