import { Briefcase, MessageSquare, ScanSearch, Send, Target, Zap } from "lucide-react";
import { useCallApi } from "services";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

// ── helpers ────────────────────────────────────────────────────────────────

const MESH_GRADIENTS = [
	"linear-gradient(135deg,#667eea,#764ba2)",
	"linear-gradient(135deg,#f093fb,#f5576c)",
	"linear-gradient(135deg,#4facfe,#00f2fe)",
	"linear-gradient(135deg,#43e97b,#38f9d7)",
	"linear-gradient(135deg,#fa709a,#fee140)",
	"linear-gradient(135deg,#a18cd1,#fbc2eb)",
	"linear-gradient(135deg,#fccb90,#d57eeb)",
	"linear-gradient(135deg,#a1c4fd,#c2e9fb)",
];
const meshGradient = (name = "") => MESH_GRADIENTS[name.charCodeAt(0) % MESH_GRADIENTS.length];

function domainFromUrl(url) {
	try { return new URL(url).hostname; } catch { return null; }
}

function atsPill(score) {
	if (score == null) return null;
	if (score >= 90) return { bg: "#d1fae5", dot: "#10b981", text: "#065f46" };
	if (score >= 80) return { bg: "#ecfccb", dot: "#84cc16", text: "#3f6212" };
	return { bg: "#fef3c7", dot: "#f59e0b", text: "#92400e" };
}

function agentTag(status) {
	if (status === "generating") return { label: "Optimizing…", color: "#6366f1", bg: "#eef2ff" };
	if (status === "reviewing")  return { label: "Reviewing",   color: "#d97706", bg: "#fffbeb" };
	if (status === "done")       return { label: "Ready",       color: "#16a34a", bg: "#f0fdf4" };
	if (status === "rejected")   return { label: "Rejected",    color: "#dc2626", bg: "#fef2f2" };
	return null;
}

const TABS = [
	{ key: "to_apply",  label: "To Apply"  },
	{ key: "applied",   label: "Applied"   },
	{ key: "interview", label: "Interview" },
	{ key: "all",       label: "All"       },
];

// ── sub-components ─────────────────────────────────────────────────────────

function CompanyLogo({ job }) {
	const domain = domainFromUrl(job.url);
	const [err, setErr] = useState(false);
	const gradient = meshGradient(job.company);

	return (
		<div style={{
			width: 40, height: 40, borderRadius: 10, flexShrink: 0, overflow: "hidden",
			background: gradient,
			boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
			display: "flex", alignItems: "center", justifyContent: "center",
		}}>
			{domain && !err ? (
				<img
					src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
					alt=""
					onError={() => setErr(true)}
					style={{ width: 26, height: 26, objectFit: "contain" }}
				/>
			) : (
				<span style={{ fontSize: 16, fontWeight: 700, color: "#fff", lineHeight: 1 }}>
					{job.company?.[0]?.toUpperCase() ?? "?"}
				</span>
			)}
		</div>
	);
}

function AtsPill({ score }) {
	const pill = atsPill(score);
	if (!pill) return null;
	return (
		<div style={{
			display: "inline-flex", alignItems: "center", gap: 5,
			background: pill.bg, borderRadius: 999,
			padding: "3px 9px",
			fontSize: 11, fontWeight: 700, color: pill.text,
			flexShrink: 0,
		}}>
			<span style={{ width: 6, height: 6, borderRadius: "50%", background: pill.dot, flexShrink: 0 }} />
			{score} ATS
		</div>
	);
}

function ActionButton({ job, onGenerate }) {
	const navigate = useNavigate();

	if (job.agentStatus === "generating") {
		return (
			<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
				<span style={{
					width: 6, height: 6, borderRadius: "50%", background: "#6366f1", flexShrink: 0,
					animation: "pulse 1.2s ease-in-out infinite",
				}} />
				<span style={{ fontSize: 12, color: "#6366f1", fontWeight: 500, whiteSpace: "nowrap" }}>Generating…</span>
			</div>
		);
	}

	if (job.applicationStatus === "applied") {
		return (
			<span style={{
				fontSize: 12, fontWeight: 600, color: "#16a34a",
				background: "#f0fdf4", border: "1px solid #bbf7d0",
				borderRadius: 8, padding: "5px 12px", whiteSpace: "nowrap",
			}}>Applied ✓</span>
		);
	}

	if (job.applicationStatus === "interview") {
		return (
			<span style={{
				fontSize: 12, fontWeight: 600, color: "#7c3aed",
				background: "#f5f3ff", border: "1px solid #ddd6fe",
				borderRadius: 8, padding: "5px 12px", whiteSpace: "nowrap",
			}}>Interview 🎯</span>
		);
	}

	if (job.generatedCv && job.url) {
		return (
			<a href={job.url} target="_blank" rel="noopener noreferrer" style={{
				fontSize: 12, fontWeight: 600, color: "#fff",
				background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
				borderRadius: 8, padding: "5px 14px",
				textDecoration: "none", whiteSpace: "nowrap",
				boxShadow: "0 2px 8px rgba(99,102,241,0.3)",
				transition: "opacity 0.15s",
			}}
				onMouseEnter={e => e.currentTarget.style.opacity = "0.9"}
				onMouseLeave={e => e.currentTarget.style.opacity = "1"}
			>Apply Now →</a>
		);
	}

	return (
		<button onClick={() => navigate("/jobs")} style={{
			fontSize: 12, fontWeight: 600, color: "#6366f1",
			background: "transparent", border: "1.5px solid #c7d2fe",
			borderRadius: 8, padding: "4px 12px",
			cursor: "pointer", whiteSpace: "nowrap",
			transition: "background 0.12s, border-color 0.12s",
		}}
			onMouseEnter={e => { e.currentTarget.style.background = "#eef2ff"; e.currentTarget.style.borderColor = "#a5b4fc"; }}
			onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "#c7d2fe"; }}
		>Generate Docs</button>
	);
}

