"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Plus, Save } from "lucide-react";
import { COUNTRIES } from "@/lib/countries";

const SUGGESTED = ["Backend Engineer", "Frontend Engineer", "Solution Engineer", "Full Stack Engineer", "Software Engineer", "DevOps Engineer"];
const JOB_TYPES = [
  { value: "fulltime", label: "Full-time" },
  { value: "contract", label: "Contract" },
  { value: "parttime", label: "Part-time" },
  { value: "internship", label: "Internship" },
];

type Position = { id: string; label: string };

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [input, setInput] = useState("");

  // Fetch settings (stored in profile)
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedJobTypes, setSelectedJobTypes] = useState<string[]>(["fulltime"]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const keywordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/positions").then((r) => r.json()).then(setPositions);
    fetch("/api/job-settings").then((r) => r.json()).then((d) => {
      setSelectedCountries(d.preferredLocations ? JSON.parse(d.preferredLocations) : []);
      setSelectedJobTypes(d.jobTypes ? JSON.parse(d.jobTypes) : ["fulltime"]);
      setKeywords(d.keywords ? JSON.parse(d.keywords) : []);
    });
  }, []);

  const add = async (label: string) => {
    if (!label.trim() || positions.find((p) => p.label === label)) return;
    const res = await fetch("/api/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    const p = await res.json();
    setPositions((prev) => [...prev, p]);
    setInput("");
  };

  const remove = async (id: string) => {
    await fetch("/api/positions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setPositions((prev) => prev.filter((p) => p.id !== id));
  };

  const toggleCountry = (code: string) =>
    setSelectedCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );

  const toggleJobType = (value: string) =>
    setSelectedJobTypes((prev) =>
      prev.includes(value) && prev.length > 1
        ? prev.filter((t) => t !== value)
        : prev.includes(value)
        ? prev
        : [...prev, value]
    );

  const addKeyword = (raw: string) => {
    const trimmed = raw.trim().replace(/,+$/, "");
    if (!trimmed || keywords.includes(trimmed)) return;
    setKeywords((prev) => [...prev, trimmed]);
    setKeywordInput("");
  };

  const saveSettings = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/job-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferredLocations: JSON.stringify(selectedCountries),
          jobTypes: JSON.stringify(selectedJobTypes),
          keywords: JSON.stringify(keywords),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaveError(err.error ?? "Save failed");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      setSaveError("Network error");
    } finally {
      setSaving(false);
    }
  };

  // Group countries by region for display
  const regions: { label: string; codes: string[] }[] = [
    { label: "Middle East", codes: ["AE", "SA", "QA", "KW"] },
    { label: "Western Europe", codes: ["GB", "DE", "FR", "NL", "CH", "IE", "BE", "AT", "ES", "PT"] },
    { label: "Nordic", codes: ["SE", "NO", "DK", "FI"] },
    { label: "Eastern Europe", codes: ["PL", "CZ", "EE"] },
    { label: "Americas", codes: ["US", "CA"] },
    { label: "APAC", codes: ["SG", "AU"] },
  ];

  return (
    <div className="p-6 max-w-2xl flex flex-col gap-6 h-full overflow-y-auto">
      <div>
        <h1 className="text-xl font-semibold">Positions & Fetch Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">Configure what to search for and where when syncing from LinkedIn.</p>
      </div>

      {/* Job titles */}
      <div className="bg-white border border-zinc-200 rounded-xl p-5 flex flex-col gap-4">
        <span className="text-sm font-medium">Job Titles</span>
        {positions.length === 0 ? (
          <p className="text-sm text-zinc-400">No positions added yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {positions.map((p) => (
              <div key={p.id} className="flex items-center gap-1 bg-zinc-100 rounded-full px-3 py-1 text-sm">
                {p.label}
                <button onClick={() => remove(p.id)} className="ml-1 text-zinc-400 hover:text-zinc-700">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            placeholder="e.g. Platform Engineer"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add(input)}
          />
          <Button onClick={() => add(input)}><Plus className="h-4 w-4 mr-1" /> Add</Button>
        </div>
        <div className="flex flex-wrap gap-2 pt-1 border-t border-zinc-100">
          {SUGGESTED.map((s) => (
            <button
              key={s}
              onClick={() => add(s)}
              disabled={!!positions.find((p) => p.label === s)}
              className="text-sm px-3 py-1 rounded-full border border-zinc-200 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-default"
            >
              + {s}
            </button>
          ))}
        </div>
      </div>

      {/* Fetch settings card */}
      <div className="bg-white border border-zinc-200 rounded-xl divide-y divide-zinc-100">
        <div className="px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Fetch Settings</p>
            <p className="text-xs text-zinc-400 mt-0.5">Applied every time you sync jobs</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button size="sm" onClick={saveSettings} disabled={saving}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {saved ? "Saved!" : saving ? "Saving..." : saveError ? "Error" : "Save"}
            </Button>
            {saveError && <p className="text-xs text-red-500">{saveError}</p>}
          </div>
        </div>

        {/* Job type */}
        <div className="px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Job Type</p>
            <p className="text-xs text-zinc-400 mt-0.5">Employment types to fetch</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            {JOB_TYPES.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => toggleJobType(value)}
                className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                  selectedJobTypes.includes(value)
                    ? "bg-indigo-50 text-indigo-700 border-indigo-300"
                    : "border-zinc-200 text-zinc-600 hover:border-zinc-400"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Countries */}
        <div className="px-5 py-4 flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium">Countries</p>
            <p className="text-xs text-zinc-400 mt-0.5">Jobs will be fetched from selected countries</p>
          </div>
          {selectedCountries.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedCountries.map((code) => {
                const c = COUNTRIES.find((x) => x.code === code);
                return (
                  <div key={code} className="flex items-center gap-1 bg-indigo-100 text-indigo-800 rounded-full px-3 py-1 text-sm">
                    {c?.name ?? code}
                    <button onClick={() => toggleCountry(code)} className="ml-1 opacity-70 hover:opacity-100">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <select
            className="text-sm border border-zinc-200 rounded-lg px-3 py-2 bg-white text-zinc-700 w-full max-w-xs"
            value=""
            onChange={(e) => { if (e.target.value) toggleCountry(e.target.value); }}
          >
            <option value="">+ Add country...</option>
            {regions.map(({ label, codes }) => (
              <optgroup key={label} label={label}>
                {codes
                  .map((code) => COUNTRIES.find((c) => c.code === code))
                  .filter((c): c is NonNullable<typeof c> => !!c && !selectedCountries.includes(c.code))
                  .map((c) => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Keywords */}
        <div className="px-5 py-4 flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium">Keywords</p>
            <p className="text-xs text-zinc-400 mt-0.5">Skills and technologies matched during screening</p>
          </div>
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {keywords.map((kw) => (
                <div key={kw} className="flex items-center gap-1 bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-full px-3 py-1 text-sm">
                  {kw}
                  <button onClick={() => setKeywords((prev) => prev.filter((k) => k !== kw))} className="ml-1 opacity-60 hover:opacity-100">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              ref={keywordRef}
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addKeyword(keywordInput);
                }
              }}
              placeholder="e.g. Python, AWS, React — press Enter to add"
              className="flex-1"
            />
            <Button variant="outline" size="sm" onClick={() => addKeyword(keywordInput)}>Add</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
