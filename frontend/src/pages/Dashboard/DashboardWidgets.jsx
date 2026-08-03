import { ArrowUpRight, ExternalLink } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Badge } from "components/ui/badge";

// ── helpers ────────────────────────────────────────────────────────────────

const COMPANY_COLORS = [
	"bg-rose-500",     "bg-orange-500",  "bg-amber-500",  "bg-lime-500",
	"bg-emerald-500",  "bg-teal-500",    "bg-cyan-500",   "bg-sky-500",
	"bg-blue-500",     "bg-fuchsia-500",
];
const colorFor = (name = "") => COMPANY_COLORS[(name.charCodeAt(0) || 0) % COMPANY_COLORS.length];

function domainFromUrl(url) {
	try { return new URL(url).hostname; } catch { return null; }
}

function atsTone(score) {
	if (score == null) return null;
	if (score >= 90) return "ok";
	if (score >= 80) return "info";
	if (score >= 70) return "warn";
	return "bad";
}

export function agentTag(status) {
	if (status === "generating") return { label: "Optimizing", tone: "accent" };
	if (status === "reviewing")  return { label: "Reviewing",  tone: "warn" };
	if (status === "done")       return { label: "Ready",      tone: "ok" };
	if (status === "rejected")   return { label: "Rejected",   tone: "bad" };
	return null;
}

// ── company logo ───────────────────────────────────────────────────────────

export function CompanyLogo({ job, size = 36 }) {
	const domain = domainFromUrl(job.url);
	const [err, setErr] = useState(false);
	const bg = colorFor(job.company);
	const px = `${size}px`;

	return (
		<div
			className={`rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center ring-1 ring-line ${domain && !err ? "bg-white" : bg}`}
			style={{ width: px, height: px }}
		>
			{domain && !err ? (
				<img
					src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
					alt=""
					onError={() => setErr(true)}
					className="object-contain"
					style={{ width: size * 0.65, height: size * 0.65 }}
				/>
			) : (
				<span className="font-semibold text-white" style={{ fontSize: size * 0.42 }}>
					{job.company?.[0]?.toUpperCase() ?? "?"}
				</span>
			)}
		</div>
	);
}

export function AtsPill({ score }) {
	const tone = atsTone(score);
	if (!tone) return null;
	return (
		<Badge tone={tone} className="font-mono tabular-nums">
			{score}
		</Badge>
	);
}

// ── pipeline ───────────────────────────────────────────────────────────────

// The application pipeline as a horizontal strip. Each stage links to the
// matching Jobs view, so the dashboard is a map into the table, not a copy of
// it. Bars are sized relative to the largest stage so distribution reads at a
// glance. `dotClass` uses the status-solid tokens (flip with the theme).
const STAGES = [
	{ key: "unscreened", label: "Unscreened", view: "all",       dot: "bg-(--st-neutral-solid)" },
	{ key: "toApply",    label: "Ready",      view: "to_apply",  dot: "bg-accent" },
	{ key: "applied",    label: "Applied",    view: "applied",   dot: "bg-(--st-info-solid)" },
	{ key: "interviews", label: "Interview",  view: "interview", dot: "bg-(--st-warn-solid)" },
	{ key: "offers",     label: "Offer",      view: "all",       dot: "bg-(--st-ok-solid)" },
];

export function Pipeline({ stats }) {
	const navigate = useNavigate();
	const values = STAGES.map((s) => stats[s.key] ?? 0);
	const peak = Math.max(1, ...values);

	return (
		<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px rounded-xl border border-line bg-line overflow-hidden shadow-raised">
			{STAGES.map((s, i) => {
				const value = values[i];
				return (
					<button
						key={s.key}
						type="button"
						onClick={() => navigate(`/jobs?view=${s.view}`)}
						className="group flex flex-col gap-3 bg-surface p-4 text-left transition-colors hover:bg-hovertint focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
					>
						<div className="flex items-center gap-1.5">
							<span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
							<span className="text-micro font-medium text-ink-2 uppercase tracking-wide">{s.label}</span>
						</div>
						<div className="text-stat font-semibold text-ink font-mono tabular-nums leading-none tracking-tight">
							{value}
						</div>
						<div className="h-1 rounded-full bg-muted overflow-hidden">
							<div
								className={`h-full rounded-full ${s.dot}`}
								style={{ width: `${(value / peak) * 100}%`, transition: "width 0.5s ease" }}
							/>
						</div>
					</button>
				);
			})}
		</div>
	);
}

