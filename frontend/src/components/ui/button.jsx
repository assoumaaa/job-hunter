import { forwardRef } from "react";

import { cn } from "utils/cn";

const variants = {
	default:
		"bg-zinc-900 text-white hover:bg-zinc-800 active:bg-zinc-950 shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)]",
	primary:
		"bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 shadow-[inset_0_-1px_0_rgba(0,0,0,0.12)]",
	outline: "border border-zinc-200 bg-white hover:bg-zinc-50 hover:border-zinc-300 text-zinc-800",
	ghost: "hover:bg-zinc-100 text-zinc-700",
	subtle: "bg-zinc-100 hover:bg-zinc-200 text-zinc-800",
	destructive: "bg-red-600 text-white hover:bg-red-700",
};

const sizes = {
	default: "h-10 px-4 text-[14px]",
	sm: "h-9 px-3.5 text-[13px]",
	xs: "h-7 px-2.5 text-xs",
	lg: "h-11 px-5 text-[15px]",
	icon: "h-9 w-9",
};

export const Button = forwardRef(function Button(
	{ className, variant = "default", size = "default", disabled = false, children, ...props },
	ref,
) {
	return (
		<button
			ref={ref}
			className={cn(
				"inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-100",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/10 focus-visible:ring-offset-1 focus-visible:ring-offset-white",
				"disabled:opacity-50 disabled:pointer-events-none cursor-pointer whitespace-nowrap",
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
});