function JobRow({ job }) {
	const isDubai = job.location?.toLowerCase().startsWith("dubai");
	const tag = agentTag(job.agentStatus);
	const [hovered, setHovered] = useState(false);

	return (
		<div
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			style={{
				display: "flex", alignItems: "center", gap: 16,
				background: "#fff",
				borderRadius: 12, padding: "12px 18px",
				border: "1px solid #f4f4f5",
				boxShadow: hovered ? "0 6px 24px rgba(0,0,0,0.08)" : "0 1px 3px rgba(0,0,0,0.05)",
				transform: hovered ? "scale(1.005)" : "scale(1)",
				transition: "box-shadow 0.18s, transform 0.18s",
				cursor: "default",
			}}
		>
			<CompanyLogo job={job} />

			{/* Title + meta */}
			<div style={{ flex: 1, minWidth: 0 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
					<span style={{
						fontSize: 14, fontWeight: 600, color: "#18181b",
						overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
					}}>
						{job.url ? (
							<a href={job.url} target="_blank" rel="noopener noreferrer"
								style={{ color: "inherit", textDecoration: "none" }}
								onMouseEnter={e => e.currentTarget.style.color = "#6366f1"}
								onMouseLeave={e => e.currentTarget.style.color = "inherit"}
							>{job.title}</a>
						) : job.title}
					</span>
					{tag && (
						<span style={{
							fontSize: 10, fontWeight: 600, color: tag.color,
							background: tag.bg, borderRadius: 6,
							padding: "2px 6px", whiteSpace: "nowrap", flexShrink: 0,
						}}>
							{tag.label}
						</span>
					)}
				</div>
				<div style={{ fontSize: 12, color: "#a1a1aa", marginTop: 3, display: "flex", gap: 6, alignItems: "center" }}>
					<span>{job.company}</span>
					{!isDubai && job.location && (
						<><span style={{ color: "#e4e4e7" }}>·</span><span>{job.location.split(",")[0]}</span></>
					)}
				</div>
			</div>

			<AtsPill score={job.atsScore} />

			<div style={{ flexShrink: 0, minWidth: 130, display: "flex", justifyContent: "flex-end" }}>
				<ActionButton job={job} />
			</div>
		</div>
	);
}

function MetricCard({ label, value, Icon, sub, color = "#6366f1" }) {
	return (
		<div style={{
			flex: 1, borderRadius: 14, padding: "18px 20px",
			background: "rgba(255,255,255,0.75)",
			backdropFilter: "blur(12px)",
			WebkitBackdropFilter: "blur(12px)",
			border: "1px solid rgba(255,255,255,0.6)",
			boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
			position: "relative", overflow: "hidden",
		}}>
			<Icon style={{ position: "absolute", top: 16, right: 16, width: 16, height: 16, color: "#e4e4e7" }} />
			<div style={{ fontSize: 28, fontWeight: 700, color, letterSpacing: "-0.5px", lineHeight: 1 }}>{value}</div>
			<div style={{ fontSize: 12, color: "#a1a1aa", fontWeight: 500, marginTop: 5 }}>{label}</div>
			{sub && <div style={{ fontSize: 11, color: "#10b981", fontWeight: 500, marginTop: 6 }}>{sub}</div>}
		</div>
	);
}

function ProgressRing({ applied, goal = 10 }) {
	const r = 30;
	const circ = 2 * Math.PI * r;
	const pct = Math.min(applied / goal, 1);

	return (
		<div style={{
			flex: "0 0 auto", borderRadius: 14, padding: "18px 20px",
			background: "rgba(255,255,255,0.75)",
			backdropFilter: "blur(12px)",
			WebkitBackdropFilter: "blur(12px)",
			border: "1px solid rgba(255,255,255,0.6)",
			boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
			display: "flex", alignItems: "center", gap: 16,
		}}>
			<svg width={72} height={72} style={{ flexShrink: 0 }}>
				<circle cx={36} cy={36} r={r} fill="none" stroke="#f4f4f5" strokeWidth={5} />
				<circle
					cx={36} cy={36} r={r} fill="none"
					stroke="url(#ring-grad)" strokeWidth={5}
					strokeDasharray={`${pct * circ} ${circ}`}
					strokeLinecap="round"
					transform="rotate(-90 36 36)"
					style={{ transition: "stroke-dasharray 0.6s ease" }}
				/>
				<defs>
					<linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
						<stop offset="0%" stopColor="#6366f1" />
						<stop offset="100%" stopColor="#8b5cf6" />
					</linearGradient>
				</defs>
				<text x={36} y={40} textAnchor="middle" style={{ fontSize: 14, fontWeight: 700, fill: "#18181b" }}>
					{applied}
				</text>
			</svg>
			<div>
				<div style={{ fontSize: 13, fontWeight: 600, color: "#18181b" }}>Daily Goal</div>
				<div style={{ fontSize: 12, color: "#a1a1aa", marginTop: 3 }}>{applied} / {goal} applied</div>
				<div style={{ fontSize: 11, color: "#10b981", marginTop: 4, fontWeight: 500 }}>
					{Math.round(pct * 100)}% complete
				</div>
			</div>
		</div>
	);
}

// ── main ───────────────────────────────────────────────────────────────────

export default function Dashboard() {
	const [jobs, setJobs] = useState([]);
	const [tab, setTab] = useState("to_apply");
	const [callApi] = useCallApi();

	useEffect(() => {
		callApi("/jobs", { error: "Failed to load jobs", onSuccess: setJobs });
	}, []);

	const metrics = useMemo(() => {
		const toApply = jobs.filter(j =>
			(j.relevanceStatus === "good_fit" || j.relevanceStatus === "maybe") && j.applicationStatus !== "applied"
		);
		const applied   = jobs.filter(j => j.applicationStatus === "applied");
		const interviews = jobs.filter(j => j.applicationStatus === "interview");
		const scored    = jobs.filter(j => j.atsScore != null);
		const avgAts    = scored.length ? Math.round(scored.reduce((s, j) => s + j.atsScore, 0) / scored.length) : null;
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

	return (
		<div className="flex flex-col h-full overflow-hidden" style={{
			background: "linear-gradient(145deg, #f8f7ff 0%, #f0f4ff 50%, #faf8ff 100%)",
		}}>
			{/* Header */}
			<div style={{
				display: "flex", alignItems: "center", gap: 12,
				padding: "0 24px", height: 56,
				borderBottom: "1px solid rgba(0,0,0,0.05)",
				background: "rgba(255,255,255,0.6)",
				backdropFilter: "blur(8px)",
			}}>
				<h1 style={{ fontSize: 14, fontWeight: 600, color: "#18181b", margin: 0 }}>Dashboard</h1>
			</div>

			<div style={{ flex: 1, overflowY: "auto" }}>
				<div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 24px", display: "flex", flexDirection: "column", gap: 24 }}>

					{/* Metrics row */}
					<div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
						<MetricCard
							label="Ready to Apply"
							value={metrics.toApply}
							Icon={Zap}
							color="#6366f1"
							sub={`+${Math.max(0, metrics.toApply - metrics.applied)} since last week`}
						/>
						<MetricCard
							label="Applied"
							value={metrics.applied}
							Icon={Send}
							color="#3b82f6"
							sub={metrics.interviews > 0 ? `${metrics.interviews} interview${metrics.interviews > 1 ? "s" : ""} won` : "Keep applying"}
						/>
						<MetricCard
							label="Interviews"
							value={metrics.interviews}
							Icon={MessageSquare}
							color="#8b5cf6"
							sub={metrics.interviews === 0 ? "Apply to unlock" : "🎉 Great progress"}
						/>
						<MetricCard
							label="Avg. ATS Match"
							value={metrics.avgAts != null ? `${metrics.avgAts}%` : "—"}
							Icon={Target}
							color={metrics.avgAts >= 80 ? "#16a34a" : "#f59e0b"}
							sub={metrics.avgAts >= 80 ? "Above benchmark" : "Optimize your CV"}
						/>
						<ProgressRing applied={metrics.applied} goal={10} />
					</div>

					{/* Tab bar + list */}
					<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
						<div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid #f4f4f5" }}>
							{TABS.map(({ key, label }) => {
								const active = tab === key;
								return (
									<button key={key} onClick={() => setTab(key)} style={{
										fontSize: 13, fontWeight: 500,
										padding: "8px 14px",
										border: "none", background: "none", cursor: "pointer",
										color: active ? "#6366f1" : "#a1a1aa",
										borderBottom: active ? "2px solid #6366f1" : "2px solid transparent",
										marginBottom: -1,
										transition: "color 0.15s",
									}}>{label}</button>
								);
							})}
							<span style={{ marginLeft: "auto", fontSize: 12, color: "#d4d4d8", paddingRight: 4, alignSelf: "center" }}>
								{visibleJobs.length} jobs
							</span>
						</div>

						<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
							{visibleJobs.length === 0 ? (
								<div style={{ textAlign: "center", color: "#d4d4d8", fontSize: 13, padding: "48px 0" }}>
									No jobs here yet
								</div>
							) : (
								visibleJobs.map(job => <JobRow key={job.id} job={job} />)
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
