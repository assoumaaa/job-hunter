"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, X } from "lucide-react";
const SENIORITY_OPTIONS = ["Junior", "Mid", "Senior", "Lead", "Principal"];
const NOTICE_OPTIONS = ["Immediately", "2 weeks", "1 month", "2 months", "3 months"];
const LANGUAGE_LEVELS = ["Basic", "Conversational", "Fluent", "Native"];
const COMMON_LANGUAGES = ["English", "Arabic", "French", "German", "Spanish", "Mandarin", "Portuguese", "Dutch"];

type Language = { name: string; level: string };

export default function ProfilePage() {
  const [form, setForm] = useState({
    fullName: "",
    linkedinUrl: "",
    githubUrl: "",
    totalYearsExperience: "",
    seniority: "",
    currentLocation: "",
    noticePeriod: "",
    languages: [] as Language[],
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [langName, setLangName] = useState("");
  const [langLevel, setLangLevel] = useState("Fluent");

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => {
        setForm({
          fullName: d.fullName ?? "",
          linkedinUrl: d.linkedinUrl ?? "",
          githubUrl: d.githubUrl ?? "",
          totalYearsExperience: d.totalYearsExperience?.toString() ?? "",
          seniority: d.seniority ?? "",
          currentLocation: d.currentLocation ?? "",
          noticePeriod: d.noticePeriod ?? "",
          languages: d.languages ? JSON.parse(d.languages) : [],
        });
      });
  }, []);

  const set = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const addLanguage = (name: string, level: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (form.languages.some((l) => l.name.toLowerCase() === trimmed.toLowerCase())) return;
    setForm((f) => ({ ...f, languages: [...f.languages, { name: trimmed, level }] }));
    setLangName("");
  };

  const removeLanguage = (name: string) => {
    setForm((f) => ({ ...f, languages: f.languages.filter((l) => l.name !== name) }));
  };

  const save = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName || null,
          linkedinUrl: form.linkedinUrl || null,
          githubUrl: form.githubUrl || null,
          totalYearsExperience: form.totalYearsExperience ? parseInt(form.totalYearsExperience) : null,
          seniority: form.seniority || null,
          currentLocation: form.currentLocation || null,
          noticePeriod: form.noticePeriod || null,
          languages: JSON.stringify(form.languages),
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

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-xl flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Profile</h1>
            <p className="text-sm text-zinc-500 mt-0.5">Used by Claude to score and tailor your applications accurately.</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button onClick={save} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saved ? "Saved!" : saving ? "Saving..." : saveError ? "Error" : "Save"}
            </Button>
            {saveError && <p className="text-xs text-red-500">{saveError}</p>}
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-xl divide-y divide-zinc-100">

          {/* Full name */}
          <div className="flex items-center justify-between px-5 py-4 gap-4">
            <div>
              <p className="text-sm font-medium">Full Name</p>
              <p className="text-xs text-zinc-400 mt-0.5">Used in cover letters and documents</p>
            </div>
            <Input
              value={form.fullName}
              onChange={(e) => set("fullName", e.target.value)}
              className="w-48"
              placeholder="Your full name"
            />
          </div>

          {/* LinkedIn */}
          <div className="flex items-center justify-between px-5 py-4 gap-4">
            <div>
              <p className="text-sm font-medium">LinkedIn URL</p>
              <p className="text-xs text-zinc-400 mt-0.5">Used in cover letters</p>
            </div>
            <Input
              value={form.linkedinUrl}
              onChange={(e) => set("linkedinUrl", e.target.value)}
              className="w-64"
              placeholder="linkedin.com/in/yourname"
            />
          </div>

          {/* GitHub */}
          <div className="flex items-center justify-between px-5 py-4 gap-4">
            <div>
              <p className="text-sm font-medium">GitHub URL</p>
              <p className="text-xs text-zinc-400 mt-0.5">Used in cover letters</p>
            </div>
            <Input
              value={form.githubUrl}
              onChange={(e) => set("githubUrl", e.target.value)}
              className="w-64"
              placeholder="github.com/yourname"
            />
          </div>

          {/* Years of experience */}
          <div className="flex items-center justify-between px-5 py-4 gap-4">
            <div>
              <p className="text-sm font-medium">Years of Experience</p>
              <p className="text-xs text-zinc-400 mt-0.5">Total professional experience</p>
            </div>
            <Input
              type="number"
              min={0}
              max={40}
              value={form.totalYearsExperience}
              onChange={(e) => set("totalYearsExperience", e.target.value)}
              className="w-24 text-center"
              placeholder="0"
            />
          </div>

          {/* Seniority */}
          <div className="flex items-center justify-between px-5 py-4 gap-4">
            <div>
              <p className="text-sm font-medium">Seniority Level</p>
              <p className="text-xs text-zinc-400 mt-0.5">Your current level</p>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              {SENIORITY_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => set("seniority", s)}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                    form.seniority === s
                      ? "bg-indigo-50 text-indigo-700 border-indigo-300"
                      : "border-zinc-200 text-zinc-600 hover:border-zinc-400"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Current location */}
          <div className="flex items-center justify-between px-5 py-4 gap-4">
            <div>
              <p className="text-sm font-medium">Current Location</p>
              <p className="text-xs text-zinc-400 mt-0.5">Where you are based</p>
            </div>
            <Input
              value={form.currentLocation}
              onChange={(e) => set("currentLocation", e.target.value)}
              className="w-48"
              placeholder="e.g. Dubai, UAE"
            />
          </div>

          {/* Notice period */}
          <div className="flex items-center justify-between px-5 py-4 gap-4">
            <div>
              <p className="text-sm font-medium">Notice Period</p>
              <p className="text-xs text-zinc-400 mt-0.5">How soon can you start</p>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              {NOTICE_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => set("noticePeriod", n)}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                    form.noticePeriod === n
                      ? "bg-indigo-50 text-indigo-700 border-indigo-300"
                      : "border-zinc-200 text-zinc-600 hover:border-zinc-400"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Languages */}
          <div className="flex flex-col px-5 py-4 gap-3">
            <div>
              <p className="text-sm font-medium">Languages</p>
              <p className="text-xs text-zinc-400 mt-0.5">Languages you speak — included in CV and screening</p>
            </div>

            {form.languages.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.languages.map((l) => (
                  <div key={l.name} className="flex items-center gap-1.5 bg-indigo-100 text-indigo-800 rounded-full px-3 py-1 text-sm">
                    <span>{l.name}</span>
                    <span className="opacity-50 text-xs">·</span>
                    <span className="opacity-70 text-xs">{l.level}</span>
                    <button onClick={() => removeLanguage(l.name)} className="ml-1 opacity-70 hover:opacity-100">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Quick-add common languages */}
            <div className="flex flex-wrap gap-2">
              {COMMON_LANGUAGES.filter((l) => !form.languages.some((x) => x.name === l)).map((l) => (
                <button
                  key={l}
                  onClick={() => addLanguage(l, langLevel)}
                  className="px-3 py-1 rounded-full text-sm border border-zinc-200 text-zinc-600 hover:border-zinc-400 transition-colors"
                >
                  + {l}
                </button>
              ))}
            </div>

            {/* Custom language + level picker */}
            <div className="flex gap-2 items-center">
              <Input
                value={langName}
                onChange={(e) => setLangName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addLanguage(langName, langLevel)}
                placeholder="Other language..."
                className="flex-1"
              />
              <div className="flex gap-1">
                {LANGUAGE_LEVELS.map((lv) => (
                  <button
                    key={lv}
                    onClick={() => setLangLevel(lv)}
                    className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                      langLevel === lv
                        ? "bg-indigo-50 text-indigo-700 border-indigo-300"
                        : "border-zinc-200 text-zinc-600 hover:border-zinc-400"
                    }`}
                  >
                    {lv}
                  </button>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={() => addLanguage(langName, langLevel)}>Add</Button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
