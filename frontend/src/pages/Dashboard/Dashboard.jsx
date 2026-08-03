import { ArrowRight, ScanSearch, Sparkles } from "lucide-react";
import { GoalTile, JobRow, Pipeline, StatTile } from "./DashboardWidgets";
import { useCallApi } from "services";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";

import { CardSkeleton } from "components/ui/skeleton";
import { EmptyState } from "components/ui/empty-state";

const EMPTY_STATS = {
	total: 0, toApply: 0, applied: 0, interviews: 0, offers: 0,
	unscreened: 0, screened: 0, appliedThisWeek: 0, avgAts: null,
};

export default function Dashboard() {
	const [stats, setStats] = useState(EMPTY_STATS);
	const [nextUp, setNextUp] = useState([]);
	const [firstLoad, setFirstLoad] = useState(true);
	const [callApi] = useCallApi();
	const navigate = useNavigate();
	const { user } = useUser();

	useEffect(() => {
		callApi("/jobs/stats", {
			error: "Failed to load stats",
			onSuccess: (s) => setStats(s ?? EMPTY_STATS),
		});
		// A short, curated shortlist — the full list lives on the Jobs page.
		callApi("/jobs", {
			params: { view: "to_apply", sort: "atsScore", direction: "desc", page: 1, pageSize: 3 },
			error: "Failed to load jobs",
			onSuccess: (res) => {
				setNextUp(res.items ?? []);
				setFirstLoad(false);
			},
			onError: () => setFirstLoad(false),
		});
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	const firstName = user?.firstName || (user?.fullName?.split(" ")[0]) || "there";
	const interviewRate = stats.applied > 0 ? Math.round((stats.interviews / stats.applied) * 100) : null;

	const statusLine =
		stats.unscreened > 0
			? `${stats.unscreened} ${stats.unscreened === 1 ? "job is" : "jobs are"} waiting to be screened.`
			: stats.toApply > 0
				? `${stats.toApply} ${stats.toApply === 1 ? "match is" : "matches are"} ready to apply.`
				: "You're all caught up. Fetch more jobs to keep the pipeline moving.";

	return (
		<div className="flex flex-col h-full overflow-hidden">
			<div className="flex items-center px-8 h-14 border-b border-line bg-surface/60 backdrop-blur-sm shrink-0">
				<h1 className="text-body font-semibold text-ink tracking-tight">Overview</h1>
			</div>

			<div className="flex-1 overflow-y-auto">
				<div className="max-w-[1100px] mx-auto px-8 py-8 flex flex-col gap-6">

					{/* Greeting */}
					<div>
						<h2 className="text-display font-semibold text-ink tracking-tight">Hey {firstName}.</h2>
						<p className="text-body text-ink-2 mt-1">{statusLine}</p>
					</div>

					{firstLoad ? (
						<>
							<CardSkeleton count={5} className="grid-cols-2 lg:grid-cols-5" />
							<CardSkeleton count={3} className="grid-cols-3" />
						</>
					) : (
						<>
							{/* Attention nudge: the single most useful next action */}
							{stats.unscreened > 0 && (
								<button
									type="button"
									onClick={() => navigate("/jobs?view=to_apply")}
									className="group flex items-center gap-3 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-left transition-colors hover:border-accent/50 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
								>
									<div className="h-8 w-8 rounded-lg bg-accent-solid flex items-center justify-center shrink-0">
										<ScanSearch className="h-4 w-4 text-white" aria-hidden="true" />
									</div>
									<div className="flex-1 min-w-0">
										<div className="text-body font-semibold text-accent-text">
											{stats.unscreened} {stats.unscreened === 1 ? "job needs" : "jobs need"} screening
										</div>
										<div className="text-micro text-accent-text/80">
											Score them against your profile to surface the good fits.
										</div>
									</div>
									<ArrowRight className="h-4 w-4 text-accent-text transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
								</button>
							)}

							{/* Pipeline: a map into the Jobs table, not a copy of it */}
							<Pipeline stats={stats} />

							{/* Momentum metrics */}
							<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
								<GoalTile done={stats.appliedThisWeek} goal={10} />
								<StatTile
									label="Avg match"
									value={stats.avgAts != null ? `${stats.avgAts}%` : "-"}
									sub={stats.avgAts >= 80 ? "Above benchmark" : stats.avgAts != null ? "Room to optimize" : "No scores yet"}
								/>
								<StatTile
									label="Interview rate"
									value={interviewRate != null ? `${interviewRate}%` : "-"}
									sub={`${stats.interviews} from ${stats.applied} applied`}
								/>
							</div>

							{/* Next up: top curated picks, with the full list one click away */}
							<section className="flex flex-col gap-3">
								<div className="flex items-center justify-between">
									<h3 className="text-title font-semibold text-ink tracking-tight">Next up</h3>
									<button
										type="button"
										onClick={() => navigate("/jobs?view=to_apply")}
										className="inline-flex items-center gap-1 text-label font-medium text-ink-2 hover:text-ink transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 rounded"
									>
										View all in Jobs
										<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
									</button>
								</div>

								{nextUp.length === 0 ? (
									<EmptyState
										icon={Sparkles}
										title="Nothing ready to apply"
										description="Screen your fetched jobs, then generate a tailored CV to move them here."
									/>
								) : (
									<div className="flex flex-col gap-2">
										{nextUp.map((job) => <JobRow key={job.id} job={job} />)}
									</div>
								)}
							</section>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
