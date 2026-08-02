import { Briefcase, MessageSquare, Send, Sparkles, Target, Zap } from "lucide-react";
import { JobRow, MetricCard, ProgressRing } from "./DashboardWidgets";
import { useCallApi } from "services";
import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/clerk-react";

import { CardSkeleton } from "components/ui/skeleton";
import { EmptyState } from "components/ui/empty-state";

const TABS = [
	{ key: "to_apply",  label: "Ready to Apply" },
	{ key: "applied",   label: "Applied"        },
	{ key: "interview", label: "Interviews"     },
	{ key: "all",       label: "All"            },
];

export default function Dashboard() {
	const [jobs, setJobs] = useState([]);
	const [firstLoad, setFirstLoad] = useState(true);
	const [tab, setTab] = useState("to_apply");
	const [callApi] = useCallApi();
	const { user } = useUser();

	useEffect(() => {
		callApi("/jobs", {
			error: "Failed to load jobs",
			onSuccess: (data) => {
				setJobs(data);
				setFirstLoad(false);
			},
			onError: () => setFirstLoad(false),
		});
	}, []);

	const metrics = useMemo(() => {
		const toApply = jobs.filter(j =>
			(j.relevanceStatus === "good_fit" || j.relevanceStatus === "maybe") && j.applicationStatus !== "applied"
		);
		const applied    = jobs.filter(j => j.applicationStatus === "applied");
		const interviews = jobs.filter(j => j.applicationStatus === "interview");
		const scored     = jobs.filter(j => j.atsScore != null);
		const avgAts     = scored.length ? Math.round(scored.reduce((s, j) => s + j.atsScore, 0) / scored.length) : null;
		return { toApply: toApply.length, applied: applied.length, interviews: interviews.length, avgAts };
	}, [jobs]);

	const visibleJobs = useMemo(() => {
		if (tab === "to_apply")  return jobs.filter(j =>
			(j.relevanceStatus === "good_fit" || j.relevanceStatus === "maybe") && j.applicationStatus !== "applied"
		);
		if (tab === "applied")   return jobs.filter(j => j.applicationStatus === "applied");
		if (tab === "interview") return jobs.filter(j => j.applicationStatus === "interview");
		return jobs;
	}, [jobs, tab]);

	const firstName = user?.firstName || (user?.fullName?.split(" ")[0]) || "there";

	return (
		<div className="flex flex-col h-full overflow-hidden">
			{/* Header */}
			<div className="flex items-center px-8 h-14 border-b border-zinc-100 bg-white/60 backdrop-blur-sm shrink-0">
				<h1 className="text-[14px] font-semibold text-zinc-900 tracking-tight">Overview</h1>
			</div>

			<div className="flex-1 overflow-y-auto">
				<div className="max-w-[1100px] mx-auto px-8 py-8 flex flex-col gap-8">

					{/* Greeting */}
					<div>
						<h2 className="text-[22px] font-semibold text-zinc-900 tracking-tight">
							Hey {firstName} —
						</h2>
						<p className="text-[13px] text-zinc-500 mt-1">
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
									value={metrics.toApply}
									Icon={Zap}
									accent
									sub={metrics.toApply > 0 ? "Curated picks for you" : "All caught up"}
								/>
								<MetricCard
									label="Applied"
									value={metrics.applied}
									Icon={Send}
									sub={`${metrics.interviews} converted to interviews`}
								/>
								<MetricCard
									label="Interviews"
									value={metrics.interviews}
									Icon={MessageSquare}
									sub={metrics.interviews === 0 ? "Keep applying" : "Great momentum"}
								/>
								<MetricCard
									label="Avg ATS"
									value={metrics.avgAts != null ? `${metrics.avgAts}%` : "—"}
									Icon={Target}
									sub={metrics.avgAts >= 80 ? "Above benchmark" : "Room to optimize"}
								/>
								<ProgressRing applied={metrics.applied} goal={10} />
							</div>

							{/* Tabbed list */}
							<section className="flex flex-col gap-4">
								<div className="flex items-center border-b border-zinc-100">
									{TABS.map(({ key, label }) => {
										const active = tab === key;
										return (
											<button
												key={key}
												onClick={() => setTab(key)}
												className={`relative px-3 h-9 text-[13px] font-medium transition-colors cursor-pointer ${
													active ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-700"
												}`}
											>
												{label}
												{active && <span className="absolute bottom-[-1px] left-3 right-3 h-[2px] bg-zinc-900 rounded-full" />}
											</button>
										);
									})}
									<span className="ml-auto text-[11px] text-zinc-400 tabular-nums">
										{visibleJobs.length} {visibleJobs.length === 1 ? "job" : "jobs"}
									</span>
								</div>

								<div className="flex flex-col gap-2">
									{visibleJobs.length === 0 ? (
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
										visibleJobs.map(job => <JobRow key={job.id} job={job} />)
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
