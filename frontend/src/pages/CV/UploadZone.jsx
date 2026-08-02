import { Loader2, UploadCloud } from "lucide-react";
import { useCallback, useState } from "react";

/**
 * CV upload: native-first. A <label> wraps a visually-hidden but focusable
 * file input, so keyboard and screen-reader users can upload; the wrapper
 * handles drag-and-drop on top.
 */
export default function UploadZone({ onUpload, uploading }) {
	const [dragOver, setDragOver] = useState(false);

	const handleDrop = useCallback(
		(e) => {
			e.preventDefault();
			setDragOver(false);
			const file = e.dataTransfer?.files?.[0];
			if (file && file.type === "application/pdf") onUpload(file);
		},
		[onUpload],
	);

	const handleFileChange = (e) => {
		const file = e.target.files?.[0];
		if (file) onUpload(file);
		e.target.value = "";
	};

	return (
		<div
			onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
			onDragLeave={() => setDragOver(false)}
			onDrop={handleDrop}
		>
			<label
				className={`group relative block rounded-xl border border-dashed p-6 text-center transition-all has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent has-[:focus-visible]:outline-offset-2 ${
					dragOver
						? "border-accent bg-accent-soft/60"
						: uploading
						? "border-line bg-canvas cursor-default"
						: "border-line bg-surface hover:border-line-strong hover:bg-hovertint cursor-pointer"
				}`}
			>
				<input
					type="file"
					accept=".pdf"
					className="sr-only"
					disabled={uploading}
					onChange={handleFileChange}
					aria-label="Upload your CV as a PDF"
				/>
				<div className="flex items-center gap-4 justify-center">
					<div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
						dragOver ? "bg-accent-soft text-accent-text" : "bg-muted text-ink-2"
					}`}>
						{uploading ? (
							<Loader2 className="h-5 w-5 motion-safe:animate-spin text-accent" aria-hidden="true" />
						) : (
							<UploadCloud className="h-5 w-5" aria-hidden="true" />
						)}
					</div>
					<div className="text-left">
						{uploading ? (
							<>
								<p role="status" className="text-body font-semibold text-ink">Parsing your CV…</p>
								<p className="text-micro text-ink-2 mt-0.5">Extracting fields with AI</p>
							</>
						) : (
							<>
								<p className="text-body font-semibold text-ink">
									Drop a PDF or <span className="text-accent-text">browse</span>
								</p>
								<p className="text-micro text-ink-2 mt-0.5">We'll extract your details automatically</p>
							</>
						)}
					</div>
				</div>
			</label>
		</div>
	);
}
