import { ArrowUpRight, ExternalLink } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Badge } from "components/ui/badge";

// ── helpers ────────────────────────────────────────────────────────────────

const COMPANY_COLORS = [
	"bg-rose-500",     "bg-orange-500",  "bg-amber-500",  "bg-lime-500",
	"bg-emerald-500",  "bg-teal-500",    "bg-cyan-500",   "bg-sky-500",
	"bg-blue-500",     "bg-indigo-500",  "bg-violet-500", "bg-fuchsia-500",
];
const colorFor = (name = "") => COMPANY_COLORS[(name.charCodeAt(0) || 0) % COMPANY_COLORS.length];

function domainFromUrl(url) {
	try { return new URL(url).hostname; } catch { return null; }
}

function atsTone(score) {
	if (score == null) return null;
	if (score >= 90) return "success";
	if (score >= 80) return "info";
	if (score >= 70) return "warning";
	return "danger";
}

export function agentTag(status) {
	if (status === "generating") return { label: "Optimizing", tone: "accent" };
	if (status === "reviewing")  return { label: "Reviewing",  tone: "warning" };
	if (status === "done")       return { label: "Ready",      tone: "success" };
	if (status === "rejected")   return { label: "Rejected",   tone: "danger" };
	return null;
}

// ── sub-components ─────────────────────────────────────────────────────────

export function CompanyLogo({ job, size = 36 }) {
	const domain = domainFromUrl(job.url);
	const [err, setErr] = useState(false);
	const bg = colorFor(job.company);
	const px = `${size}px`;

	return (
		<div
			className={`rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center ring-1 ring-black/5 ${domain && !err ? "bg-white" : bg}`}
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
		<Badge tone={tone} dot className="tabular-nums">
			{score}
		</Badge>
	);
}

export function ActionButton({ job }) {
	const navigate = useNavigate();

	if (job.agentStatus === "generating") {
		return (
			<div className="flex items-center gap-1.5 text-[12px] text-indigo-600 font-medium whitespace-nowrap">
				<span className="h-1.5 w-1.5 rounded-full bg-indigo-500" style={{ animation: "pulse 1.2s ease-in-out infinite" }} />
				Generating
			</div>
		);
	}

	if (job.applicationStatus === "applied") {
		return <Badge tone="success" dot>Applied</Badge>;
	}

	if (job.applicationStatus === "interview") {
		return <Badge tone="violet" dot>Interview</Badge>;
	}

	if (job.generatedCv && job.url) {
		return (
			<a
				href={job.url}
				target="_blank"
				rel="noopener noreferrer"
				className="inline-flex items-center gap-1 px-2.5 h-7 rounded-md bg-zinc-900 text-white text-[11px] font-semibold hover:bg-zinc-800 transition-colors whitespace-nowrap"
			>
				Apply
				<ExternalLink className="h-3 w-3" />
			</a>
		);
	}

	return (
		<button
			onClick={() => navigate("/jobs")}
			className="inline-flex items-center gap-1 px-2.5 h-7 rounded-md border border-zinc-200 text-zinc-700 text-[11px] font-medium hover:bg-zinc-50 hover:border-zinc-300 transition-colors whitespace-nowrap"
		>
			Generate
			<ArrowUpRight className="h-3 w-3" />
		</button>
	);
}

export function JobRow({ job }) {
	const isDubai = job.location?.toLowerCase().startsWith("dubai");
	const tag = agentTag(job.agentStatus);

	return (
		<div className="group flex items-center gap-3.5 bg-white rounded-lg px-3 py-2.5 border border-zinc-200/70 hover:border-zinc-300 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all">
			<CompanyLogo job={job} size={36} />

			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2 min-w-0">
					<span className="text-[13px] font-semibold text-zinc-900 truncate">
						{job.url ? (
							<a href={job.url} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600 transition-colors">
								{job.title}
							</a>
						) : job.title}
					</span>
					{tag && <Badge tone={tag.tone}>{tag.label}</Badge>}
				</div>
				<div className="text-[11.5px] text-zinc-500 mt-0.5 flex items-center gap-1.5">
					<span className="font-medium text-zinc-600">{job.company}</span>
					{!isDubai && job.location && (
						<>
							<span className="text-zinc-300">·</span>
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

export function MetricCard({ label, value, Icon, sub, accent = false }) {
	return (
		<div className="flex-1 min-w-[160px] bg-white rounded-xl p-4 border border-zinc-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:border-zinc-300 transition-colors">
			<div className="flex items-center justify-between mb-3">
				<span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">{label}</span>
				<div className={`h-6 w-6 rounded-md flex items-center justify-center ${accent ? "bg-indigo-50 text-indigo-600" : "bg-zinc-100 text-zinc-500"}`}>
					<Icon className="h-3.5 w-3.5" />
				</div>
			</div>
			<div className="text-[26px] font-semibold text-zinc-900 tabular-nums leading-none tracking-tight">{value}</div>
			{sub && <div className="text-[11px] text-zinc-500 mt-2 font-medium">{sub}</div>}
		</div>
	);
}

export function ProgressRing({ applied, goal = 10 }) {
	const r = 26;
	const circ = 2 * Math.PI * r;
	const pct = Math.min(applied / goal, 1);

	return (
		<div className="flex-1 min-w-[200px] bg-white rounded-xl p-4 border border-zinc-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex items-center gap-4">
			<svg width={64} height={64} className="flex-shrink-0">
				<circle cx={32} cy={32} r={r} fill="none" stroke="#f4f4f5" strokeWidth={5} />
				<circle
					cx={32} cy={32} r={r} fill="none"
					stroke="#4f46e5" strokeWidth={5}
					strokeDasharray={`${pct * circ} ${circ}`}
					strokeLinecap="round"
					transform="rotate(-90 32 32)"
					style={{ transition: "stroke-dasharray 0.6s ease" }}
				/>
				<text x={32} y={36} textAnchor="middle" className="fill-zinc-900" style={{ fontSize: 12, fontWeight: 700 }}>
					{Math.round(pct * 100)}%
				</text>
			</svg>
			<div className="min-w-0">
				<div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">Weekly Goal</div>
				<div className="text-[15px] font-semibold text-zinc-900 mt-1 tabular-nums">{applied} <span className="text-zinc-400 font-medium">/ {goal}</span></div>
				<div className="text-[11px] text-zinc-500 mt-0.5">applications</div>
			</div>
		</div>
	);
}
