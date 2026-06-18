import { forwardRef } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react";

const ICONS = {
	success: <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />,
	error: <XCircle className="h-4 w-4 shrink-0 text-red-400" />,
	warning: <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />,
	default: <Info className="h-4 w-4 shrink-0 text-zinc-400" />,
};

const Snackbar = forwardRef(({ message, variant = "default" }, ref) => {
	return (
		<div
			ref={ref}
			className="flex items-center gap-2.5 px-3.5 py-2.5 bg-zinc-900/95 text-zinc-50 text-[12.5px] font-medium rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.25)] ring-1 ring-white/10 backdrop-blur-sm min-w-64 max-w-sm"
		>
			{ICONS[variant] ?? ICONS.default}
			<span className="leading-snug">{message}</span>
		</div>
	);
});

Snackbar.displayName = "Snackbar";

export default Snackbar;
