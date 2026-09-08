import { FileText } from "lucide-react";
import { useState } from "react";
import { useJobsApi } from "services";

// List rows don't carry doc content — the resource module loads it by id and
// compiles it in one step.
export default function DocChip({ jobId, label, ready, contact }) {
	const [loading, setLoading] = useState(false);
	const [api] = useJobsApi();

	const docName = label === "CV" ? "CV" : "cover letter";

	const openPdf = async () => {
		if (!ready || loading) return;
		setLoading(true);
		try {
			const blob = await api.compileDocument(jobId, label === "CV" ? "cv" : "cl", contact);
			if (blob) window.open(URL.createObjectURL(blob), "_blank");
		} finally {
			setLoading(false);
		}
	};

	if (!ready) {
		return (
			<span className="inline-flex items-center gap-1 h-[22px] px-2 rounded-md border border-dashed border-line text-ink-3 text-micro font-medium select-none whitespace-nowrap">
				<FileText className="h-2.5 w-2.5" aria-hidden="true" />
				{label}
			</span>
		);
	}

	return (
		<button
			type="button"
			onClick={openPdf}
			disabled={loading}
			aria-label={`Open generated ${docName} PDF`}
			aria-busy={loading || undefined}
			className={`inline-flex items-center gap-1 h-[22px] px-2 rounded-md bg-accent-soft text-accent-text text-micro font-semibold whitespace-nowrap transition-all focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 ${
				loading ? "opacity-60" : "hover:opacity-80 cursor-pointer"
			}`}
		>
			<FileText className="h-2.5 w-2.5" aria-hidden="true" />
			{loading ? "…" : label}
		</button>
	);
}
