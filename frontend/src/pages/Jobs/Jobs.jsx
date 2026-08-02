import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";
import { Bolt as BoltIcon, ChevronLeft, ChevronRight, Pencil, Plus, RefreshCw, RotateCcw, ScanSearch, Search, Trash2 } from "lucide-react";
import StatusChip, { APP_COLORS, APP_OPTIONS, RELEVANCE_COLORS, RELEVANCE_META, RELEVANCE_OPTIONS } from "./StatusChip";
import { readToken, useCallApi, useLoading, useTheme } from "services";
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

const FETCH_RANGES = [
	{ value: "24h", label: "Last 24h" },
	{ value: "week", label: "Last week" },
	{ value: "month", label: "Last month" },
];

const PAGE_SIZE = 50;

// ag-grid colId → server-supported sort key. Only these columns are sortable;
// everything else is a dumb renderer of the current server page.
const SORT_MAP = { company: "company", atsScore: "atsScore", applicationDate: "applicationDate" };

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
			className={`rounded-full bg-muted flex items-center justify-center text-[7px] font-bold text-ink-3 ${className}`}
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
			<Button
				ref={triggerRef}
				variant="outline"
				size="sm"
				onClick={() => setOpen((o) => !o)}
				disabled={loading}
				aria-haspopup="menu"
				aria-expanded={open}
			>
				{loading ? (
					<RefreshCw className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />
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
				ariaLabel="Fetch jobs from"
			>
				<div className="px-2.5 pt-1 pb-1.5 text-micro font-semibold uppercase tracking-wider text-ink-3">
					Fetch jobs from
				</div>
				{FETCH_RANGES.map((r) => (
					<button
						key={r.value}
						type="button"
						role="menuitem"
						onClick={() => {
							setOpen(false);
							onFetch(r.value);
						}}
						className="w-full text-left px-2.5 h-8 text-body text-ink hover:bg-hovertint focus:bg-hovertint focus:outline-none cursor-pointer truncate"
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
				aria-label="Applied date"
				className="text-body border-none bg-transparent cursor-pointer w-full text-ink-2"
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
			aria-label={display ? `Change applied date (${display})` : "Set applied date"}
			className="w-full h-full text-left text-body font-mono tabular-nums text-ink-2 cursor-pointer hover:text-ink transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
		>
			{display || <span className="text-ink-3">-</span>}
		</button>
	);
}

const EMPTY_STATS = { total: 0, toApply: 0, applied: 0, interviews: 0, unscreened: 0, avgAts: null };

export default function Jobs() {
	const [jobs, setJobs] = useState([]);
	const [total, setTotal] = useState(0);
	const [firstLoad, setFirstLoad] = useState(true);
	const [contact, setContact] = useState(null);
	const [selectedIds, setSelectedIds] = useState([]);
	const [screeningIds, setScreeningIds] = useState(new Set());
	const [filterCompany, setFilterCompany] = useState("");
	const [filterTitle, setFilterTitle] = useState("");
	const [debCompany, setDebCompany] = useState("");
	const [debTitle, setDebTitle] = useState("");
	const [viewFilter, setViewFilter] = useState("to_apply");
	const [sort, setSort] = useState("fetchedAt");
	const [direction, setDirection] = useState("desc");
	const [page, setPage] = useState(1);
	const [stats, setStats] = useState(EMPTY_STATS);
	const [reloadKey, setReloadKey] = useState(0);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [showAddJob, setShowAddJob] = useState(false);

	const [callApi] = useCallApi();
	const loading = useLoading();
	const { enqueueSnackbar } = useSnackbar();
	const navigate = useNavigate();
	const { resolved } = useTheme();

	// Grid colors come from the Kestrel tokens for the active theme.
	const gridTheme = useMemo(
		() =>
			themeQuartz.withParams({
				fontSize: 13.5,
				rowHeight: 68,
				headerHeight: 42,
				fontFamily: '"Geist", system-ui, sans-serif',
				accentColor: readToken("--k-accent"),
				backgroundColor: readToken("--k-surface"),
				foregroundColor: readToken("--k-ink"),
				selectedRowBackgroundColor: readToken("--k-accent-soft"),
				columnBorder: false,
				rowBorder: { color: readToken("--k-line"), width: 1 },
				oddRowBackgroundColor: readToken("--k-surface"),
				headerBackgroundColor: readToken("--k-canvas"),
				headerTextColor: readToken("--k-ink-2"),
				headerFontWeight: 500,
				headerFontSize: 12,
				cellHorizontalPadding: 18,
				rowHoverColor: readToken("--k-hover"),
			}),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[resolved],
	);

	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

	const jobsRef = useRef([]);
	useEffect(() => {
		jobsRef.current = jobs;
	}, [jobs]);

	const fetchStats = useCallback(() => {
		callApi("/jobs/stats", {
			suppressError: true,
			onSuccess: (s) => setStats(s ?? EMPTY_STATS),
		});
	}, [callApi]);

	// Bump reloadKey to refetch the current page; pair with fetchStats after any
	// mutation so both the list and the aggregate counts stay correct.
	const refresh = useCallback(() => {
		setReloadKey((k) => k + 1);
		fetchStats();
	}, [fetchStats]);

	// Debounce the company/title inputs so typing doesn't spam the API, and reset
	// to page 1 whenever the settled search terms change.
	useEffect(() => {
		const t = setTimeout(() => {
			setDebCompany(filterCompany);
			setDebTitle(filterTitle);
			setPage(1);
		}, 300);
		return () => clearTimeout(t);
	}, [filterCompany, filterTitle]);

	// Fetch the current page whenever the server-side query changes.
	useEffect(() => {
		callApi("/jobs", {
			params: {
				company: debCompany,
				title: debTitle,
				view: viewFilter,
				sort,
				direction,
				page,
				pageSize: PAGE_SIZE,
			},
			error: "Failed to load jobs",
			onSuccess: (res) => {
				setJobs(res.items ?? []);
				setTotal(res.total ?? 0);
				setFirstLoad(false);
			},
			onError: () => setFirstLoad(false),
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [debCompany, debTitle, viewFilter, sort, direction, page, reloadKey]);

	// If a mutation shrinks the result set below the current page, step back.
	useEffect(() => {
		if (page > totalPages) setPage(totalPages);
	}, [page, totalPages]);

	const patchJob = useCallback(
		(id, data) => {
			const original = jobsRef.current.find((j) => j.id === id);
			setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...data } : j)));
			callApi("/jobs", {
				method: "PATCH",
				json: { id, ...data },
				error: "Failed to update job",
				onSuccess: () => fetchStats(),
				onError: () => {
					if (original) setJobs((prev) => prev.map((j) => (j.id === id ? original : j)));
				},
			});
		},
		[callApi, fetchStats],
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
						`${prefix(data)}${data.good_fit ?? 0} good, ${data.maybe ?? 0} maybe, ${data.irrelevant ?? 0} no`,
						{ variant },
					);
					refresh();
				},
			}).finally(() => setScreeningIds(new Set()));
		},
		[callApi, enqueueSnackbar, refresh],
	);

	const colDefs = useMemo(() => {
		const cols = [
			{
				field: "relevanceStatus",
				headerName: "Fit",
				width: 110,
				sortable: false,
				cellRenderer: ({ value, data }) =>
					screeningIds.has(data.id) ? (
						<span className="inline-flex items-center gap-1 h-[22px] px-2 rounded-full bg-st-neutral text-st-neutral-fg text-micro font-medium">
							<span className="h-1.5 w-1.5 rounded-full bg-ink-3 pulse-dot" />
							Screening
						</span>
					) : (
						<StatusChip
							value={value}
							options={RELEVANCE_OPTIONS}
							colorMap={RELEVANCE_COLORS}
							menuLabel="Change fit"
							onChange={(v) => patchJob(data.id, { relevanceStatus: v })}
						/>
					),
			},
			{
				headerName: "Job",
				colId: "company",
				flex: 1,
				minWidth: 280,
				sortable: true,
				comparator: () => 0,
				cellStyle: { display: "flex", alignItems: "center" },
				cellRenderer: ({ data }) => (
					<div className="flex flex-col justify-center gap-0.5 h-full overflow-hidden min-w-0">
						<div className="flex items-center gap-1.5 text-label text-ink-2 font-medium leading-tight">
							<SourceIcon source={data.source} className="w-3 h-3 shrink-0" />
							<span className="truncate">{data.company}</span>
							{data.location && <span className="text-ink-3">· {data.location.split(",")[0]}</span>}
						</div>
						{data.url ? (
							<a
								href={data.url}
								target="_blank"
								rel="noopener noreferrer"
								className="text-body font-semibold text-ink hover:text-accent truncate leading-snug transition-colors"
							>
								{data.title}
							</a>
						) : (
							<span className="text-body font-semibold text-ink truncate leading-snug">
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
				sortable: false,
				cellRenderer: ({ value, data }) => (
					<StatusChip
						value={value}
						options={APP_OPTIONS}
						colorMap={APP_COLORS}
						menuLabel="Change status"
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
				comparator: () => 0,
				cellRenderer: ({ value }) => <AtsScoreCell value={value} />,
			},
			{
				headerName: "Docs",
				width: 130,
				sortable: false,
				cellRenderer: ({ data }) => {
					const hasDocs = data.hasGeneratedCv || data.hasGeneratedCl;
					const isGenerating = data.agentStatus === "generating";

					if (data.agentStatus === "pending" && !hasDocs) {
						return <span className="text-ink-3 text-label">-</span>;
					}

					return (
						<div className="flex items-center gap-1.5 h-full">
							{isGenerating && (
								<span className="inline-block w-1.5 h-1.5 rounded-full bg-accent shrink-0 pulse-dot" />
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
				comparator: () => 0,
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
						type="button"
						onClick={() => navigate(`/jobs/${data.id}/tweak`)}
						title="Tweak CV & cover letter"
						aria-label="Tweak CV and cover letter"
						className="inline-flex items-center justify-center h-7 w-7 rounded-md text-ink-3 hover:bg-muted hover:text-ink transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
					>
						<Pencil className="h-3.5 w-3.5" aria-hidden="true" />
					</button>
				);
			},
		});

		return cols;
	}, [patchJob, screeningIds, contact, viewFilter, navigate]);

	// Server drives sorting: read the grid's active sort column, map it to the
	// backend sort/direction params, and reset to page 1 so the refetch lands.
	const handleSortChanged = useCallback((e) => {
		const active = e.api.getColumnState().find((c) => c.sort);
		if (active && SORT_MAP[active.colId]) {
			setSort(SORT_MAP[active.colId]);
			setDirection(active.sort);
		} else {
			setSort("fetchedAt");
			setDirection("desc");
		}
		setPage(1);
	}, []);

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
						onSuccess: refresh,
					});
				}
			},
		});
	};

	const handleScreen = () => {
		if (selectedIds.length > 0) {
			const ids = jobs
				.filter((j) => selectedIds.includes(j.id) && j.relevanceStatus === "unscreened")
				.map((j) => j.id);
			screenJobs(ids, { prefix: (d) => `${d.screened ?? 0} screened: ` });
			return;
		}

		// No selection → screen ALL unscreened jobs across every page (empty ids).
		const visibleUnscreened = jobs.filter((j) => j.relevanceStatus === "unscreened").map((j) => j.id);
		setScreeningIds(new Set(visibleUnscreened));
		callApi("/jobs/screen", {
			method: "POST",
			json: {},
			alias: "screenJobs",
			error: "Failed to screen jobs",
			onSuccess: (data) => {
				enqueueSnackbar(
					`${data.screened ?? 0} screened: ${data.good_fit ?? 0} good, ${data.maybe ?? 0} maybe, ${data.irrelevant ?? 0} no`,
					{ variant: "success" },
				);
				refresh();
			},
		}).finally(() => setScreeningIds(new Set()));
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
				setSelectedIds([]);
				refresh();
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
					onSuccess: () => {
						enqueueSnackbar(`${ids.length} document(s) generated`, { variant: "success" });
						refresh();
					},
				});
			},
		});
	};

	useEffect(() => {
		fetchStats();

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
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const toGenerate = jobs.filter((j) => selectedIds.includes(j.id) && !j.hasGeneratedCv).map((j) => j.id);
	const toRegen = jobs.filter((j) => selectedIds.includes(j.id) && j.hasGeneratedCv).map((j) => j.id);
	const screenable =
		selectedIds.length > 0
			? jobs.filter((j) => selectedIds.includes(j.id) && j.relevanceStatus === "unscreened").length
			: stats.unscreened;

	return (
		<div className="flex flex-col h-full overflow-hidden">
			{showAddJob && (
				<AddJobDialog
					onClose={() => setShowAddJob(false)}
					onAdded={(job) => {
						enqueueSnackbar(`Added ${job.title} at ${job.company}`, { variant: "success" });
						if (job.description) {
							screenJobs([job.id], {
								variant: "info",
								prefix: () => "Screening: ",
								error: "Failed to screen job",
							});
						} else {
							refresh();
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
				badge={total}
				actions={
					<>
						<FetchDropdown loading={loading?.fetchJobs} onFetch={handleFetch} />
						<div className="w-px h-5 bg-line mx-1" />
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
			<div className="flex items-center gap-2 px-6 py-2.5 border-b border-line shrink-0 flex-wrap bg-canvas/60">
				<div className="relative">
					<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-3 pointer-events-none z-10" aria-hidden="true" />
					<Input
						placeholder="Company"
						aria-label="Filter by company"
						value={filterCompany}
						onChange={(e) => setFilterCompany(e.target.value)}
						className="w-36 pl-7"
					/>
				</div>
				<div className="relative">
					<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-3 pointer-events-none z-10" aria-hidden="true" />
					<Input
						placeholder="Job title"
						aria-label="Filter by job title"
						value={filterTitle}
						onChange={(e) => setFilterTitle(e.target.value)}
						className="w-44 pl-7"
					/>
				</div>
				<Select
					value={viewFilter}
					ariaLabel="Filter jobs by status"
					onChange={(v) => {
						setViewFilter(v);
						setPage(1);
					}}
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
						onClick={() => {
							setFilterCompany("");
							setFilterTitle("");
							setViewFilter("to_apply");
							setPage(1);
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
						rowData={jobs}
						columnDefs={colDefs}
						suppressCellFocus
						getRowId={(params) => params.data.id}
						getRowStyle={({ data }) => ({
							borderLeft: `2px solid ${(RELEVANCE_META[data?.relevanceStatus] ?? RELEVANCE_META.unscreened).border}`,
						})}
						rowSelection={{
							mode: "multiRow",
							checkboxes: true,
							headerCheckbox: true,
							enableClickSelection: false,
						}}
						onSelectionChanged={(e) => setSelectedIds(e.api.getSelectedRows().map((r) => r.id))}
						onSortChanged={handleSortChanged}
						defaultColDef={{ resizable: true, sortable: false }}
					/>
				)}
			</div>

			{/* Pagination */}
			<div className="flex items-center justify-between gap-3 px-6 py-2.5 border-t border-line shrink-0 bg-canvas/60">
				<span className="text-label text-ink-2 font-mono tabular-nums">
					{total} {total === 1 ? "job" : "jobs"}
				</span>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						disabled={page <= 1}
						onClick={() => setPage((p) => Math.max(1, p - 1))}
					>
						<ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
						Prev
					</Button>
					<span className="text-label text-ink-2 font-mono tabular-nums">
						Page {page} of {totalPages}
					</span>
					<Button
						variant="outline"
						size="sm"
						disabled={page >= totalPages}
						onClick={() => setPage((p) => p + 1)}
					>
						Next
						<ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
					</Button>
				</div>
			</div>
		</div>
	);
}
