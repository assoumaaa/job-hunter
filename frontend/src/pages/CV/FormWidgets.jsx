import { ChevronDown, Plus, X } from "lucide-react";
import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { Button } from "components/ui/button";
import { Input } from "components/ui/input";
import { cn } from "utils/cn";

// Auto-growing textarea: height always tracks its content, so long, multi-line
// bullets and conditions look roomy and are never clamped or scrolled. Also
// reflows when its own width changes (e.g. the preview pane collapses).
export const AutoTextarea = forwardRef(function AutoTextarea(
	{ className, value, onChange, minRows = 1, ...props },
	ref,
) {
	const innerRef = useRef(null);
	const lastWidth = useRef(0);

	const setRef = (node) => {
		innerRef.current = node;
		if (typeof ref === "function") ref(node);
		else if (ref) ref.current = node;
	};

	const resize = useCallback(() => {
		const el = innerRef.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${el.scrollHeight}px`;
	}, []);

	useLayoutEffect(() => {
		resize();
	}, [value, resize]);

	useEffect(() => {
		const el = innerRef.current;
		if (!el || typeof ResizeObserver === "undefined") return;
		const ro = new ResizeObserver((entries) => {
			const w = entries[0]?.contentRect.width ?? 0;
			if (w !== lastWidth.current) {
				lastWidth.current = w;
				resize();
			}
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, [resize]);

	return (
		<textarea
			ref={setRef}
			value={value ?? ""}
			onChange={(e) => {
				onChange?.(e);
				resize();
			}}
			rows={minRows}
			className={cn(
				"w-full resize-none overflow-hidden rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px] leading-relaxed text-zinc-900",
				"placeholder:text-zinc-400 transition-colors hover:border-zinc-300",
				"focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/5",
				className,
			)}
			{...props}
		/>
	);
});

export function Section({ id, title, hint, icon: Icon, children, defaultOpen = true }) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<div className="scroll-mt-4 bg-white border border-zinc-200/80 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
			<button
				onClick={() => setOpen(!open)}
				className="w-full flex items-center gap-2.5 px-4 h-12 hover:bg-zinc-50/60 transition-colors cursor-pointer"
			>
				{Icon && <Icon className="h-4 w-4 text-zinc-400" />}
				<span className="text-[13px] font-semibold text-zinc-900">{title}</span>
				{hint && <span className="text-[11px] text-zinc-400 ml-auto tabular-nums">{hint}</span>}
				<ChevronDown
					className={cn(
						"h-4 w-4 text-zinc-400 transition-transform",
						hint ? "ml-2" : "ml-auto",
						open ? "" : "-rotate-90",
					)}
				/>
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

export function ListItem({ children, onRemove, label }) {
	return (
		<div className="relative group border border-zinc-200/80 rounded-lg p-3.5 space-y-3 bg-zinc-50/40 hover:bg-white transition-colors">
			{label && <div className="text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400">{label}</div>}
			<button
				onClick={onRemove}
				className="absolute top-2.5 right-2.5 h-6 w-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-red-600 hover:bg-red-50"
				title="Remove"
			>
				<X className="h-3.5 w-3.5" />
			</button>
			{children}
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
				<Button variant="outline" size="sm" onClick={add}>
					<Plus className="h-3.5 w-3.5" /> Add
				</Button>
			</div>
		</div>
	);
}
