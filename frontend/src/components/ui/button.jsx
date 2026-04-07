import { cn } from "utils/cn";

const variants = {
	default: "bg-indigo-600 text-white hover:bg-indigo-700",
	outline: "border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-800",
	ghost: "hover:bg-zinc-100 text-zinc-700",
	destructive: "bg-red-500 text-white hover:bg-red-600",
};

const sizes = {
	default: "h-9 px-4 py-2 text-sm",
	sm: "h-7 px-3 text-xs",
	lg: "h-11 px-6 text-base",
	icon: "h-9 w-9",
};

export function Button({ className, variant = "default", size = "default", disabled = false, children, ...props }) {
	return (
		<button
			className={cn(
				"inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
				variants[variant],
				sizes[size],
				className,
			)}
			disabled={disabled}
			{...props}
		>
			{children}
		</button>
	);
}
