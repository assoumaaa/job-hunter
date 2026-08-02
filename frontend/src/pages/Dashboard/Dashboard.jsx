import { Briefcase, MessageSquare, Send, Sparkles, Target, Zap } from "lucide-react";
import { JobRow, MetricCard, ProgressRing } from "./DashboardWidgets";
import { useCallApi } from "services";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/clerk-react";

import { CardSkeleton } from "components/ui/skeleton";
import { EmptyState } from "components/ui/empty-state";

const TABS = [
	{ key: "to_apply",  label: "Ready to Apply" },
	{ key: "applied",   label: "Applied"        },
	{ key: "interview", label: "Interviews"     },
	{ key: "all",       label: "All"            },
];

const EMPTY_STATS = { total: 0, toApply: 0, applied: 0, interviews: 0, unscreened: 0, avgAts: null };

// Active tab → the matching aggregate count from /jobs/stats.
const TAB_COUNT = {
	to_apply:  (s) => s.toApply,
	applied:   (s) => s.applied,
	interview: (s) => s.interviews,
	all:       (s) => s.total,
};

export default function Dashboard() {
	const [stats, setStats] = useState(EMPTY_STATS);
	const [jobs, setJobs] = useState([]);
	const [firstLoad, setFirstLoad] = useState(true);
	const [tab, setTab] = useState("to_apply");
	const [callApi] = useCallApi();
	const { user } = useUser();

	// KPI numbers come from the aggregate stats endpoint, not a full list fetch.
	useEffect(() => {
		callApi("/jobs/stats", {
			error: "Failed to load stats",
			onSuccess: (s) => setStats(s ?? EMPTY_STATS),
		});
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// The tabbed list shows just a small page for the active tab.
	useEffect(() => {
		callApi("/jobs", {
			params: { view: tab, page: 1, pageSize: 8 },
			error: "Failed to load jobs",
			onSuccess: (res) => {
				setJobs(res.items ?? []);
				setFirstLoad(false);
			},
			onError: () => setFirstLoad(false),
		});
	}, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

	const firstName = user?.firstName || (user?.fullName?.split(" ")[0]) || "there";
	const tabCount = (TAB_COUNT[tab] ?? (() => 0))(stats);

	// APG tabs: arrows move focus and selection together.
	const onTabKeyDown = (e) => {
		const idx = TABS.findIndex((t) => t.key === tab);
		let next = null;
		if (e.key === "ArrowRight") next = TABS[(idx + 1) % TABS.length];
		if (e.key === "ArrowLeft") next = TABS[(idx - 1 + TABS.length) % TABS.length];
		if (e.key === "Home") next = TABS[0];
		if (e.key === "End") next = TABS[TABS.length - 1];
		if (next) {
			e.preventDefault();
			setTab(next.key);
			document.getElementById(`dashboard-tab-${next.key}`)?.focus();
		}
	};

	return (
		<div className="flex flex-col h-full overflow-hidden">
			{/* Header */}
			<div className="flex items-center px-8 h-14 border-b border-line bg-surface/60 backdrop-blur-sm shrink-0">
				<h1 className="text-body font-semibold text-ink tracking-tight">Overview</h1>
			</div>

			<div className="flex-1 overflow-y-auto">
				<div className="max-w-[1100px] mx-auto px-8 py-8 flex flex-col gap-8">

					{/* Greeting */}
					<div>
						<h2 className="text-display font-semibold text-ink tracking-tight">
							Hey {firstName}.
						</h2>
						<p className="text-body text-ink-2 mt-1">
							Here's how your job hunt is going.
						</p>
					</div>

					{firstLoad ? (
						<>
							<CardSkeleton count={5} className="grid-cols-2 lg:grid-cols-5" />
							<CardSkeleton count={4} />
						</>
					) : (
						<>
							{/* Metrics */}
							<div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
								<MetricCard
									label="Ready"
									value={stats.toApply}
									Icon={Zap}
									accent
									sub={stats.toApply > 0 ? "Curated picks for you" : "All caught up"}
								/>
								<MetricCard
									label="Applied"
									value={stats.applied}
									Icon={Send}
									sub={`${stats.interviews} converted to interviews`}
								/>
								<MetricCard
									label="Interviews"
									value={stats.interviews}
									Icon={MessageSquare}
									sub={stats.interviews === 0 ? "Keep applying" : "Great momentum"}
								/>
								<MetricCard
									label="Avg ATS"
									value={stats.avgAts != null ? `${stats.avgAts}%` : "-"}
									Icon={Target}
									sub={stats.avgAts >= 80 ? "Above benchmark" : "Room to optimize"}
								/>
								<ProgressRing applied={stats.applied} goal={10} />
							</div>

							{/* Tabbed list */}
							<section className="flex flex-col gap-4">
								<div className="flex items-center border-b border-line" role="tablist" aria-label="Job lists">
									{TABS.map(({ key, label }) => {
										const active = tab === key;
										return (
											<button
												key={key}
												id={`dashboard-tab-${key}`}
												type="button"
												role="tab"
												aria-selected={active}
												aria-controls="dashboard-tabpanel"
												tabIndex={active ? 0 : -1}
												onClick={() => setTab(key)}
												onKeyDown={onTabKeyDown}
												className={`relative px-3 h-9 text-body font-medium transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 ${
													active ? "text-ink" : "text-ink-3 hover:text-ink-2"
												}`}
											>
												{label}
												{active && <span className="absolute bottom-[-1px] left-3 right-3 h-[2px] bg-accent rounded-full" />}
											</button>
										);
									})}
									<span className="ml-auto text-micro text-ink-3 font-mono tabular-nums">
										{tabCount} {tabCount === 1 ? "job" : "jobs"}
									</span>
								</div>

								<div
									id="dashboard-tabpanel"
									role="tabpanel"
									aria-labelledby={`dashboard-tab-${tab}`}
									className="flex flex-col gap-2"
								>
									{jobs.length === 0 ? (
										<EmptyState
											icon={Sparkles}
											title="Nothing here yet"
											description={
												tab === "to_apply"
													? "Fetch new jobs from the Jobs page to see curated matches."
													: "Your jobs will show up here as you make progress."
											}
										/>
									) : (
										jobs.map(job => <JobRow key={job.id} job={job} />)
									)}
								</div>
							</section>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