// ── secondary metric tiles ─────────────────────────────────────────────────

export function StatTile({ label, value, sub }) {
	return (
		<div className="bg-surface rounded-xl p-4 border border-line shadow-raised">
			<div className="text-micro font-medium text-ink-2 uppercase tracking-wide">{label}</div>
			<div className="text-stat font-semibold text-ink font-mono tabular-nums leading-none tracking-tight mt-2.5">
				{value}
			</div>
			{sub && <div className="text-micro text-ink-2 mt-2">{sub}</div>}
		</div>
	);
}

export function GoalTile({ done, goal = 10 }) {
	const r = 22;
	const circ = 2 * Math.PI * r;
	const pct = Math.min(done / goal, 1);

	return (
		<div className="bg-surface rounded-xl p-4 border border-line shadow-raised flex items-center gap-4">
			<svg width={56} height={56} className="flex-shrink-0" aria-hidden="true">
				<circle cx={28} cy={28} r={r} className="fill-none stroke-muted" strokeWidth={5} />
				<circle
					cx={28} cy={28} r={r}
					className="fill-none stroke-accent"
					strokeWidth={5}
					strokeDasharray={`${pct * circ} ${circ}`}
					strokeLinecap="round"
					transform="rotate(-90 28 28)"
					style={{ transition: "stroke-dasharray 0.6s ease" }}
				/>
				<text x={28} y={32} textAnchor="middle" className="fill-ink font-mono" style={{ fontSize: 11, fontWeight: 700 }}>
					{Math.round(pct * 100)}%
				</text>
			</svg>
			<div className="min-w-0">
				<div className="text-micro font-medium text-ink-2 uppercase tracking-wide">Weekly goal</div>
				<div className="text-title font-semibold text-ink mt-1 font-mono tabular-nums">
					{done} <span className="text-ink-3 font-medium">/ {goal}</span>
				</div>
				<div className="text-micro text-ink-2 mt-0.5">applied this week</div>
			</div>
		</div>
	);
}

// ── job row (compact, curated Next-up list) ────────────────────────────────

export function ActionButton({ job }) {
	const navigate = useNavigate();

	if (job.agentStatus === "generating") {
		return (
			<div className="flex items-center gap-1.5 text-label text-accent-text font-medium whitespace-nowrap">
				<span className="h-1.5 w-1.5 rounded-full bg-accent pulse-dot" />
				Generating
			</div>
		);
	}

	if (job.generatedCv && job.url) {
		return (
			<a
				href={job.url}
				target="_blank"
				rel="noopener noreferrer"
				className="inline-flex items-center gap-1 px-2.5 h-7 rounded-lg bg-ink text-canvas text-micro font-semibold hover:opacity-90 transition-opacity whitespace-nowrap focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
			>
				Apply
				<ExternalLink className="h-3 w-3" aria-hidden="true" />
			</a>
		);
	}

	return (
		<button
			type="button"
			onClick={() => navigate("/jobs")}
			className="inline-flex items-center gap-1 px-2.5 h-7 rounded-lg border border-line text-ink text-micro font-medium hover:bg-hovertint hover:border-line-strong transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
		>
			Generate
			<ArrowUpRight className="h-3 w-3" aria-hidden="true" />
		</button>
	);
}

export function JobRow({ job }) {
	const isDubai = job.location?.toLowerCase().startsWith("dubai");
	const tag = agentTag(job.agentStatus);

	return (
		<div className="group flex items-center gap-3.5 bg-surface rounded-lg px-3 py-2.5 border border-line hover:border-line-strong hover:shadow-raised transition-all">
			<CompanyLogo job={job} size={36} />

			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2 min-w-0">
					<span className="text-body font-semibold text-ink truncate">
						{job.url ? (
							<a href={job.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent transition-colors">
								{job.title}
							</a>
						) : job.title}
					</span>
					{tag && <Badge tone={tag.tone}>{tag.label}</Badge>}
				</div>
				<div className="text-micro text-ink-2 mt-0.5 flex items-center gap-1.5">
					<span className="font-medium">{job.company}</span>
					{!isDubai && job.location && (
						<>
							<span className="text-ink-3">·</span>
							<span>{job.location.split(",")[0]}</span>
						</>
					)}
				</div>
			</div>

			<AtsPill score={job.atsScore} />

			<div className="flex-shrink-0 min-w-[100px] flex justify-end">
				<ActionButton job={job} />
			</div>
		</div>
	);
}
