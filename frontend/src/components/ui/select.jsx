import { Check, ChevronDown } from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "utils/cn";
import { useDismiss } from "utils/useDismiss";

export function Select({ value, onChange, options, className, placeholder, disabled, align = "left" }) {
	const [open, setOpen] = useState(false);
	const ref = useRef(null);

	useDismiss({ open, onClose: () => setOpen(false), refs: [ref] });

	const current = options.find((o) => o.value === value);

	return (
		<div ref={ref} className="relative inline-block">
			<button
				type="button"
				disabled={disabled}
				onClick={() => setOpen((o) => !o)}
				className={cn(
					"inline-flex items-center h-9 rounded-md border border-zinc-200 bg-white pl-2.5 pr-7 text-[13px] font-medium text-zinc-700 hover:border-zinc-300 focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors relative whitespace-nowrap",
					className,
				)}
			>
				<span className="truncate">{current?.label ?? placeholder ?? ""}</span>
				<ChevronDown
					className={`absolute right-2 h-3.5 w-3.5 text-zinc-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
				/>
			</button>
			{open && (
				<div
					className={cn(
						"absolute z-50 top-[calc(100%+4px)] min-w-full rounded-lg border border-zinc-200 bg-white shadow-lg py-1",
						align === "right" ? "right-0" : "left-0",
					)}
				>
					{options.map((o) => (
						<button
							key={o.value}
							type="button"
							onClick={() => {
								onChange(o.value);
								setOpen(false);
							}}
							className="w-full flex items-center justify-between gap-3 px-2.5 h-8 text-[13px] text-zinc-700 hover:bg-zinc-50 cursor-pointer text-left"
						>
							<span className="truncate">{o.label}</span>
							{o.value === value && <Check className="h-3.5 w-3.5 text-zinc-900 shrink-0" />}
						</button>
					))}
				</div>
			)}
		</div>
	);
}
