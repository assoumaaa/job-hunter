import { FileText } from "lucide-react";
import { useState } from "react";
import { useCallApi } from "services";

// List rows don't carry doc content — fetch it by id on click, then compile.
export default function DocChip({ jobId, label, ready, contact }) {
	const [loading, setLoading] = useState(false);
	const [callApi] = useCallApi();

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
			<span className="inline-flex items-center gap-1 h-[22px] px-2 rounded-md border border-dashed border-zinc-200 text-zinc-300 text-[10.5px] font-medium select-none whitespace-nowrap">
				<FileText className="h-2.5 w-2.5" />
				{label}
			</span>
		);
	}

	return (
		<button
			onClick={openPdf}
			disabled={loading}
			className={`inline-flex items-center gap-1 h-[22px] px-2 rounded-md ring-1 ring-inset ring-violet-200/60 bg-violet-50 text-violet-700 text-[10.5px] font-semibold whitespace-nowrap transition-all ${
				loading ? "opacity-60" : "hover:bg-violet-100 hover:ring-violet-300/60 cursor-pointer"
			}`}
		>
			<FileText className="h-2.5 w-2.5" />
			{loading ? "…" : label}
		</button>
	);
}
