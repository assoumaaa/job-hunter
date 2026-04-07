import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";
import { Bolt as BoltIcon, FileText, RefreshCw, RotateCcw, ScanSearch, Trash2 } from "lucide-react";
import { useCallApi, useLoading } from "services";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AgGridReact } from "ag-grid-react";
import { Button } from "components/ui/button";
import { Input } from "components/ui/input";
import { useSnackbar } from "notistack";

ModuleRegistry.registerModules([AllCommunityModule]);

const gridTheme = themeQuartz.withParams({
	fontSize: 13,
	rowHeight: 52,
	headerHeight: 36,
	fontFamily: "Inter, sans-serif",
	selectedRowBackgroundColor: "oklch(0.93 0.034 272.788)",
	columnBorder: false,
	rowBorder: { color: "#f4f4f5", width: 1 },
	oddRowBackgroundColor: "#fafafa",
	headerBackgroundColor: "#ffffff",
	headerTextColor: "#a1a1aa",
	headerFontWeight: 500,
	headerFontSize: 11,
});

function StatusChip({ value, options, colorMap, onChange }) {
	return (
		<select
			className={colorMap[value] ?? colorMap.__default}
			value={value}
			onChange={(e) => onChange(e.target.value)}
			style={{
				fontSize: 12,
				fontWeight: 500,
				padding: "2px 8px",
				borderRadius: 999,
				border: "none",
				cursor: "pointer",
				background: "transparent",
			}}
		>
			{options.map((o) => (
				<option key={o.value} value={o.value}>
					{o.label}
				</option>
			))}
		</select>
	);
}

const RELEVANCE_OPTIONS = [
	{ value: "unscreened", label: "?" },
	{ value: "good_fit", label: "Good" },
	{ value: "maybe", label: "Maybe" },
	{ value: "irrelevant", label: "No" },
];
const RELEVANCE_COLORS = {
	unscreened: "bg-zinc-100 text-zinc-400",
	good_fit: "bg-green-100 text-green-700",
	maybe: "bg-yellow-100 text-yellow-700",
	irrelevant: "bg-red-100 text-red-600",
};


const APP_OPTIONS = [
	{ value: "new", label: "New" },
	{ value: "applied", label: "Applied" },
	{ value: "interview", label: "Interview" },
	{ value: "offer", label: "Offer" },
	{ value: "rejected", label: "Rejected" },
];
const APP_COLORS = {
	new: "bg-zinc-100 text-zinc-600",
	applied: "bg-blue-100 text-blue-700",
	interview: "bg-purple-100 text-purple-700",
	offer: "bg-green-100 text-green-700",
	rejected: "bg-red-100 text-red-700",
};

const selectCls =
	"h-8 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-400 cursor-pointer disabled:opacity-40";

function AtsScoreCell({ value }) {
	if (value == null) return <span style={{ color: "#a1a1aa", fontSize: 12 }}>—</span>;
	const color = value >= 85 ? "#16a34a" : value >= 70 ? "#ca8a04" : "#dc2626";
	return <span style={{ fontWeight: 600, fontSize: 13, color }}>{value}</span>;
}

function DocChip({ value, label, contact }) {
	const [loading, setLoading] = useState(false);
	const [callApi] = useCallApi();

	const ready = Boolean(value);

	const openPdf = () => {
		if (!ready || loading) return;
		const isLatex = value.includes("\\documentclass") || value.includes("\\begin{");
		const latex = isLatex ? value : buildClLatex(value, contact);
		setLoading(true);
		callApi("/cv/compile", {
			method: "POST",
			json: { latex },
			responseType: "blob",
			error: "PDF compile failed",
			onSuccess: (blob) => {
				window.open(URL.createObjectURL(blob), "_blank");
			},
		}).finally(() => setLoading(false));
	};

	if (!ready) {
		return (
			<div style={{
				display: "inline-flex", alignItems: "center", gap: 4,
				height: 22, padding: "0 8px",
				borderRadius: 5,
				border: "1px dashed #e4e4e7",
				background: "transparent",
				color: "#d4d4d8",
				fontSize: 11, fontWeight: 500,
				userSelect: "none", whiteSpace: "nowrap",
			}}>
				<FileText style={{ width: 10, height: 10, flexShrink: 0 }} />
				{label}
			</div>
		);
	}

	return (
		<button
			onClick={openPdf}
			disabled={loading}
			style={{
				display: "inline-flex", alignItems: "center", gap: 4,
				height: 22, padding: "0 8px",
				borderRadius: 5,
				border: "1px solid #c4b5fd",
				background: "#f5f3ff",
				color: loading ? "#a78bfa" : "#7c3aed",
				fontSize: 11, fontWeight: 600,
				cursor: loading ? "default" : "pointer",
				transition: "box-shadow 0.12s, background 0.12s",
				whiteSpace: "nowrap",
				letterSpacing: "0.01em",
			}}
			onMouseEnter={(e) => {
				if (!loading) {
					e.currentTarget.style.background = "#ede9fe";
					e.currentTarget.style.boxShadow = "0 2px 6px rgba(124,58,237,0.15)";
				}
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.background = "#f5f3ff";
				e.currentTarget.style.boxShadow = "none";
			}}
		>
			<FileText style={{ width: 10, height: 10, flexShrink: 0 }} />
			{loading ? "…" : label}
		</button>
	);
}

