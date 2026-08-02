import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";
import { Bolt as BoltIcon, Pencil, Plus, RefreshCw, RotateCcw, ScanSearch, Search, Trash2 } from "lucide-react";
import StatusChip, { APP_COLORS, APP_OPTIONS, RELEVANCE_COLORS, RELEVANCE_META, RELEVANCE_OPTIONS } from "./StatusChip";
import { useCallApi, useLoading } from "services";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import AddJobDialog from "./AddJobDialog";
import { AgGridReact } from "ag-grid-react";
import AtsScoreCell from "./AtsScoreCell";
import { Button } from "components/ui/button";
import ConfirmModal from "./ConfirmModal";
import DocChip from "./DocChip";
import { Input } from "components/ui/input";
import { PageHeader } from "components/ui/page-header";
import { PortalMenu } from "components/ui/portal-menu";
import { Select } from "components/ui/select";
import { TableSkeleton } from "components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { useSnackbar } from "notistack";

ModuleRegistry.registerModules([AllCommunityModule]);

const gridTheme = themeQuartz.withParams({
	fontSize: 14,
	rowHeight: 68,
	headerHeight: 42,
	fontFamily: "Inter, sans-serif",
	selectedRowBackgroundColor: "#fafafa",
	columnBorder: false,
	rowBorder: { color: "#f4f4f5", width: 1 },
	oddRowBackgroundColor: "#ffffff",
	headerBackgroundColor: "#fafafa",
	headerTextColor: "#71717a",
	headerFontWeight: 500,
	headerFontSize: 12,
	cellHorizontalPadding: 18,
});

const FETCH_RANGES = [
	{ value: "24h", label: "Last 24h" },
	{ value: "week", label: "Last week" },
	{ value: "month", label: "Last month" },
];

const PULSE_STYLE = { animation: "pulse 1.2s ease-in-out infinite" };

// In-session cache so revisiting Jobs renders instantly, then revalidates.
let jobsCache = null;

function SourceIcon({ source, className = "" }) {
	if (source === "linkedin") {
		return (
			<svg viewBox="0 0 24 24" fill="#0A66C2" className={className}>
				<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
			</svg>
		);
	}
	return (
		<span
			className={`rounded-full bg-zinc-200 flex items-center justify-center text-[7px] font-bold text-zinc-500 ${className}`}
		>
			M
		</span>
	);
}

function FetchDropdown({ loading, onFetch }) {
	const [open, setOpen] = useState(false);
	const triggerRef = useRef(null);

	return (
		<>
			<Button ref={triggerRef} variant="outline" size="sm" onClick={() => setOpen((o) => !o)} disabled={loading}>
				{loading ? (
					<RefreshCw className="h-3.5 w-3.5 animate-spin" />
				) : (
					<SourceIcon source="linkedin" className="h-3.5 w-3.5" />
				)}
				{loading ? "Fetching…" : "Fetch"}
			</Button>
			<PortalMenu
				open={open}
				onClose={() => setOpen(false)}
				triggerRef={triggerRef}
				align="right"
				className="min-w-[160px]"
			>
				<div className="px-2.5 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
					Fetch jobs from
				</div>
				{FETCH_RANGES.map((r) => (
					<button
						key={r.value}
						type="button"
						onClick={() => {
							setOpen(false);
							onFetch(r.value);
						}}
						className="w-full text-left px-2.5 h-8 text-[13px] text-zinc-700 hover:bg-zinc-50 cursor-pointer truncate"
					>
						{r.label}
					</button>
				))}
			</PortalMenu>
		</>
	);
}

function formatAppliedDate(value) {
	if (!value) return "";
	const d = new Date(value);
	if (isNaN(d.getTime())) return "";
	const dd = String(d.getDate()).padStart(2, "0");
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const yy = String(d.getFullYear()).slice(-2);
	return `${dd} / ${mm} / ${yy}`;
}

