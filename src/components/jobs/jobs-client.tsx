"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import { ColDef, SelectionChangedEvent, ModuleRegistry, AllCommunityModule, themeQuartz } from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  fontSize: 13,
  rowHeight: 44,
  headerHeight: 44,
  fontFamily: "Inter, sans-serif",
  selectedRowBackgroundColor: "oklch(0.93 0.034 272.788)",
});
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Zap, FileText, Trash2, ScanSearch, RotateCcw } from "lucide-react";

type ContactInfo = {
  name: string;
  location: string;
  linkedinUrl: string;
  githubUrl: string;
};

export type Job = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  url: string | null;
  atsScore: number | null;
  relevanceStatus: string;
  agentStatus: string;
  applicationStatus: string;
  applicationDate: string | null;
  fetchedAt: string;
  generatedCv: string | null;
  generatedCl: string | null;
  generatedAt: string | null;
};

function AgentStatusCell({ value, jobId, onUpdate }: { value: string; jobId: string; onUpdate: (id: string, status: string) => void }) {
  const colorMap: Record<string, string> = {
    pending: "bg-zinc-100 text-zinc-600",
    generating: "bg-blue-100 text-blue-700",
    reviewing: "bg-yellow-100 text-yellow-700",
    done: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
  };
  return (
    <select
      className={`text-xs font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer ${colorMap[value] ?? colorMap.pending}`}
      value={value}
      onChange={(e) => onUpdate(jobId, e.target.value)}
    >
      <option value="pending">Pending</option>
      <option value="generating">Generating</option>
      <option value="reviewing">Reviewing</option>
      <option value="done">Done</option>
      <option value="rejected">Rejected</option>
    </select>
  );
}

function AppStatusCell({ value, jobId, onUpdate }: { value: string; jobId: string; onUpdate: (id: string, status: string) => void }) {
  const options = [
    { value: "new", label: "New" },
    { value: "applied", label: "Applied" },
    { value: "interview", label: "Interview" },
    { value: "offer", label: "Offer" },
    { value: "rejected", label: "Rejected" },
  ];
  const colorMap: Record<string, string> = {
    new: "bg-zinc-100 text-zinc-600",
    applied: "bg-blue-100 text-blue-700",
    interview: "bg-purple-100 text-purple-700",
    offer: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
  };
  return (
    <select
      className={`text-xs font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer ${colorMap[value] ?? colorMap.new}`}
      value={value}
      onChange={(e) => onUpdate(jobId, e.target.value)}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function AppliedDateCell({ value, jobId, onUpdate }: { value: string | null; jobId: string; onUpdate: (id: string, date: string) => void }) {
  return (
    <input
      type="date"
      className="text-xs text-zinc-600 border-0 bg-transparent cursor-pointer w-full"
      value={value ? new Date(value).toISOString().slice(0, 10) : ""}
      onChange={(e) => onUpdate(jobId, e.target.value)}
    />
  );
}

function AtsScoreCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-zinc-400 text-xs">—</span>;
  const color = value >= 85 ? "text-green-600" : value >= 70 ? "text-yellow-600" : "text-red-600";
  return <span className={`font-semibold text-sm ${color}`}>{value}</span>;
}


function RelevanceCell({ value, isScreening, jobId, onUpdate }: { value: string; isScreening?: boolean; jobId: string; onUpdate: (id: string, status: string) => void }) {
  const colorMap: Record<string, string> = {
    unscreened: "bg-zinc-100 text-zinc-400",
    good_fit: "bg-green-100 text-green-700",
    maybe: "bg-yellow-100 text-yellow-700",
    irrelevant: "bg-red-100 text-red-600",
  };
  const labels: Record<string, string> = {
    unscreened: "?",
    good_fit: "Good",
    maybe: "Maybe",
    irrelevant: "No",
  };
  if (isScreening) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-500">
        <svg className="animate-spin h-3 w-3 mr-1" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        ...
      </span>
    );
  }
  return (
    <select
      className={`text-xs font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer ${colorMap[value] ?? colorMap.unscreened}`}
      value={value}
      onChange={(e) => onUpdate(jobId, e.target.value)}
    >
      <option value="unscreened">?</option>
      <option value="good_fit">Good</option>
      <option value="maybe">Maybe</option>
      <option value="irrelevant">No</option>
    </select>
  );
}

function escapeCl(s: string): string {
  return s
    .replace(/\\/g, "")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/\*\*(.+?)\*\*/g, "\\textbf{$1}");
}

