import { X } from "lucide-react";
import { useEffect } from "react";
import { cn } from "utils/cn";

export function Modal({ open = true, onClose, title, icon: Icon, children, footer, width = 480 }) {
	useEffect(() => {
		const onKey = (e) => e.key === "Escape" && onClose?.();
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [onClose]);

	if (!open) return null;

	return (
		<div
			className="fixed inset-0 z-[9999] flex items-center justify-center bg-zinc-950/30 backdrop-blur-[2px] p-4"
			onClick={onClose}
		>
			<div
				onClick={(e) => e.stopPropagation()}
				className={cn(
					"bg-white rounded-2xl shadow-2xl border border-zinc-200/60 flex flex-col max-h-[90vh] overflow-hidden",
				)}
				style={{ width }}
			>
				{(title || Icon) && (
					<div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-100">
						{Icon && (
							<div className="h-8 w-8 rounded-lg bg-zinc-100 flex items-center justify-center shrink-0">
								<Icon className="h-4 w-4 text-zinc-700" />
							</div>
						)}
						<h2 className="text-[14px] font-semibold text-zinc-900 flex-1">{title}</h2>
						<button
							onClick={onClose}
							className="h-7 w-7 rounded-md hover:bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-zinc-700 transition-colors"
						>
							<X className="h-4 w-4" />
						</button>
					</div>
				)}
				<div className="overflow-y-auto px-5 py-4">{children}</div>
				{footer && (
					<div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-zinc-100 bg-zinc-50/50">
						{footer}
					</div>
				)}
			</div>
		</div>
	);
}