function AppliedDateCell({ value, onChange }) {
	const [editing, setEditing] = useState(false);
	const inputRef = useRef(null);

	useEffect(() => {
		if (editing && inputRef.current) {
			inputRef.current.focus();
		}
	}, [editing]);

	if (editing) {
		return (
			<input
				ref={inputRef}
				type="date"
				className="text-[13px] border-none bg-transparent cursor-pointer w-full text-zinc-600"
				value={value ? new Date(value).toISOString().slice(0, 10) : ""}
				onChange={(e) => {
					onChange(e.target.value ? new Date(e.target.value).toISOString() : null);
				}}
				onBlur={() => setEditing(false)}
			/>
		);
	}

	const display = formatAppliedDate(value);
	return (
		<button
			type="button"
			onClick={() => setEditing(true)}
			className="w-full h-full text-left text-[13px] text-zinc-600 cursor-pointer hover:text-zinc-900 transition-colors"
		>
			{display || <span className="text-zinc-300">—</span>}
		</button>
	);
}

export default function Jobs() {
	const [jobs, setJobs] = useState(() => jobsCache ?? []);
	const [firstLoad, setFirstLoad] = useState(() => !jobsCache);
	const [contact, setContact] = useState(null);
	const [selectedIds, setSelectedIds] = useState([]);
	const [screeningIds, setScreeningIds] = useState(new Set());
	const [filterCompany, setFilterCompany] = useState("");
	const [filterTitle, setFilterTitle] = useState("");
	const [viewFilter, setViewFilter] = useState("to_apply");
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [showAddJob, setShowAddJob] = useState(false);

	const [callApi] = useCallApi();
	const loading = useLoading();
	const { enqueueSnackbar } = useSnackbar();
	const navigate = useNavigate();

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
				if (viewFilter === "applied" && j.applicationStatus !== "applied") return false;
				if (viewFilter === "interview" && j.applicationStatus !== "interview") return false;
				if (viewFilter === "rejected" && j.applicationStatus !== "rejected") return false;
				if (viewFilter === "no_fit" && j.relevanceStatus !== "irrelevant") return false;
				if (filterCompany && !j.company.toLowerCase().includes(filterCompany.toLowerCase())) return false;
				if (filterTitle && !j.title.toLowerCase().includes(filterTitle.toLowerCase())) return false;
				return true;
			}),
		[jobs, viewFilter, filterCompany, filterTitle],
	);

	const unscreenedCount = useMemo(() => jobs.filter((j) => j.relevanceStatus === "unscreened").length, [jobs]);

	useEffect(() => {
		jobsCache = jobs;
	}, [jobs]);

	const fetchJobs = useCallback(() => {
		callApi("/jobs", {
			error: "Failed to load jobs",
			onSuccess: (data) => {
				setJobs(data);
				setFirstLoad(false);
			},
			onError: () => setFirstLoad(false),
		});
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

	const screenJobs = useCallback(
		(ids, { variant = "success", prefix = () => "", error = "Failed to screen jobs" } = {}) => {
			if (!ids.length) return;
			setScreeningIds(new Set(ids));
			return callApi("/jobs/screen", {
				method: "POST",
				json: { ids },
				alias: "screenJobs",
				error,
				onSuccess: (data) => {
					enqueueSnackbar(
						`${prefix(data)}${data.good_fit ?? 0} good · ${data.maybe ?? 0} maybe · ${data.irrelevant ?? 0} no`,
						{ variant },
					);
					fetchJobs();
				},
			}).finally(() => setScreeningIds(new Set()));
		},
		[callApi, enqueueSnackbar, fetchJobs],
	);

	const colDefs = useMemo(() => {
		const cols = [
			{
				field: "relevanceStatus",
				headerName: "Fit",
				width: 110,
				cellRenderer: ({ value, data }) =>
					screeningIds.has(data.id) ? (
						<span className="inline-flex items-center gap-1 h-[22px] px-2 rounded-full bg-zinc-100 text-zinc-400 text-[11px] font-medium">
							<span className="h-1.5 w-1.5 rounded-full bg-zinc-400" style={PULSE_STYLE} />
							Screening
						</span>
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
				minWidth: 280,
				sortable: true,
				cellStyle: { display: "flex", alignItems: "center" },
				cellRenderer: ({ data }) => (
					<div className="flex flex-col justify-center gap-0.5 h-full overflow-hidden min-w-0">
						<div className="flex items-center gap-1.5 text-[12px] text-zinc-500 font-medium leading-tight">
							<SourceIcon source={data.source} className="w-3 h-3 shrink-0" />
							<span className="truncate">{data.company}</span>
							{data.location && <span className="text-zinc-300">· {data.location.split(",")[0]}</span>}
						</div>
						{data.url ? (
							<a
								href={data.url}
								target="_blank"
								rel="noopener noreferrer"
								className="text-[14px] font-semibold text-zinc-900 hover:text-indigo-600 truncate leading-snug transition-colors"
							>
								{data.title}
							</a>
						) : (
							<span className="text-[14px] font-semibold text-zinc-900 truncate leading-snug">
								{data.title}
							</span>
						)}
					</div>
				),
			},
			{
				field: "applicationStatus",
				headerName: "Status",
				width: 130,
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
				width: 70,
				sortable: true,
				cellRenderer: ({ value }) => <AtsScoreCell value={value} />,
			},
			{
				headerName: "Docs",
				width: 130,
				cellRenderer: ({ data }) => {
					const hasDocs = data.hasGeneratedCv || data.hasGeneratedCl;
					const isGenerating = data.agentStatus === "generating";

					if (data.agentStatus === "pending" && !hasDocs) {
						return <span className="text-zinc-300 text-xs">—</span>;
					}

					return (
						<div className="flex items-center gap-1.5 h-full">
							{isGenerating && (
								<span
									className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"
									style={{ animation: "pulse 1.2s ease-in-out infinite" }}
								/>
							)}
							<DocChip jobId={data.id} label="CV" ready={data.hasGeneratedCv} contact={contact} />
							<DocChip jobId={data.id} label="CL" ready={data.hasGeneratedCl} contact={contact} />
						</div>
					);
				},
			},
		];

		if (viewFilter !== "to_apply") {
			cols.push({
				field: "applicationDate",
				headerName: "Applied",
				width: 110,
				sortable: true,
				cellRenderer: ({ value, data }) => (
					<AppliedDateCell value={value} onChange={(iso) => patchJob(data.id, { applicationDate: iso })} />
				),
			});
		}

		cols.push({
			headerName: "",
			width: 56,
			sortable: false,
			cellRenderer: ({ data }) => {
				if (!data.hasGeneratedCv && !data.hasGeneratedCl) return null;
				return (
					<button
						onClick={() => navigate(`/jobs/${data.id}/tweak`)}
						title="Tweak CV & cover letter"
						className="inline-flex items-center justify-center h-7 w-7 rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 transition-colors cursor-pointer"
					>
						<Pencil className="h-3.5 w-3.5" />
					</button>
				);
			},
		});

		return cols;
	}, [patchJob, screeningIds, contact, viewFilter, navigate]);

	const handleFetch = (range) => {
		callApi("/jobs/fetch", {
			method: "POST",
			json: { datePosted: range },
			alias: "fetchJobs",
			error: "Failed to fetch jobs",
			onSuccess: (fetchData) => {
				const msg = fetchData.inserted > 0 ? `${fetchData.inserted} new jobs` : "No new jobs";
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
		screenJobs(toScreen, { prefix: (d) => `${d.screened ?? 0} screened — ` });
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
		if (!ids.length) return;

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
							const updatedMap = Object.fromEntries(
								updatedJobs.map((j) => [
									j.id,
									{
										...j,
										hasGeneratedCv: Boolean(j.generatedCv),
										hasGeneratedCl: Boolean(j.generatedCl),
									},
								]),
							);
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

	const toGenerate = jobs.filter((j) => selectedIds.includes(j.id) && !j.hasGeneratedCv).map((j) => j.id);
	const toRegen = jobs.filter((j) => selectedIds.includes(j.id) && j.hasGeneratedCv).map((j) => j.id);
	const screenable =
		selectedIds.length > 0
			? jobs.filter((j) => selectedIds.includes(j.id) && j.relevanceStatus === "unscreened").length
			: unscreenedCount;

	return (
		<div className="flex flex-col h-full overflow-hidden">
			{showAddJob && (
				<AddJobDialog
					onClose={() => setShowAddJob(false)}
					onAdded={(job) => {
						setJobs((prev) => [
							{
								...job,
								hasGeneratedCv: Boolean(job.generatedCv),
								hasGeneratedCl: Boolean(job.generatedCl),
							},
							...prev,
						]);
						enqueueSnackbar(`Added ${job.title} at ${job.company}`, { variant: "success" });
						if (job.description) {
							screenJobs([job.id], {
								variant: "info",
								prefix: () => "Screening: ",
								error: "Failed to screen job",
							});
						}
					}}
				/>
			)}
			{confirmDelete && (
				<ConfirmModal
					message={`This will permanently delete ${selectedIds.length} job${selectedIds.length > 1 ? "s" : ""}. This cannot be undone.`}
					onConfirm={confirmDeleteAction}
					onCancel={() => setConfirmDelete(false)}
				/>
			)}

			<PageHeader
				title="Jobs"
				badge={filteredJobs.length}
				actions={
					<>
						<FetchDropdown loading={loading?.fetchJobs} onFetch={handleFetch} />
						<div className="w-px h-5 bg-zinc-200 mx-1" />
						<Button variant="outline" size="sm" onClick={() => setShowAddJob(true)}>
							<Plus className="h-3.5 w-3.5" />
							Add job
						</Button>
						{toRegen.length > 0 && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => handleGenerate(toRegen)}
								disabled={loading?.generateJobs}
							>
								<RotateCcw className="h-3.5 w-3.5" />
								{loading?.generateJobs ? "Generating…" : `Regenerate (${toRegen.length})`}
							</Button>
						)}
						{(selectedIds.length === 0 || toGenerate.length > 0) && (
							<Button
								variant="primary"
								size="sm"
								onClick={() => handleGenerate(toGenerate)}
								disabled={loading?.generateJobs || !selectedIds.length}
							>
								<BoltIcon className="h-3.5 w-3.5" />
								{loading?.generateJobs
									? "Generating…"
									: selectedIds.length
										? `Generate (${toGenerate.length})`
										: "Generate"}
							</Button>
						)}
					</>
				}
			/>

			{/* Toolbar */}
			<div className="flex items-center gap-2 px-6 py-2.5 border-b border-zinc-100 shrink-0 flex-wrap bg-zinc-50/40">
				<div className="relative">
					<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
					<Input
						placeholder="Company"
						value={filterCompany}
						onChange={(e) => setFilterCompany(e.target.value)}
						className="w-36 pl-7"
					/>
				</div>
				<div className="relative">
					<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
					<Input
						placeholder="Job title"
						value={filterTitle}
						onChange={(e) => setFilterTitle(e.target.value)}
						className="w-44 pl-7"
					/>
				</div>
				<Select
					value={viewFilter}
					onChange={setViewFilter}
					options={[
						{ value: "to_apply", label: "To apply" },
						{ value: "applied", label: "Applied" },
						{ value: "interview", label: "Interview" },
						{ value: "rejected", label: "Rejected" },
						{ value: "no_fit", label: "No fit" },
						{ value: "all", label: "All jobs" },
					]}
				/>
				{(filterCompany || filterTitle || viewFilter !== "to_apply") && (
					<Button
						variant="ghost"
						size="sm"
						className="text-zinc-500 hover:text-zinc-800"
						onClick={() => {
							setFilterCompany("");
							setFilterTitle("");
							setViewFilter("to_apply");
						}}
					>
						Reset
					</Button>
				)}

				{screenable > 0 && (
					<Button variant="outline" size="sm" onClick={handleScreen} disabled={loading?.screenJobs}>
						<ScanSearch className="h-3.5 w-3.5" />
						{loading?.screenJobs ? "Screening…" : `Screen (${screenable})`}
					</Button>
				)}

				{selectedIds.length > 0 && (
					<Button variant="destructive" size="sm" className="h-8 ml-auto" onClick={handleDelete}>
						<Trash2 className="h-3.5 w-3.5" />
						Delete ({selectedIds.length})
					</Button>
				)}
			</div>

			{/* Grid */}
			<div className="flex-1 min-h-0">
				{firstLoad ? (
					<TableSkeleton rows={12} />
				) : (
					<AgGridReact
						theme={gridTheme}
						rowData={filteredJobs}
						columnDefs={colDefs}
						suppressCellFocus
						getRowId={(params) => params.data.id}
						getRowStyle={({ data }) => ({
							borderLeft: `2px solid ${(RELEVANCE_META[data?.relevanceStatus] ?? RELEVANCE_META.unscreened).hex}`,
						})}
						rowSelection={{
							mode: "multiRow",
							checkboxes: true,
							headerCheckbox: true,
							enableClickSelection: false,
						}}
						onSelectionChanged={(e) => setSelectedIds(e.api.getSelectedRows().map((r) => r.id))}
						defaultColDef={{ resizable: true }}
						initialState={{ sort: { sortModel: [{ colId: "fetchedAt", sort: "desc" }] } }}
					/>
				)}
			</div>
		</div>
	);
}
