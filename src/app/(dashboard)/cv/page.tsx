"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Save, Eye } from "lucide-react";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

export default function CvPage() {
  const [latex, setLatex] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    fetch("/api/cv")
      .then((r) => r.json())
      .then((d) => setLatex(d.latexSource ?? ""));
  }, []);

  const save = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latexSource: latex }),
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

  const compile = async () => {
    setCompiling(true);
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
    }
    try {
      const res = await fetch("/api/cv/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latex }),
      });
      if (res.ok) {
        const blob = await res.blob();
        setPdfUrl(URL.createObjectURL(blob));
      } else {
        const text = await res.text();
        let msg = text;
        try {
          msg = JSON.parse(text).error;
        } catch {
          // use raw text
        }
        alert("Compile error: " + msg);
      }
    } catch {
      alert(
        "LaTeX service is not running.\n\nRun this in a new terminal:\n  cd \"/Users/assouma/Job Hunting/job-hunter/latex-service\" && node index.js\n\nOr set up the Render service for production."
      );
    } finally {
      setCompiling(false);
    }
  };

  return (
    <div className="flex flex-col h-full p-6 gap-4 overflow-hidden">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">My CV</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Edit your LaTeX CV here. This is used as the base for all generated CVs.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-2">
            <Button variant="outline" onClick={save} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saved ? "Saved!" : saving ? "Saving..." : saveError ? "Error" : "Save"}
            </Button>
            <Button onClick={compile} disabled={compiling}>
              <Eye className="h-4 w-4 mr-2" />
              {compiling ? "Compiling..." : "Preview PDF"}
            </Button>
          </div>
          {saveError && <p className="text-xs text-red-500">{saveError}</p>}
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        <div className="flex-1 rounded-xl overflow-hidden border border-zinc-200">
          <MonacoEditor
            height="100%"
            defaultLanguage="latex"
            value={latex}
            onChange={(v) => setLatex(v ?? "")}
            theme="vs-light"
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              wordWrap: "on",
              lineNumbers: "on",
              scrollBeyondLastLine: false,
            }}
          />
        </div>

        <div className="flex-1 rounded-xl overflow-hidden border border-zinc-200 bg-zinc-50 flex flex-col">
          {pdfUrl ? (
            <iframe src={pdfUrl} className="w-full h-full" title="CV Preview" />
          ) : (
            <div className="flex items-center gap-2 p-4 text-zinc-400 text-sm">
              <Eye className="h-4 w-4 opacity-50 flex-shrink-0" />
              <p>Click &quot;Preview PDF&quot; to compile and view your CV</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
