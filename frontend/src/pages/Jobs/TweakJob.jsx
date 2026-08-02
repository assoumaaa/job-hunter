import { ArrowLeft, RotateCcw, Send, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Button } from "components/ui/button";
import { PageHeader } from "components/ui/page-header";
import { Textarea } from "components/ui/input";
import { useCallApi } from "services";
import { useSnackbar } from "notistack";

const SUGGESTIONS = {
	cv: [
		"Shorten the summary",
		"Make the bullets more punchy and metric-driven",
		"Reorder skills so Python comes first",
	],
	cl: ["Make it shorter, under 200 words", "Open with a stronger hook", "Make the tone more confident"],
};

const TAB_DEFS = [
	{ key: "cv", label: "CV" },
	{ key: "cl", label: "Cover Letter" },
];

function parseCv(value) {
	if (!value) return null;
	if (typeof value === "object") return value;
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

function parseHistory(value) {
	if (!value) return [];
	if (Array.isArray(value)) return value;
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

export default function TweakJob() {
	const { jobId } = useParams();
	const navigate = useNavigate();
	const { enqueueSnackbar } = useSnackbar();
	const [callApi] = useCallApi();

	const [job, setJob] = useState(null);
	const [contact, setContact] = useState(null);
	const [cv, setCv] = useState(null); // parsed CV JSON
	const [cl, setCl] = useState(""); // CL text
	const [hasOriginal, setHasOriginal] = useState(false);
	const [activeTab, setActiveTab] = useState("cv");
	const [messagesCv, setMessagesCv] = useState([]); // [{role, content}]
	const [messagesCl, setMessagesCl] = useState([]);
	const [prompt, setPrompt] = useState("");
	const [tweaking, setTweaking] = useState(false);
	const [previewUrl, setPreviewUrl] = useState(null);
	const [previewLoading, setPreviewLoading] = useState(false);
	const prevBlobRef = useRef(null);
	const transcriptRef = useRef(null);

	const messages = activeTab === "cv" ? messagesCv : messagesCl;

	// Load job + profile contact on mount
	useEffect(() => {
		callApi(`/jobs/${jobId}`, {
			suppressError: true,
			onSuccess: (found) => {
				setJob(found);
				setCv(parseCv(found.generatedCv));
				setCl(found.generatedCl || "");
				setHasOriginal(Boolean(found.originalCv || found.originalCl));
				setMessagesCv(parseHistory(found.chatCv));
				setMessagesCl(parseHistory(found.chatCl));
			},
			onError: () => {
				enqueueSnackbar("Job not found", { variant: "error" });
				navigate("/jobs");
			},
		});
		callApi("/profile", {
			onSuccess: (d) =>
				setContact({
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

	// Keep the transcript pinned to the latest message
	useEffect(() => {
		const el = transcriptRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [messages, tweaking, activeTab]);

	// Cleanup blob on unmount
	useEffect(
		() => () => {
			if (prevBlobRef.current) URL.revokeObjectURL(prevBlobRef.current);
		},
		[],
	);

	const handleTweak = () => {
		const trimmed = prompt.trim();
		if (!trimmed || tweaking) return;
		const isCv = activeTab === "cv";
		const prev = isCv ? messagesCv : messagesCl;
		const applyMessages = isCv ? setMessagesCv : setMessagesCl;
		// Optimistically show the user's turn
		applyMessages([...prev, { role: "user", content: trimmed }]);
		setPrompt("");
		setTweaking(true);
		callApi(`/jobs/${jobId}/tweak`, {
			method: "POST",
			json: { target: activeTab, prompt: trimmed },
			error: "Tweak failed",
			onSuccess: (resp) => {
				// Server transcript is authoritative (includes the assistant reply)
				if (resp.history) applyMessages(parseHistory(resp.history));
				else if (resp.message)
					applyMessages([
						...prev,
						{ role: "user", content: trimmed },
						{ role: "assistant", content: resp.message },
					]);
				if (resp.generatedCv) setCv(parseCv(resp.generatedCv));
				if (resp.generatedCl != null) setCl(resp.generatedCl || "");
				setHasOriginal(resp.hasOriginal);
			},
			onError: () => {
				// Roll back the optimistic turn on failure
				applyMessages(prev);
				setPrompt(trimmed);
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

	// APG tabs: arrows move focus and selection together.
	const onTabKeyDown = (e) => {
		const idx = TAB_DEFS.findIndex((t) => t.key === activeTab);
		let next = null;
		if (e.key === "ArrowRight") next = TAB_DEFS[(idx + 1) % TAB_DEFS.length];
		if (e.key === "ArrowLeft") next = TAB_DEFS[(idx - 1 + TAB_DEFS.length) % TAB_DEFS.length];
		if (next) {
			e.preventDefault();
			setActiveTab(next.key);
			document.getElementById(`tweak-tab-${next.key}`)?.focus();
		}
	};

	const headerSubtitle = useMemo(() => {
		if (!job) return "";
		return `${job.title} · ${job.company}`;
	}, [job]);

	if (!job) {
		return (
			<div className="flex flex-col h-full overflow-hidden">
				<PageHeader title="Edit document" />
				<div className="flex-1 flex items-center justify-center text-ink-3 text-body" role="status">
					Loading…
				</div>
			</div>
		);
	}

	const hasContent = { cv: Boolean(cv), cl: Boolean(cl) };

	return (
		<div className="flex flex-col h-full overflow-hidden">
			<PageHeader
				title="Edit document"
				subtitle={headerSubtitle}
				actions={
					<>
						<Button variant="ghost" size="sm" onClick={() => navigate("/jobs")}>
							<ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
							Back
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={handleReset}
							disabled={!hasOriginal || tweaking}
							title={hasOriginal ? "Restore the originally generated version" : "Nothing to reset"}
						>
							<RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
							Reset to original
						</Button>
						<Button variant="outline" size="sm" onClick={handleDownload} disabled={!previewUrl}>
							Download
						</Button>
					</>
				}
			/>

			{/* Tab switcher */}
			<div
				className="flex items-center gap-1 px-6 py-2 border-b border-line bg-canvas/60"
				role="tablist"
				aria-label="Document"
			>
				{TAB_DEFS.map((t) => (
					<button
						key={t.key}
						id={`tweak-tab-${t.key}`}
						type="button"
						role="tab"
						aria-selected={activeTab === t.key}
						aria-controls="tweak-tabpanel"
						tabIndex={activeTab === t.key ? 0 : -1}
						onClick={() => setActiveTab(t.key)}
						onKeyDown={onTabKeyDown}
						disabled={!hasContent[t.key]}
						className={`px-3 h-8 rounded-lg text-label font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 ${
							activeTab === t.key
								? "bg-surface ring-1 ring-line text-ink shadow-raised"
								: hasContent[t.key]
									? "text-ink-2 hover:text-ink hover:bg-muted"
									: "text-ink-3 cursor-not-allowed"
						}`}
					>
						{t.label}
					</button>
				))}
			</div>

			{/* Preview (left) + chat (right) */}
			<div id="tweak-tabpanel" role="tabpanel" aria-labelledby={`tweak-tab-${activeTab}`} className="flex-1 flex overflow-hidden">
				<div className="flex-1 min-h-0 bg-canvas relative">
					{previewUrl && (
						<iframe
							key={previewUrl}
							src={previewUrl}
							title="Document preview"
							className="w-full h-full border-0 bg-white"
						/>
					)}
					{previewLoading && (
						<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
							<span
								role="status"
								className="inline-flex items-center gap-2 text-label text-ink bg-surface/90 backdrop-blur px-3 py-1.5 rounded-full shadow-raised ring-1 ring-line"
							>
								<span className="h-1.5 w-1.5 rounded-full bg-accent pulse-dot" />
								Rendering…
							</span>
						</div>
					)}
					{!previewUrl && !previewLoading && (
						<div className="absolute inset-0 flex items-center justify-center text-body text-ink-3">
							{activeTab === "cv"
								? "No CV generated for this job yet"
								: "No cover letter generated for this job yet"}
						</div>
					)}
				</div>

				{/* Chat panel */}
				<div className="w-[380px] shrink-0 border-l border-line bg-surface flex flex-col min-h-0">
					<div
						ref={transcriptRef}
						role="log"
						aria-live="polite"
						aria-label="Edit conversation"
						className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-3"
					>
						{messages.length === 0 && !tweaking && (
							<div className="h-full flex flex-col items-center justify-center text-center px-4">
								<Sparkles className="h-5 w-5 text-ink-3 mb-2" aria-hidden="true" />
								<p className="text-body text-ink-2 font-medium">
									Chat to edit your {activeTab === "cv" ? "CV" : "cover letter"}
								</p>
								<p className="text-micro text-ink-3 mt-1 leading-relaxed">
									Ask for changes in plain English. I'll ask before inventing anything and apply what
									your CV supports.
								</p>
							</div>
						)}
						{messages.map((m, i) => (
							<div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
								<div
									className={`max-w-[85%] rounded-2xl px-3 py-2 text-label leading-relaxed whitespace-pre-wrap ${
										m.role === "user"
											? "bg-accent-solid text-white rounded-br-sm"
											: "bg-muted text-ink rounded-bl-sm"
									}`}
								>
									{m.content}
								</div>
							</div>
						))}
						{tweaking && (
							<div className="flex justify-start">
								<div className="bg-muted text-ink-2 rounded-2xl rounded-bl-sm px-3 py-2 text-label inline-flex items-center gap-2">
									<Sparkles className="h-3.5 w-3.5 motion-safe:animate-pulse" aria-hidden="true" />
									Thinking…
								</div>
							</div>
						)}
					</div>

					<div className="border-t border-line p-3 shrink-0">
						<Textarea
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							onKeyDown={onPromptKeyDown}
							disabled={tweaking}
							aria-label="Editing instruction"
							placeholder={
								activeTab === "cv"
									? "Tell me what to change. E.g. 'lead each bullet with the decision, not the tech'"
									: "Tell me what to change. E.g. 'make it shorter' or 'open with a stronger hook'"
							}
							rows={3}
							className="resize-none disabled:opacity-60"
						/>
						<div className="flex flex-wrap items-center gap-1.5 mt-1.5">
							<span className="text-micro text-ink-3 font-medium">Try:</span>
							{SUGGESTIONS[activeTab].map((s) => (
								<button
									key={s}
									type="button"
									onClick={() => setPrompt(s)}
									disabled={tweaking}
									className="text-micro text-ink-2 hover:text-ink hover:bg-muted px-1.5 py-0.5 rounded transition-colors disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1"
								>
									{s}
								</button>
							))}
						</div>
						<div className="flex items-center justify-between mt-2">
							<span className="text-micro text-ink-3">⌘+Enter to send</span>
							<Button
								variant="primary"
								size="sm"
								onClick={handleTweak}
								disabled={!prompt.trim() || tweaking}
							>
								<Send className="h-3.5 w-3.5" aria-hidden="true" />
								Send
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