function buildClLatex(text, contact) {
	const esc = (s) =>
		s
			.replace(/&/g, "\\&")
			.replace(/%/g, "\\%")
			.replace(/\$/, "\\$")
			.replace(/#/g, "\\#")
			.replace(/_/g, "\\_")
			.replace(/\*\*(.+?)\*\*/g, "\\textbf{$1}");
	const nameLine = contact?.name ? `{\\Large\\bfseries ${contact.name}}\\\\[2pt]` : "";
	const locationLine = contact?.location ? `{\\small ${contact.location}}\\\\[1pt]` : "";
	const urls = [contact?.linkedinUrl, contact?.githubUrl].filter(Boolean).join(" \\quad\\textbar\\quad ");
	const urlLine = urls ? `{\\small ${urls}}` : "";
	return `\\documentclass[11pt]{article}
\\usepackage[top=0.9in,bottom=1in,left=1.1in,right=1.1in]{geometry}
\\usepackage[T1]{fontenc}\\usepackage{lmodern}\\usepackage{parskip}
\\setlength{\\parskip}{9pt}\\setlength{\\parindent}{0pt}\\pagestyle{empty}
\\begin{document}
\\begin{center}${nameLine}${locationLine}${urlLine}\\end{center}
\\vspace{0.4em}\\hrule\\vspace{1em}
${esc(text)}
\\end{document}`;
}

function ConfirmModal({ message, onConfirm, onCancel }) {
	return (
		<div style={{
			position: "fixed", inset: 0, zIndex: 9999,
			background: "rgba(0,0,0,0.3)",
			backdropFilter: "blur(4px)",
			display: "flex", alignItems: "center", justifyContent: "center",
		}} onClick={onCancel}>
			<div
				onClick={(e) => e.stopPropagation()}
				style={{
					background: "#fff", borderRadius: 16,
					padding: "28px 28px 24px",
					width: 360, boxShadow: "0 24px 64px rgba(0,0,0,0.15)",
					border: "1px solid #f4f4f5",
					display: "flex", flexDirection: "column", gap: 20,
				}}
			>
				<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
					<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
						<div style={{
							width: 36, height: 36, borderRadius: 10,
							background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
						}}>
							<Trash2 style={{ width: 16, height: 16, color: "#ef4444" }} />
						</div>
						<span style={{ fontSize: 15, fontWeight: 600, color: "#18181b" }}>Confirm Delete</span>
					</div>
					<p style={{ fontSize: 13, color: "#71717a", margin: 0, lineHeight: 1.5 }}>{message}</p>
				</div>
				<div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
					<button onClick={onCancel} style={{
						fontSize: 13, fontWeight: 500, color: "#52525b",
						background: "#f4f4f5", border: "none", borderRadius: 8,
						padding: "8px 16px", cursor: "pointer",
						transition: "background 0.12s",
					}}
						onMouseEnter={e => e.currentTarget.style.background = "#e4e4e7"}
						onMouseLeave={e => e.currentTarget.style.background = "#f4f4f5"}
					>Cancel</button>
					<button onClick={onConfirm} style={{
						fontSize: 13, fontWeight: 600, color: "#fff",
						background: "#ef4444", border: "none", borderRadius: 8,
						padding: "8px 16px", cursor: "pointer",
						transition: "background 0.12s",
					}}
						onMouseEnter={e => e.currentTarget.style.background = "#dc2626"}
						onMouseLeave={e => e.currentTarget.style.background = "#ef4444"}
					>Delete</button>
				</div>
			</div>
		</div>
	);
}

function fmtDate(iso) {
	if (!iso) return "—";
	const str = iso.includes("T") || iso.endsWith("Z") ? iso : iso.replace(" ", "T") + "Z";
	const d = new Date(str);
	return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ── main component ─────────────────────────────────────────────────────────

export default function Jobs() {
	const [jobs, setJobs] = useState([]);
	const [contact, setContact] = useState(null);
	const [selectedIds, setSelectedIds] = useState([]);
	const [screeningIds, setScreeningIds] = useState(new Set());
	const [datePosted, setDatePosted] = useState("week");
	const [fetchLinkedin, setFetchLinkedin] = useState(true);
	const [fetchGreenhouse, setFetchGreenhouse] = useState(true);
	const [filterCompany, setFilterCompany] = useState("");
	const [filterTitle, setFilterTitle] = useState("");
	const [viewFilter, setViewFilter] = useState("to_apply");
	const [confirmDelete, setConfirmDelete] = useState(false);

	const [callApi] = useCallApi();
	const loading = useLoading();
	const { enqueueSnackbar } = useSnackbar();

	const jobsRef = useRef([]);
	useEffect(() => {
		jobsRef.current = jobs;
	}, [jobs]);

	const filteredJobs = useMemo(
		() =>
			jobs.filter((j) => {
				if (
					viewFilter === "to_apply" &&
					((j.relevanceStatus !== "good_fit" && j.relevanceStatus !== "maybe") ||
						j.applicationStatus !== "new")
				)
					return false;
				if (viewFilter === "applied" && j.applicationStatus === "new") return false;
				if (viewFilter === "no_fit" && j.relevanceStatus !== "irrelevant") return false;
				if (filterCompany && !j.company.toLowerCase().includes(filterCompany.toLowerCase())) return false;
				if (filterTitle && !j.title.toLowerCase().includes(filterTitle.toLowerCase())) return false;
				return true;
			}),
		[jobs, viewFilter, filterCompany, filterTitle],
	);

	const unscreenedCount = useMemo(() => jobs.filter((j) => j.relevanceStatus === "unscreened").length, [jobs]);

	const fetchJobs = useCallback(() => {
		callApi("/jobs", { error: "Failed to load jobs", onSuccess: setJobs });
	}, [callApi]);

	const patchJob = useCallback(
		(id, data) => {
			const original = jobsRef.current.find((j) => j.id === id);
			setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...data } : j)));
			callApi("/jobs", {
				method: "PATCH",
				json: { id, ...data },
				error: "Failed to update job",
				onError: () => {
					if (original) setJobs((prev) => prev.map((j) => (j.id === id ? original : j)));
				},
			});
		},
		[callApi],
	);

	const colDefs = useMemo(
		() => [
			{
				field: "relevanceStatus",
				headerName: "Fit",
				width: 82,
				cellRenderer: ({ value, data }) =>
					screeningIds.has(data.id) ? (
						<span style={{ fontSize: 11, padding: "2px 8px", background: "#f4f4f5", borderRadius: 999 }}>…</span>
					) : (
						<StatusChip
							value={value}
							options={RELEVANCE_OPTIONS}
							colorMap={RELEVANCE_COLORS}
							onChange={(v) => patchJob(data.id, { relevanceStatus: v })}
						/>
					),
			},
			{
				headerName: "Job",
				flex: 1,
				minWidth: 260,
				sortable: true,
				cellStyle: { display: "flex", alignItems: "center" },
				cellRenderer: ({ data }) => (
					<div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 3, overflow: "hidden", height: "100%" }}>
						<span style={{ fontSize: 11, color: "#a1a1aa", fontWeight: 500, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 4 }}>
							{data.source === "linkedin" ? (
								<svg viewBox="0 0 24 24" style={{ width: 12, height: 12, flexShrink: 0 }} fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
							) : data.source === "greenhouse" ? (
								<svg viewBox="0 0 24 24" style={{ width: 12, height: 12, flexShrink: 0 }} fill="#3B8427"><circle cx="12" cy="12" r="10"/><text x="12" y="16" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">G</text></svg>
							) : null}
							{data.company}
							{data.location && (
								<span style={{ color: "#d4d4d8", marginLeft: 6 }}>
									· {data.location.split(",")[0]}
								</span>
							)}
						</span>
						{data.url ? (
							<a
								href={data.url}
								target="_blank"
								rel="noopener noreferrer"
								style={{ fontSize: 13, fontWeight: 600, color: "#18181b", textDecoration: "none", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
							>
								{data.title}
							</a>
						) : (
							<span style={{ fontSize: 13, fontWeight: 600, color: "#18181b", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
								{data.title}
							</span>
						)}
					</div>
				),
			},
			{
				field: "applicationStatus",
				headerName: "Status",
				width: 120,
				cellRenderer: ({ value, data }) => (
					<StatusChip
						value={value}
						options={APP_OPTIONS}
						colorMap={APP_COLORS}
						onChange={(v) =>
							patchJob(data.id, {
								applicationStatus: v,
								...(v === "applied" ? { applicationDate: new Date().toISOString() } : {}),
							})
						}
					/>
				),
			},
			{
				field: "atsScore",
				headerName: "ATS",
				width: 72,
				sortable: true,
				cellRenderer: ({ value }) => <AtsScoreCell value={value} />,
			},
			{
				headerName: "Docs",
				width: 220,
				cellRenderer: ({ data }) => {
					const hasDocs = data.generatedCv || data.generatedCl;
					const isGenerating = data.agentStatus === "generating";

					if (data.agentStatus === "pending" && !hasDocs) {
						return <span style={{ color: "#d4d4d8", fontSize: 12 }}>—</span>;
					}

					return (
						<div style={{ display: "flex", alignItems: "center", gap: 6, height: "100%" }}>
							{isGenerating && (
								<span style={{
									display: "inline-block", width: 6, height: 6, borderRadius: "50%",
									background: "#6366f1", animation: "pulse 1.2s ease-in-out infinite", flexShrink: 0,
								}} />
							)}
							<DocChip value={data.generatedCv} label="CV" contact={contact} />
							<DocChip value={data.generatedCl} label="CL" contact={contact} />
						</div>
					);
				},
			},
			{
				field: "applicationDate",
				headerName: "Applied",
				width: 110,
				sortable: true,
				cellRenderer: ({ value, data }) => (
					<input
						type="date"
						style={{ fontSize: 12, border: "none", background: "transparent", cursor: "pointer", width: "100%", color: value ? "#71717a" : "transparent" }}
						value={value ? new Date(value).toISOString().slice(0, 10) : ""}
						onChange={(e) =>
							patchJob(data.id, {
								applicationDate: e.target.value ? new Date(e.target.value).toISOString() : null,
							})
						}
					/>
				),
			},
		],
		[patchJob, screeningIds, contact],
	);

	const handleFetch = () => {
		const sources = [];
		if (fetchLinkedin) sources.push("linkedin");
		if (fetchGreenhouse) sources.push("greenhouse");
		if (!sources.length) return;

		callApi("/jobs/fetch", {
			method: "POST",
			json: { datePosted, sources },
			alias: "fetchJobs",
			error: "Failed to fetch jobs",
			onSuccess: (fetchData) => {
				const src = fetchData.bySource || {};
				const parts = Object.entries(src)
					.filter(([, v]) => typeof v === "number" && v > 0)
					.map(([k, v]) => `${v} from ${k}`);
				const msg = parts.length ? `${fetchData.inserted} new jobs (${parts.join(", ")})` : "No new jobs";
				enqueueSnackbar(msg, { variant: fetchData.inserted > 0 ? "success" : "default" });

				if (fetchData.inserted > 0) {
					return callApi("/jobs/screen", {
						method: "POST",
						json: {},
						alias: "fetchJobs",
						suppressError: true,
						onSuccess: fetchJobs,
					});
				}
			},
		});
	};

	const handleScreen = () => {
		const toScreen =
			selectedIds.length > 0
				? jobs.filter((j) => selectedIds.includes(j.id) && j.relevanceStatus === "unscreened").map((j) => j.id)
				: jobs.filter((j) => j.relevanceStatus === "unscreened").map((j) => j.id);
		if (!toScreen.length) return;

		setScreeningIds(new Set(toScreen));

		callApi("/jobs/screen", {
			method: "POST",
			json: { ids: toScreen },
			alias: "screenJobs",
			error: "Failed to screen jobs",
			onSuccess: (data) => {
				enqueueSnackbar(
					`${data.screened ?? 0} screened — ${data.good_fit ?? 0} good · ${data.maybe ?? 0} maybe · ${data.irrelevant ?? 0} no`,
					{ variant: "success" },
				);
				fetchJobs();
			},
		}).finally(() => {
			setScreeningIds(new Set());
		});
	};

	const handleDelete = () => {
		if (!selectedIds.length) return;
		setConfirmDelete(true);
	};

	const confirmDeleteAction = () => {
		setConfirmDelete(false);
		callApi("/jobs/delete", {
			method: "POST",
			json: { ids: selectedIds },
			success: `${selectedIds.length} job(s) deleted`,
			error: "Failed to delete jobs",
			onSuccess: () => {
				setJobs((prev) => prev.filter((j) => !selectedIds.includes(j.id)));
				setSelectedIds([]);
			},
		});
	};

	const handleGenerate = (ids) => {
		if (!ids.length) {
			return;
		}

		callApi("/cv", {
			error: "Failed to load CV",
			onSuccess: (cv) => {
				if (!cv?.latexSource) {
					enqueueSnackbar("No CV found. Go to My CV first.", { variant: "warning" });
					return;
				}

				setJobs((prev) => prev.map((j) => (ids.includes(j.id) ? { ...j, agentStatus: "generating" } : j)));

				callApi("/jobs/generate", {
					method: "POST",
					json: { jobIds: ids },
					alias: "generateJobs",
					error: "Failed to generate documents",
					onSuccess: (updatedJobs) => {
						setJobs((prev) => {
							const updatedMap = Object.fromEntries(updatedJobs.map((j) => [j.id, j]));
							return prev.map((j) => updatedMap[j.id] ?? j);
						});
						enqueueSnackbar(`${ids.length} document(s) generated`, { variant: "success" });
					},
				});
			},
		});
	};

	useEffect(() => {
		fetchJobs();

		callApi("/profile", {
			error: "Failed to load profile",
			onSuccess: (d) => {
				setContact({
					name: d.fullName ?? "",
					location: d.currentLocation ?? "",
					linkedinUrl: d.linkedinUrl ?? "",
					githubUrl: d.githubUrl ?? "",
				});
			},
		});
	}, []);

	const toGenerate = jobs.filter((j) => selectedIds.includes(j.id) && !j.generatedCv).map((j) => j.id);
	const toRegen = jobs.filter((j) => selectedIds.includes(j.id) && j.generatedCv).map((j) => j.id);
	const screenable =
		selectedIds.length > 0
			? jobs.filter((j) => selectedIds.includes(j.id) && j.relevanceStatus === "unscreened").length
			: unscreenedCount;

	return (
		<div className="flex flex-col h-full overflow-hidden">
			{confirmDelete && (
				<ConfirmModal
					message={`This will permanently delete ${selectedIds.length} job${selectedIds.length > 1 ? "s" : ""}. This cannot be undone.`}
					onConfirm={confirmDeleteAction}
					onCancel={() => setConfirmDelete(false)}
				/>
			)}
			{/* Header */}
			<div className="flex items-center gap-3 px-6 h-14 border-b border-zinc-100 shrink-0">
				<h1 className="text-sm font-semibold text-zinc-900">Jobs</h1>
				<span className="text-xs font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full tabular-nums">
					{filteredJobs.length}
				</span>

				<div className="flex items-center gap-2 ml-auto">
					{toRegen.length > 0 && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => handleGenerate(toRegen)}
							disabled={loading?.generateJobs}
						>
							<RotateCcw className="h-3.5 w-3.5 mr-1.5" />
							{loading?.generateJobs ? "Generating..." : `Regenerate (${toRegen.length})`}
						</Button>
					)}
					{(selectedIds.length === 0 || toGenerate.length > 0) && (
						<Button
							size="sm"
							onClick={() => handleGenerate(toGenerate)}
							disabled={loading?.generateJobs || !selectedIds.length}
						>
							<BoltIcon className="h-3.5 w-3.5 mr-1.5" />
							{loading?.generateJobs
								? "Generating..."
								: selectedIds.length
									? `Generate (${toGenerate.length})`
									: "Generate"}
						</Button>
					)}
				</div>
			</div>

			{/* Toolbar */}
			<div className="flex items-center gap-2 px-6 py-2.5 border-b border-zinc-100 shrink-0 flex-wrap">
				<Input
					placeholder="Company"
					value={filterCompany}
					onChange={(e) => setFilterCompany(e.target.value)}
					className="w-36 h-8 text-xs"
				/>
				<Input
					placeholder="Job title"
					value={filterTitle}
					onChange={(e) => setFilterTitle(e.target.value)}
					className="w-44 h-8 text-xs"
				/>
				<select className={selectCls} value={viewFilter} onChange={(e) => setViewFilter(e.target.value)}>
					<option value="to_apply">To Apply</option>
					<option value="applied">In Progress</option>
					<option value="no_fit">No Fit</option>
					<option value="all">All Jobs</option>
				</select>
				<Button
					variant="ghost"
					size="sm"
					className="h-8 text-xs text-zinc-400 hover:text-zinc-600"
					onClick={() => {
						setFilterCompany("");
						setFilterTitle("");
						setViewFilter("to_apply");
					}}
				>
					Reset
				</Button>

				<div className="w-px h-4 bg-zinc-200 mx-0.5" />

				{!selectedIds.length && (
					<>
						<select
							className={selectCls}
							value={datePosted}
							onChange={(e) => setDatePosted(e.target.value)}
							disabled={loading?.fetchJobs}
						>
							<option value="24h">Last 24h</option>
							<option value="week">Last week</option>
							<option value="month">Last month</option>
						</select>
						<label className="flex items-center gap-1 text-xs text-zinc-600 cursor-pointer">
							<input type="checkbox" checked={fetchLinkedin} onChange={(e) => setFetchLinkedin(e.target.checked)} className="rounded border-zinc-300" />
							<svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
						</label>
						<label className="flex items-center gap-1 text-xs text-zinc-600 cursor-pointer">
							<input type="checkbox" checked={fetchGreenhouse} onChange={(e) => setFetchGreenhouse(e.target.checked)} className="rounded border-zinc-300" />
							<svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="#3B8427"><circle cx="12" cy="12" r="10"/><text x="12" y="16" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">G</text></svg>
						</label>
						<Button
							variant="outline"
							size="sm"
							className="h-8"
							onClick={handleFetch}
							disabled={loading?.fetchJobs || (!fetchLinkedin && !fetchGreenhouse)}
						>
							<RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading?.fetchJobs ? "animate-spin" : ""}`} />
							{loading?.fetchJobs ? "Fetching..." : "Fetch"}
						</Button>
					</>
				)}

				{screenable > 0 && (
					<Button
						variant="outline"
						size="sm"
						className="h-8"
						onClick={handleScreen}
						disabled={loading?.screenJobs}
					>
						<ScanSearch className="h-3.5 w-3.5 mr-1.5" />
						{loading?.screenJobs ? "Screening..." : `Screen (${screenable})`}
					</Button>
				)}

				{selectedIds.length > 0 && (
					<Button variant="destructive" size="sm" className="h-8" onClick={handleDelete}>
						<Trash2 className="h-3.5 w-3.5 mr-1.5" />
						Delete ({selectedIds.length})
					</Button>
				)}
			</div>

			{/* Grid */}
			<div className="flex-1 min-h-0">
				<AgGridReact
					theme={gridTheme}
					rowData={filteredJobs}
					columnDefs={colDefs}
					getRowId={(params) => params.data.id}
					getRowStyle={({ data }) => {
						const border = { good_fit: "#16a34a", maybe: "#d97706", irrelevant: "#ef4444", unscreened: "#e4e4e7" };
						const isApplied = data?.applicationStatus === "applied";
						return {
							borderLeft: `3px solid ${border[data?.relevanceStatus] ?? "#e4e4e7"}`,
							...(isApplied ? { opacity: 0.5 } : {}),
						};
					}}
					rowSelection={{
						mode: "multiRow",
						checkboxes: true,
						headerCheckbox: true,
						enableClickSelection: false,
					}}
					onSelectionChanged={(e) => setSelectedIds(e.api.getSelectedRows().map((r) => r.id))}
					rowClassRules={{
						"opacity-50": (p) =>
							(p.data?.agentStatus === "generating" || p.data?.agentStatus === "reviewing") &&
							!p.data?.generatedCv,
					}}
					defaultColDef={{ resizable: true }}
					initialState={{ sort: { sortModel: [{ colId: "fetchedAt", sort: "desc" }] } }}
				/>
			</div>
		</div>
	);
}
