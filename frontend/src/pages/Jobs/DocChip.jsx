import { FileText } from "lucide-react";
import { useState } from "react";
import { useCallApi } from "services";

// List rows don't carry doc content — fetch it by id on click, then compile.
export default function DocChip({ jobId, label, ready, contact }) {
	const [loading, setLoading] = useState(false);
	const [callApi] = useCallApi();

	const docName = label === "CV" ? "CV" : "cover letter";

	const openPdf = () => {
		if (!ready || loading) return;
		setLoading(true);

		const isCv = label === "CV";

		callApi(`/jobs/${jobId}`, {
			error: "Failed to load document",
			onSuccess: (job) => {
				const value = isCv ? job.generatedCv : job.generatedCl;
				if (!value) {
					setLoading(false);
					return;
				}

				let endpoint, json;
				if (isCv) {
					let structuredData;
					try {
						structuredData = typeof value === "string" ? JSON.parse(value) : value;
					} catch {
						setLoading(false);
						return;
					}
					endpoint = "/cv/compile";
					json = { structuredData };
				} else {
					endpoint = "/cv/compile-cl";
					json = { text: value, contact };
				}

				callApi(endpoint, {
					method: "POST",
					json,
					responseType: "blob",
					error: "PDF compile failed",
					onSuccess: (blob) => {
						window.open(URL.createObjectURL(blob), "_blank");
					},
				}).finally(() => setLoading(false));
			},
			onError: () => setLoading(false),
		});
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
