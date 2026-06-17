import { Loader2, UploadCloud } from "lucide-react";
import { useCallback, useRef, useState } from "react";

export default function UploadZone({ onUpload, uploading }) {
	const [dragOver, setDragOver] = useState(false);
	const inputRef = useRef(null);

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
	};

	return (
		<div
			onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
			onDragLeave={() => setDragOver(false)}
			onDrop={handleDrop}
			onClick={() => !uploading && inputRef.current?.click()}
			className={`group relative rounded-xl border border-dashed p-6 text-center cursor-pointer transition-all ${
				dragOver
					? "border-indigo-400 bg-indigo-50/40"
					: uploading
					? "border-zinc-200 bg-zinc-50 cursor-default"
					: "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50/50"
			}`}
		>
			<input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
			<div className="flex items-center gap-4 justify-center">
				<div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
					dragOver ? "bg-indigo-100 text-indigo-600" : "bg-zinc-100 text-zinc-500"
				}`}>
					{uploading ? (
						<Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
					) : (
						<UploadCloud className="h-5 w-5" />
					)}
				</div>
				<div className="text-left">
					{uploading ? (
						<>
							<p className="text-[13px] font-semibold text-zinc-900">Parsing your CV…</p>
							<p className="text-[11.5px] text-zinc-500 mt-0.5">Extracting fields with AI</p>
						</>
					) : (
						<>
							<p className="text-[13px] font-semibold text-zinc-900">
								Drop a PDF or <span className="text-indigo-600">browse</span>
							</p>
							<p className="text-[11.5px] text-zinc-500 mt-0.5">We'll extract your details automatically</p>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
