import { forwardRef } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react";

const ICONS = {
	success: <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />,
	error: <XCircle className="h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />,
	warning: <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />,
	default: <Info className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />,
};

const Snackbar = forwardRef(({ message, variant = "default" }, ref) => {
	return (
		<div
			ref={ref}
			role={variant === "error" ? "alert" : "status"}
			className="flex items-center gap-2.5 px-3.5 py-2.5 bg-toast text-toast-fg text-label font-medium rounded-xl shadow-modal ring-1 ring-white/10 backdrop-blur-sm min-w-64 max-w-sm"
		>
			{ICONS[variant] ?? ICONS.default}
			<span className="leading-snug">{message}</span>
		</div>
	);
});

Snackbar.displayName = "Snackbar";

export default Snackbar;
