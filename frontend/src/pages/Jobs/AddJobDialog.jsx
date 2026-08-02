import { Link as LinkIcon, Loader2, Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import { useCallApi } from "services";

import { Button } from "components/ui/button";
import { Input, Textarea } from "components/ui/input";
import { Modal } from "components/ui/modal";

const SOURCE_OPTIONS = [
	{ value: "linkedin", label: "LinkedIn" },
	{ value: "indeed", label: "Indeed" },
	{ value: "wellfound", label: "Wellfound" },
	{ value: "other", label: "Other" },
];

function Field({ label, required, children }) {
	return (
		<label className="flex flex-col gap-1.5">
			<span className="text-micro font-medium text-ink-2">
				{label}
				{required && <span className="text-red-500"> *</span>}
			</span>
			{children}
		</label>
	);
}

const selectCls =
	"flex h-9 w-full rounded-lg border border-line bg-surface px-3 text-body text-ink hover:border-line-strong focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-0 cursor-pointer";

const EMPTY = { title: "", company: "", url: "", location: "", source: "linkedin", description: "" };

export default function AddJobDialog({ onClose, onAdded }) {
	const [form, setForm] = useState(EMPTY);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState(null);

	const [extractUrl, setExtractUrl] = useState("");
	const [extracting, setExtracting] = useState(false);
	const [extractError, setExtractError] = useState(null);
	const [extracted, setExtracted] = useState(false);

	const [callApi] = useCallApi();

	const canSubmit = form.title.trim() && form.company.trim() && form.description.trim();
	const canExtract = extractUrl.trim().length > 5 && !extracting;

	const handleExtract = () => {
		if (!canExtract) return;
		setExtracting(true);
		setExtractError(null);
		setExtracted(false);
		callApi("/jobs/extract-url", {
			method: "POST",
			json: { url: extractUrl.trim() },
			suppressError: true,
			onSuccess: (data) => {
				setForm((f) => ({
					...f,
					title: data.title || f.title,
					company: data.company || f.company,
					location: data.location || f.location,
					description: data.description || f.description,
					url: data.url || extractUrl.trim(),
					source: data.source || f.source,
				}));
				setExtracted(true);
			},
			onError: (err) => {
				setExtractError(err?.data?.detail || "Could not extract this URL. Try filling the form manually.");
			},
		}).finally(() => setExtracting(false));
	};

	const handleSubmit = () => {
		if (!canSubmit || submitting) return;
		setSubmitting(true);
		setError(null);
		callApi("/jobs/manual", {
			method: "POST",
			json: {
				title: form.title.trim(),
				company: form.company.trim(),
				url: form.url.trim() || undefined,
				location: form.location.trim() || undefined,
				source: form.source,
				description: form.description.trim(),
			},
			suppressError: true,
			onSuccess: (job) => {
				onAdded(job);
				onClose();
			},
			onError: (err) => {
				setError(err?.data?.detail || "Failed to add job");
			},
		}).finally(() => setSubmitting(false));
	};

	const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

	return (
		<Modal
			open
			onClose={onClose}
			title="Add job"
			icon={Plus}
			width={560}
			footer={
				<>
					<Button variant="subtle" size="sm" onClick={onClose}>
						Cancel
					</Button>
					<Button variant="primary" size="sm" onClick={handleSubmit} disabled={!canSubmit || submitting}>
						{submitting ? "Adding…" : "Add job"}
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-4">
				{/* URL extractor */}
				<div className="rounded-lg border border-line bg-gradient-to-br from-accent-soft/60 to-canvas p-3 flex flex-col gap-2">
					<div className="flex items-center gap-1.5 text-micro font-semibold text-ink uppercase tracking-wide">
						<Sparkles className="h-3 w-3 text-accent" aria-hidden="true" />
						Auto-fill from URL
					</div>
					<div className="flex gap-2">
						<div className="relative flex-1">
							<LinkIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-3 pointer-events-none z-10" aria-hidden="true" />
							<Input
								value={extractUrl}
								onChange={(e) => {
									setExtractUrl(e.target.value);
									setExtractError(null);
									setExtracted(false);
								}}
								onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleExtract())}
								placeholder="https://www.linkedin.com/jobs/view/…"
								aria-label="Job posting URL"
								className="pl-7"
							/>
						</div>
						<Button variant="primary" size="default" onClick={handleExtract} disabled={!canExtract}>
							{extracting ? (
								<Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />
							) : (
								<Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
							)}
							{extracting ? "Extracting…" : "Extract"}
						</Button>
					</div>
					{extractError && (
						<p role="alert" className="text-micro text-red-600 m-0">
							{extractError}
						</p>
					)}
					{extracted && !extractError && (
						<p role="status" className="text-micro text-st-ok-fg m-0">
							Filled below. Review and click Add job.
						</p>
					)}
				</div>

				<div className="flex items-center gap-3">
					<div className="h-px flex-1 bg-line" />
					<span className="text-micro font-medium text-ink-3 uppercase tracking-wider">
						or fill manually
					</span>
					<div className="h-px flex-1 bg-line" />
				</div>

				<div className="grid grid-cols-2 gap-3">
					<Field label="Job title" required>
						<Input value={form.title} onChange={set("title")} placeholder="Senior Software Engineer" />
					</Field>
					<Field label="Company" required>
						<Input value={form.company} onChange={set("company")} placeholder="e.g. Datadog" />
					</Field>
				</div>

				<div className="grid grid-cols-[1fr_140px] gap-3">
					<Field label="URL">
						<Input value={form.url} onChange={set("url")} placeholder="https://…" />
					</Field>
					<Field label="Source">
						<select value={form.source} onChange={set("source")} className={selectCls}>
							{SOURCE_OPTIONS.map((o) => (
								<option key={o.value} value={o.value}>
									{o.label}
								</option>
							))}
						</select>
					</Field>
				</div>

				<Field label="Location">
					<Input value={form.location} onChange={set("location")} placeholder="Remote, New York, etc." />
				</Field>

				<Field label="Job description" required>
					<Textarea
						value={form.description}
						onChange={set("description")}
						placeholder="Paste the full job description here…"
						rows={6}
						className="leading-relaxed resize-y"
					/>
				</Field>

				{error && (
					<p role="alert" className="text-label text-red-600 m-0">
						{error}
					</p>
				)}
			</div>
		</Modal>
	);
}
