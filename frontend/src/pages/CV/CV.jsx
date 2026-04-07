import { useEffect, useState } from "react";
import { Eye, Save } from "lucide-react";

import { useAuth } from "@clerk/clerk-react";
import Editor from "@monaco-editor/react";

import { useCallApi } from "services";
import { Button } from "components/ui/button";

export default function CV() {
	const [latex, setLatex] = useState("");
	const [pdfUrl, setPdfUrl] = useState(null);
	const [saving, setSaving] = useState(false);
	const [compiling, setCompiling] = useState(false);
	const [saved, setSaved] = useState(false);

	const [callApi] = useCallApi();
	const { getToken } = useAuth();

	const save = async () => {
		setSaving(true);
		await callApi("/cv", { method: "post", json: { latexSource: latex }, success: "CV saved!" });
		setSaved(true);
		setTimeout(() => setSaved(false), 2000);
		setSaving(false);
	};

	useEffect(() => {
		callApi("/cv", { onSuccess: (d) => setLatex(d.latexSource ?? "") });
	}, []);

	const compile = async () => {
		setCompiling(true);
		if (pdfUrl) URL.revokeObjectURL(pdfUrl);
		try {
			const token = await getToken();
			const resp = await fetch("/api/cv/compile", {
				method: "POST",
				headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
				body: JSON.stringify({ latex }),
			});
			if (resp.ok) {
				const blob = await resp.blob();
				setPdfUrl(URL.createObjectURL(blob));
			} else {
				alert("LaTeX compile failed. Is the latex-service running?");
			}
		} finally {
			setCompiling(false);
		}
	};

	return (
		<div className="flex flex-col h-full p-6 gap-4 overflow-hidden">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-xl font-semibold">My CV</h1>
					<p className="text-sm text-zinc-500 mt-0.5">Edit your LaTeX CV — used as the base for all generated CVs.</p>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" onClick={save} disabled={saving}>
						<Save className="h-4 w-4 mr-2" />
						{saved ? "Saved!" : saving ? "Saving..." : "Save"}
					</Button>
					<Button onClick={compile} disabled={compiling}>
						<Eye className="h-4 w-4 mr-2" />
						{compiling ? "Compiling..." : "Preview PDF"}
					</Button>
				</div>
			</div>

			<div className="flex gap-4 flex-1 min-h-0">
				<div className="flex-1 rounded-xl overflow-hidden border border-zinc-200">
					<Editor
						height="100%"
						defaultLanguage="latex"
						value={latex}
						onChange={(v) => setLatex(v ?? "")}
						theme="vs-light"
						options={{ fontSize: 13, minimap: { enabled: false }, wordWrap: "on", scrollBeyondLastLine: false }}
					/>
				</div>
				<div className="flex-1 rounded-xl overflow-hidden border border-zinc-200 bg-zinc-50 flex flex-col">
					{pdfUrl ? (
						<iframe src={pdfUrl} className="w-full h-full border-none" title="CV Preview" />
					) : (
						<div className="flex items-center gap-2 p-4 text-zinc-400 text-sm">
							<Eye className="h-4 w-4 opacity-50 flex-shrink-0" />
							<p>Click &quot;Preview PDF&quot; to compile your CV</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
