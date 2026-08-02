import { useEffect, useState } from "react";
import { CheckCircle2, Save } from "lucide-react";

import { Button } from "components/ui/button";
import { FormSkeleton } from "components/ui/skeleton";
import { Input } from "components/ui/input";
import { PageHeader } from "components/ui/page-header";
import { Select } from "components/ui/select";
import { useCallApi } from "services";

function Row({ label, description, children }) {
	return (
		<div className="flex items-start justify-between px-5 py-4 gap-6">
			<div className="min-w-[180px] max-w-[240px]">
				<p className="text-[13px] font-medium text-zinc-900">{label}</p>
				{description && <p className="text-[11.5px] text-zinc-400 mt-0.5 leading-relaxed">{description}</p>}
			</div>
			<div className="flex-1 flex flex-col items-end gap-1.5 min-w-0">{children}</div>
		</div>
	);
}

// A masked-key input. `value` is null when untouched (leave the saved key as-is),
// a string when the user is entering a replacement, and "" when they've cleared it.
function KeyField({ label, description, isSet, masked, placeholder, value, onChange, onClear }) {
	const cleared = value === "";
	return (
		<Row label={label} description={description}>
			<Input
				type="password"
				autoComplete="off"
				value={value ?? ""}
				onChange={(e) => onChange(e.target.value)}
				placeholder={isSet ? `Saved ${masked} — type a new key to replace` : placeholder}
				className="w-full max-w-[360px]"
			/>
			{isSet && value == null && (
				<button onClick={onClear} className="text-[11.5px] text-zinc-400 hover:text-red-500 cursor-pointer">
					Clear saved key
				</button>
			)}
			{cleared && <span className="text-[11.5px] text-amber-600">Saved key will be removed on save</span>}
		</Row>
	);
}

export default function Settings() {
	// keys: null = unchanged, "" = clear, string = new value
	const [anthropicKey, setAnthropicKey] = useState(null);
	const [apifyToken, setApifyToken] = useState(null);
	const [screeningModel, setScreeningModel] = useState("");
	const [generationModel, setGenerationModel] = useState("");
	const [meta, setMeta] = useState({
		anthropicKeySet: false,
		anthropicKeyMasked: null,
		apifyTokenSet: false,
		apifyTokenMasked: null,
		modelOptions: [],
	});
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [firstLoad, setFirstLoad] = useState(true);

	const [callApi] = useCallApi();

	const load = (d) => {
		setScreeningModel(d.screeningModel ?? "");
		setGenerationModel(d.generationModel ?? "");
		setAnthropicKey(null);
		setApifyToken(null);
		setMeta({
			anthropicKeySet: d.anthropicKeySet,
			anthropicKeyMasked: d.anthropicKeyMasked,
			apifyTokenSet: d.apifyTokenSet,
			apifyTokenMasked: d.apifyTokenMasked,
			modelOptions: d.modelOptions ?? [],
		});
	};

	useEffect(() => {
		callApi("/settings", {
			onSuccess: (d) => {
				load(d);
				setFirstLoad(false);
			},
			onError: () => setFirstLoad(false),
		});
	}, []);

	const save = async () => {
		setSaving(true);
		const json = { screeningModel, generationModel };
		if (anthropicKey != null) json.anthropicKey = anthropicKey;
		if (apifyToken != null) json.apifyToken = apifyToken;
		await callApi("/settings", {
			method: "put",
			json,
			success: "Settings saved",
			onSuccess: load,
		});
		setSaved(true);
		setTimeout(() => setSaved(false), 2000);
		setSaving(false);
	};

	const modelOpts = meta.modelOptions.map((o) => ({ value: o.id, label: o.label }));

	return (
		<div className="flex flex-col h-full overflow-hidden">
			<PageHeader
				title="Settings"
				subtitle="Your API keys and model choices — used for every screen and generation"
				actions={
					<Button variant="primary" size="sm" onClick={save} disabled={saving}>
						{saved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
						{saved ? "Saved" : saving ? "Saving…" : "Save"}
					</Button>
				}
			/>

			<div className="flex-1 overflow-y-auto">
				<div className="max-w-[760px] mx-auto px-8 py-8 flex flex-col gap-6">
					{firstLoad ? (
						<FormSkeleton fields={4} />
					) : (
					<>
					<div className="bg-white border border-zinc-200/80 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.02)] divide-y divide-zinc-100">
						<div className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
							API keys
						</div>
						<KeyField
							label="Anthropic API key"
							description="Powers screening, generation, and PDF trimming"
							isSet={meta.anthropicKeySet}
							masked={meta.anthropicKeyMasked}
							placeholder="sk-ant-…"
							value={anthropicKey}
							onChange={setAnthropicKey}
							onClear={() => setAnthropicKey("")}
						/>
						<KeyField
							label="Apify token"
							description="Powers LinkedIn job scraping"
							isSet={meta.apifyTokenSet}
							masked={meta.apifyTokenMasked}
							placeholder="apify_api_…"
							value={apifyToken}
							onChange={setApifyToken}
							onClear={() => setApifyToken("")}
						/>
					</div>

					<div className="bg-white border border-zinc-200/80 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.02)] divide-y divide-zinc-100">
						<div className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
							Models
						</div>
						<Row label="Screening model" description="Cheaper tier for bulk relevance scoring">
							<Select
								value={screeningModel}
								onChange={setScreeningModel}
								options={modelOpts}
								align="right"
								placeholder="Select a model"
							/>
						</Row>
						<Row label="Generation model" description="Higher-quality tier for tailoring CVs & letters">
							<Select
								value={generationModel}
								onChange={setGenerationModel}
								options={modelOpts}
								align="right"
								placeholder="Select a model"
							/>
						</Row>
					</div>

					<p className="text-[11.5px] text-zinc-400 px-1 leading-relaxed">
						Keys are encrypted before they're stored and are never shown again in full. Leave a key field
						blank to keep the one already saved.
					</p>
					</>
					)}
				</div>
			</div>
		</div>
	);
}