function buildClLatex(text: string, contact: ContactInfo | null): string {
  const nameLine = contact?.name ? `{\\Large\\bfseries ${contact.name}}\\\\[2pt]` : "";
  const locationLine = contact?.location ? `{\\small ${contact.location}}\\\\[1pt]` : "";
  const urlParts = [contact?.linkedinUrl, contact?.githubUrl].filter(Boolean);
  const urlLine = urlParts.length > 0
    ? `{\\small ${urlParts.join(" \\quad\\textbar\\quad ")}}`
    : "";

  return `\\documentclass[11pt]{article}
\\usepackage[top=0.9in,bottom=1in,left=1.1in,right=1.1in]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\usepackage{microtype}
\\usepackage{parskip}
\\setlength{\\parskip}{9pt}
\\setlength{\\parindent}{0pt}
\\pagestyle{empty}
\\begin{document}
\\begin{center}
  ${nameLine}
  ${locationLine}
  ${urlLine}
\\end{center}
\\vspace{0.4em}
\\hrule
\\vspace{1em}
${escapeCl(text)}
\\end{document}`;
}

function DocCell({ value, label, contact }: { value: string | null; label: string; contact: ContactInfo | null }) {
  const [loading, setLoading] = useState(false);
  if (!value) return <span className="text-zinc-300 text-xs">—</span>;

  const openPdf = async () => {
    setLoading(true);
    try {
      const isLatex = value.includes("\\documentclass") || value.includes("\\begin{");
      const latex = isLatex ? value : buildClLatex(value, contact);
      const res = await fetch("/api/cv/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latex }),
      });
      if (!res.ok) {
        const text = await res.text();
        alert("PDF compile failed:\n" + text.slice(0, 300));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-blue-600 transition-colors disabled:opacity-40"
      onClick={openPdf}
      disabled={loading}
    >
      <FileText className="h-3.5 w-3.5" />
      {loading ? "..." : label}
    </button>
  );
}

function GenerateButtons({
  jobs,
  selectedIds,
  generating,
  onGenerate,
  onRegenerate,
}: {
  jobs: Job[];
  selectedIds: string[];
  generating: boolean;
  onGenerate: () => void;
  onRegenerate: () => void;
}) {
  const generateCount = jobs.filter((j) => selectedIds.includes(j.id) && !j.generatedCv).length;
  const regenCount = jobs.filter((j) => selectedIds.includes(j.id) && j.generatedCv).length;

  if (selectedIds.length === 0) {
    return (
      <Button size="sm" disabled>
        <Zap className="h-3.5 w-3.5 mr-1.5" />
        Generate
      </Button>
    );
  }

  return (
    <>
      {regenCount > 0 && (
        <Button variant="outline" size="sm" onClick={onRegenerate} disabled={generating}>
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          {generating ? "Generating..." : `Regenerate (${regenCount})`}
        </Button>
      )}
      {generateCount > 0 && (
        <Button size="sm" onClick={onGenerate} disabled={generating}>
          <Zap className="h-3.5 w-3.5 mr-1.5" />
          {generating ? "Generating..." : `Generate (${generateCount})`}
        </Button>
      )}
    </>
  );
}

export function JobsClient({ initialJobs }: { initialJobs: Job[] }) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [fetching, setFetching] = useState(false);
  const [datePosted, setDatePosted] = useState("week");
  const [generating, setGenerating] = useState(false);
  const [screening, setScreening] = useState(false);
  const [screeningIds, setScreeningIds] = useState<Set<string>>(new Set());
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => setContact({
        name: d.fullName ?? "",
        location: d.currentLocation ?? "",
        linkedinUrl: d.linkedinUrl ?? "",
        githubUrl: d.githubUrl ?? "",
      }));
  }, []);

  // Filters
  const [filterCompany, setFilterCompany] = useState("");
  const [filterTitle, setFilterTitle] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [viewFilter, setViewFilter] = useState("to_apply");

  const unscreenedCount = useMemo(() => jobs.filter((j) => j.relevanceStatus === "unscreened").length, [jobs]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      if (viewFilter === "to_apply" && (
        (j.relevanceStatus !== "good_fit" && j.relevanceStatus !== "maybe") ||
        j.applicationStatus === "applied"
      )) return false;
      if (viewFilter === "applied" && j.applicationStatus !== "applied") return false;
      if (filterCompany && !j.company.toLowerCase().includes(filterCompany.toLowerCase())) return false;
      if (filterTitle && !j.title.toLowerCase().includes(filterTitle.toLowerCase())) return false;
      if (filterStatus !== "all" && j.applicationStatus !== filterStatus) return false;
      return true;
    });
  }, [jobs, filterCompany, filterTitle, filterStatus, viewFilter]);

  const updateAgentStatus = useCallback(async (id: string, agentStatus: string) => {
    setJobs((prev) => prev.map((j) => j.id === id ? { ...j, agentStatus } : j));
    await fetch("/api/jobs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, agentStatus }),
    });
  }, []);

  const updateRelevance = useCallback(async (id: string, relevanceStatus: string) => {
    setJobs((prev) => prev.map((j) => j.id === id ? { ...j, relevanceStatus } : j));
    await fetch("/api/jobs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, relevanceStatus }),
    });
  }, []);

  const updateAppStatus = useCallback(async (id: string, applicationStatus: string) => {
    const applicationDate = applicationStatus === "applied" ? new Date().toISOString() : undefined;
    setJobs((prev) => prev.map((j) => j.id === id ? { ...j, applicationStatus, ...(applicationDate ? { applicationDate } : {}) } : j));
    await fetch("/api/jobs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, applicationStatus, ...(applicationDate ? { applicationDate } : {}) }),
    });
  }, []);

  const updateAppDate = useCallback(async (id: string, dateStr: string) => {
    const applicationDate = dateStr ? new Date(dateStr).toISOString() : null;
    setJobs((prev) => prev.map((j) => j.id === id ? { ...j, applicationDate } : j));
    await fetch("/api/jobs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, applicationDate }),
    });
  }, []);

  const colDefs = useMemo<ColDef[]>(() => [
    { width: 48, pinned: "left", resizable: false },
    {
      field: "relevanceStatus", headerName: "Fit", width: 70,
      cellRenderer: (p: { value: string; data: Job }) => (
        <RelevanceCell value={p.value} isScreening={screeningIds.has(p.data.id)} jobId={p.data.id} onUpdate={updateRelevance} />
      ),
    },
    { field: "company", headerName: "Company", width: 160, sortable: true, filter: true },
    {
      field: "title", headerName: "Job Title", flex: 1, minWidth: 200, sortable: true, filter: true,
      cellRenderer: (p: { value: string; data: Job }) => p.data.url
        ? <a href={p.data.url} target="_blank" rel="noopener noreferrer" className="text-zinc-900 hover:text-blue-600 hover:underline font-medium">{p.value}</a>
        : <span>{p.value}</span>,
    },
    { field: "location", headerName: "Location", width: 140, sortable: true },
    {
      field: "applicationStatus", headerName: "Status", width: 140,
      cellRenderer: (p: { value: string; data: Job }) => (
        <AppStatusCell value={p.value} jobId={p.data.id} onUpdate={updateAppStatus} />
      ),
    },
    {
      field: "atsScore", headerName: "ATS Score", width: 110,
      cellRenderer: AtsScoreCell, sortable: true,
    },
    {
      field: "agentStatus", headerName: "Agent Status", width: 130,
      cellRenderer: (p: { value: string; data: Job }) => (
        <AgentStatusCell value={p.value} jobId={p.data.id} onUpdate={updateAgentStatus} />
      ),
    },
    {
      field: "generatedCv", headerName: "CV", width: 80,
      cellRenderer: (p: { value: string | null }) => <DocCell value={p.value} label="CV" contact={contact} />,
    },
    {
      field: "generatedCl", headerName: "Cover Letter", width: 110,
      cellRenderer: (p: { value: string | null }) => <DocCell value={p.value} label="CL" contact={contact} />,
    },
    {
      field: "generatedAt", headerName: "Generated", width: 130, sortable: true,
      comparator: (a, b) => {
        if (!a && !b) return 0;
        if (!a) return -1;
        if (!b) return 1;
        return new Date(a).getTime() - new Date(b).getTime();
      },
      valueFormatter: (p) => {
        if (!p.value) return "—";
        const d = new Date(p.value);
        return `${d.getDate().toString().padStart(2,"0")}/${(d.getMonth()+1).toString().padStart(2,"0")} ${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`;
      },
    },
    {
      field: "fetchedAt", headerName: "Fetched", width: 130, sortable: true,
      comparator: (a, b) => {
        if (!a && !b) return 0;
        if (!a) return -1;
        if (!b) return 1;
        return new Date(a).getTime() - new Date(b).getTime();
      },
      valueFormatter: (p) => {
        if (!p.value) return "—";
        const d = new Date(p.value);
        return `${d.getDate().toString().padStart(2,"0")}/${(d.getMonth()+1).toString().padStart(2,"0")} ${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`;
      },
    },
    {
      field: "applicationDate", headerName: "Applied Date", width: 130, sortable: true,
      cellRenderer: (p: { value: string | null; data: Job }) => (
        <AppliedDateCell value={p.value} jobId={p.data.id} onUpdate={updateAppDate} />
      ),
    },
  ], [updateAppStatus, updateAppDate, updateAgentStatus, updateRelevance, screeningIds, contact]);

  const handleFetch = async () => {
    setFetching(true);
    setStatusMsg("Fetching...");
    const res = await fetch("/api/jobs/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ datePosted }),
    });
    const data = await res.json();
    if (res.ok) {
      const refreshed: Job[] = await fetch("/api/jobs").then((r) => r.json());
      setJobs(refreshed);
      setStatusMsg(`Fetched: ${data.inserted} new, ${data.skipped} skipped`);
      // Auto-screen all unscreened jobs
      const unscreenedIds = refreshed
        .filter((j) => j.relevanceStatus === "unscreened")
        .map((j) => j.id);
      if (unscreenedIds.length > 0) {
        setScreeningIds(new Set(unscreenedIds));
        setStatusMsg(`Screening ${unscreenedIds.length} jobs...`);
        setTimeout(async () => {
          try {
            const screenRes = await fetch("/api/jobs/screen", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ids: unscreenedIds }),
            });
            const screenData = await screenRes.json().catch(() => ({}));
            if (screenRes.ok) {
              const screened: Job[] = await fetch("/api/jobs").then((r) => r.json());
              setJobs(screened);
              setStatusMsg(`Screened ${screenData.screened ?? unscreenedIds.length} jobs`);
            } else {
              setStatusMsg(`Screening failed: ${screenData.error ?? "Unknown error"}`);
            }
          } catch (e) {
            setStatusMsg(`Screening error: ${String(e)}`);
          }
          setScreeningIds(new Set());
          setTimeout(() => setStatusMsg(null), 4000);
        }, 500);
      } else {
        setTimeout(() => setStatusMsg(null), 3000);
      }
    } else {
      setStatusMsg(`Fetch failed: ${data.error}`);
    }
    setFetching(false);
  };

  const handleDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} job(s)? This cannot be undone.`)) return;
    await fetch("/api/jobs/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds }),
    });
    setJobs((prev) => prev.filter((j) => !selectedIds.includes(j.id)));
    setSelectedIds([]);
  };

  const handleScreen = async () => {
    // Only screen unscreened jobs from selection (or all unscreened if none selected)
    const toScreen = selectedIds.length > 0
      ? jobs.filter((j) => selectedIds.includes(j.id) && j.relevanceStatus === "unscreened").map((j) => j.id)
      : jobs.filter((j) => j.relevanceStatus === "unscreened").map((j) => j.id);
    if (toScreen.length === 0) return;
    setScreening(true);
    setScreeningIds(new Set(toScreen));
    setStatusMsg(`Screening ${toScreen.length} jobs...`);
    const res = await fetch("/api/jobs/screen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: toScreen }),
    });
    const data = await res.json();
    if (res.ok) {
      const refreshed = await fetch("/api/jobs").then((r) => r.json());
      setJobs(refreshed);
      setStatusMsg(`Screened ${data.screened} jobs: ${data.good_fit} good, ${data.maybe} maybe, ${data.irrelevant} no.`);
    } else {
      setStatusMsg(`Screening failed: ${data.error}`);
    }
    setScreeningIds(new Set());
    setScreening(false);
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const runGenerate = async (ids: string[]) => {
    if (ids.length === 0) return;
    const cvCheck = await fetch("/api/cv");
    const cvData = await cvCheck.json();
    if (!cvData?.latexSource) {
      setStatusMsg("No CV found. Please go to My CV and add your CV first.");
      return;
    }
    setGenerating(true);
    // Grey out all selected jobs immediately
    setJobs((prev) => prev.map((j) => ids.includes(j.id) ? { ...j, agentStatus: "generating" } : j));
    for (let i = 0; i < ids.length; i++) {
      const jobId = ids[i];
      const job = jobs.find((j) => j.id === jobId);
      setStatusMsg(`Generating ${i + 1}/${ids.length}: ${job?.title ?? ""} at ${job?.company ?? ""}...`);
      const res = await fetch("/api/jobs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      if (res.ok) {
        const updated = await res.json();
        setJobs((prev) => prev.map((j) => j.id === updated.id ? updated : j));
      } else {
        const err = await res.json().catch(() => ({}));
        setStatusMsg(`Error: ${err.error ?? "Generation failed."}`);
        setGenerating(false);
        return;
      }
    }
    setStatusMsg(`Done — ${ids.length} job(s) generated.`);
    setTimeout(() => setStatusMsg(null), 4000);
    setGenerating(false);
  };

  const handleGenerate = () => {
    const toGenerate = jobs
      .filter((j) => selectedIds.includes(j.id) && !j.generatedCv)
      .map((j) => j.id);
    runGenerate(toGenerate);
  };

  const handleRegenerate = () => {
    const toRegen = jobs
      .filter((j) => selectedIds.includes(j.id) && j.generatedCv)
      .map((j) => j.id);
    runGenerate(toRegen);
  };

  return (
    <div className="flex flex-col gap-4 flex-1">
      {/* Filter bar */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4 flex flex-col gap-3">
        <div className="flex gap-3">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-zinc-500 font-medium">Company</label>
            <Input
              placeholder="Filter by company..."
              value={filterCompany}
              onChange={(e) => setFilterCompany(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-zinc-500 font-medium">Job Title</label>
            <Input
              placeholder="Filter by title..."
              value={filterTitle}
              onChange={(e) => setFilterTitle(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-zinc-500 font-medium">Application Status</label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="applied">Applied</SelectItem>
                <SelectItem value="interview">Interview</SelectItem>
                <SelectItem value="offer">Offer</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2 items-center pt-1 border-t border-zinc-100">
          <select
            className="text-xs border border-zinc-200 rounded-md px-2 h-8 bg-white text-zinc-700 cursor-pointer"
            value={viewFilter}
            onChange={(e) => setViewFilter(e.target.value)}
          >
            <option value="to_apply">To Apply</option>
            <option value="applied">Applied</option>
            <option value="all">Show All</option>
          </select>
          <Button variant="outline" size="sm" onClick={() => { setFilterCompany(""); setFilterTitle(""); setFilterStatus("all"); setViewFilter("to_apply"); }}>
            Clear filters
          </Button>
          {selectedIds.length === 0 && (
            <>
              <div className="w-px h-4 bg-zinc-200 mx-1" />
              <select
                className="text-xs border border-zinc-200 rounded-md px-2 h-8 bg-white text-zinc-700 cursor-pointer"
                value={datePosted}
                onChange={(e) => setDatePosted(e.target.value)}
                disabled={fetching}
              >
                <option value="24h">Last 24h</option>
                <option value="week">Last week</option>
                <option value="month">Last month</option>
              </select>
              <Button variant="outline" size="sm" onClick={handleFetch} disabled={fetching}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${fetching ? "animate-spin" : ""}`} />
                {fetching ? "Fetching..." : "Fetch"}
              </Button>
            </>
          )}
          {(selectedIds.length > 0
            ? jobs.filter((j) => selectedIds.includes(j.id) && j.relevanceStatus === "unscreened").length > 0
            : unscreenedCount > 0) && (
            <Button variant="outline" size="sm" onClick={handleScreen} disabled={screening}>
              <ScanSearch className={`h-3.5 w-3.5 mr-1.5 ${screening ? "animate-pulse" : ""}`} />
              {screening ? "Screening..." : `Screen (${selectedIds.length > 0 ? jobs.filter((j) => selectedIds.includes(j.id) && j.relevanceStatus === "unscreened").length : unscreenedCount})`}
            </Button>
          )}
          {selectedIds.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleDelete} className="text-red-600 hover:text-red-700 hover:border-red-300">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete ({selectedIds.length})
            </Button>
          )}
          <div className="flex-1" />
          <GenerateButtons
            jobs={jobs}
            selectedIds={selectedIds}
            generating={generating}
            onGenerate={handleGenerate}
            onRegenerate={handleRegenerate}
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 rounded-xl overflow-hidden border border-zinc-200" style={{ height: "calc(100vh - 260px)" }}>
        <AgGridReact
          theme={theme}
          rowData={filteredJobs}
          columnDefs={colDefs}
          rowSelection={{
            mode: "multiRow",
            checkboxes: true,
            headerCheckbox: true,
            enableClickSelection: false,
          }}
          onSelectionChanged={(e: SelectionChangedEvent) => {
            setSelectedIds(e.api.getSelectedRows().map((r: Job) => r.id));
          }}
          rowClassRules={{
            "opacity-50 italic": (p) => (p.data?.agentStatus === "generating" || p.data?.agentStatus === "reviewing") && !p.data?.generatedCv,
          }}
          defaultColDef={{ resizable: true }}
          initialState={{ sort: { sortModel: [{ colId: "generatedAt", sort: "desc" }] } }}
        />
      </div>

      <div className="flex items-center gap-3 text-xs text-zinc-400">
        <span>{filteredJobs.length} jobs</span>
        {statusMsg && <span className={`${statusMsg.startsWith("Error") ? "text-red-500" : "text-blue-500"}`}>{statusMsg}</span>}
      </div>
    </div>
  );
}
