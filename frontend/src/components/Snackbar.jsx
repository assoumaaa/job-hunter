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
			className="flex items-center gap-2.5 px-4 py-3 bg-zinc-900 text-zinc-100 text-xs font-medium rounded-xl shadow-xl border border-zinc-800 min-w-64 max-w-sm"
		>
			{ICONS[variant] ?? ICONS.default}
			<span className="leading-snug">{message}</span>
		</div>
	);
});

Snackbar.displayName = "Snackbar";

export default Snackbar;
