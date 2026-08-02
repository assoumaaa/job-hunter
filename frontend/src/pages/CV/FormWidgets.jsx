import { ChevronDown, Plus, X } from "lucide-react";
import { forwardRef, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

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
				"w-full resize-none overflow-hidden rounded-lg border border-line bg-surface px-3 py-2 text-body leading-relaxed text-ink",
				"placeholder:text-ink-3 transition-colors hover:border-line-strong",
				"focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-0 focus-visible:border-transparent",
				className,
			)}
			{...props}
		/>
	);
});

export function Section({ id, title, hint, icon: Icon, children, defaultOpen = true, bare = false }) {
	const [open, setOpen] = useState(defaultOpen);
	// `bare`: no header/chevron — used when the tab already names the section.
	if (bare) {
		return (
			<div className="bg-surface border border-line rounded-xl p-4 space-y-3 shadow-raised">
				{children}
			</div>
		);
	}
	return (
		<div className="scroll-mt-4 bg-surface border border-line rounded-xl overflow-hidden shadow-raised">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				aria-expanded={open}
				className="w-full flex items-center gap-2.5 px-4 h-12 hover:bg-hovertint transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
			>
				{Icon && <Icon className="h-4 w-4 text-ink-3" aria-hidden="true" />}
				<span className="text-body font-semibold text-ink">{title}</span>
				{hint && <span className="text-micro text-ink-3 ml-auto font-mono tabular-nums">{hint}</span>}
				<ChevronDown
					aria-hidden="true"
					className={cn(
						"h-4 w-4 text-ink-3 transition-transform",
						hint ? "ml-2" : "ml-auto",
						open ? "" : "-rotate-90",
					)}
				/>
			</button>
			{open && <div className="px-4 pb-4 pt-1 space-y-3 border-t border-line">{children}</div>}
		</div>
	);
}

export function Field({ label, value, onChange, placeholder, type = "text" }) {
	const id = useId();
	return (
		<div className="flex flex-col gap-1.5">
			<label htmlFor={id} className="text-micro font-medium text-ink-2">
				{label}
			</label>
			<Input
				id={id}
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
		<div className="relative group border border-line rounded-lg p-3.5 space-y-3 bg-canvas/40 hover:bg-surface transition-colors">
			{label && <div className="text-micro font-semibold uppercase tracking-wide text-ink-3">{label}</div>}
			<button
				type="button"
				onClick={onRemove}
				aria-label={label ? `Remove ${label}` : "Remove entry"}
				title="Remove"
				className="absolute top-2.5 right-2.5 h-6 w-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-ink-3 hover:text-red-600 hover:bg-red-600/10 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1"
			>
				<X className="h-3.5 w-3.5" aria-hidden="true" />
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
							className="inline-flex items-center gap-1 bg-muted text-ink text-label font-medium pl-2 pr-1 py-0.5 rounded-md"
						>
							{t}
							<button
								type="button"
								onClick={() => remove(i)}
								aria-label={`Remove ${t}`}
								className="h-5 w-5 rounded flex items-center justify-center text-ink-3 hover:text-red-500 transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1"
							>
								<X className="h-3 w-3" aria-hidden="true" />
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
					aria-label={placeholder}
					className="text-body flex-1"
				/>
				<Button variant="outline" size="sm" onClick={add}>
					<Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add
				</Button>
			</div>
		</div>
	);
}
