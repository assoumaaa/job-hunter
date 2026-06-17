import { ChevronRight, Plus, X } from "lucide-react";
import { useState } from "react";

import { Button } from "components/ui/button";
import { Input } from "components/ui/input";

export function Section({ title, hint, children, defaultOpen = true }) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<div className="bg-white border border-zinc-200/80 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
			<button
				onClick={() => setOpen(!open)}
				className="w-full flex items-center gap-2 px-4 h-11 hover:bg-zinc-50/60 transition-colors cursor-pointer"
			>
				<ChevronRight className={`h-3.5 w-3.5 text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`} />
				<span className="text-[13px] font-semibold text-zinc-900">{title}</span>
				{hint && <span className="text-[11px] text-zinc-400 ml-auto">{hint}</span>}
			</button>
			{open && <div className="px-4 pb-4 pt-1 space-y-3 border-t border-zinc-100">{children}</div>}
		</div>
	);
}

export function Field({ label, value, onChange, placeholder, type = "text" }) {
	return (
		<div className="flex flex-col gap-1.5">
			<label className="text-[11px] font-medium text-zinc-600">{label}</label>
			<Input
				type={type}
				value={value || ""}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
			/>
		</div>
	);
}

export function ListItem({ children, onRemove }) {
	return (
		<div className="relative group border border-zinc-200/80 rounded-lg p-3 pt-3 space-y-2.5 bg-zinc-50/40 hover:bg-white transition-colors">
			<button
				onClick={onRemove}
				className="absolute top-2 right-2 h-6 w-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-red-600 hover:bg-red-50"
				title="Remove"
			>
				<X className="h-3.5 w-3.5" />
			</button>
			{children}
		</div>
	);
}

export function BulletEditor({ bullets, onChange }) {
	const update = (idx, val) => {
		const next = [...bullets];
		next[idx] = val;
		onChange(next);
	};
	const add = () => onChange([...bullets, ""]);
	const remove = (idx) => onChange(bullets.filter((_, i) => i !== idx));

	return (
		<div className="space-y-1.5">
			<label className="text-[11px] font-medium text-zinc-600">Bullets</label>
			{bullets.map((b, i) => (
				<div key={i} className="flex gap-2 items-start group/bullet">
					<span className="text-zinc-300 mt-1.5 select-none">•</span>
					<textarea
						value={b}
						onChange={(e) => update(i, e.target.value)}
						rows={1}
						className="flex-1 text-[13px] border border-zinc-200 rounded-md px-2.5 py-1.5 resize-none focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/5 hover:border-zinc-300 transition-colors"
						style={{ minHeight: 32 }}
					/>
					<button
						onClick={() => remove(i)}
						className="h-7 w-7 rounded-md flex items-center justify-center text-zinc-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover/bullet:opacity-100 transition-opacity"
					>
						<X className="h-3.5 w-3.5" />
					</button>
				</div>
			))}
			<button
				onClick={add}
				className="text-[11.5px] text-zinc-500 hover:text-zinc-900 flex items-center gap-1 mt-1 font-medium transition-colors cursor-pointer"
			>
				<Plus className="h-3 w-3" /> Add bullet
			</button>
		</div>
	);
}

export function TagEditor({ tags, onChange, placeholder = "Add…" }) {
	const [input, setInput] = useState("");
	const add = () => {
		if (input.trim()) {
			onChange([...tags, input.trim()]);
			setInput("");
		}
	};
	const remove = (idx) => onChange(tags.filter((_, i) => i !== idx));

	return (
		<div className="space-y-2">
			{tags.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{tags.map((t, i) => (
						<span
							key={i}
							className="inline-flex items-center gap-1.5 bg-zinc-100 text-zinc-700 text-[12px] font-medium px-2 py-0.5 rounded-md"
						>
							{t}
							<button onClick={() => remove(i)} className="text-zinc-400 hover:text-red-500 transition-colors">
								<X className="h-2.5 w-2.5" />
							</button>
						</span>
					))}
				</div>
			)}
			<div className="flex gap-1.5">
				<Input
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
					placeholder={placeholder}
					className="text-[13px] flex-1"
				/>
				<Button variant="outline" size="sm" onClick={add}>Add</Button>
			</div>
		</div>
	);
}
