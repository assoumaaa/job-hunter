import { forwardRef } from "react";

import { cn } from "utils/cn";

const variants = {
	default: "bg-ink text-canvas hover:opacity-90 active:opacity-100",
	primary: "bg-accent-solid text-white hover:bg-accent-solid-hover",
	outline: "border border-line bg-surface hover:bg-hovertint hover:border-line-strong text-ink",
	ghost: "hover:bg-muted text-ink-2 hover:text-ink",
	subtle: "bg-muted hover:bg-hovertint text-ink",
	destructive: "bg-red-600 text-white hover:bg-red-700",
};

const sizes = {
	default: "h-10 px-4 text-body",
	sm: "h-9 px-3.5 text-body",
	xs: "h-7 px-2.5 text-label",
	lg: "h-11 px-5 text-title",
	icon: "h-9 w-9",
};

export const Button = forwardRef(function Button(
	{ className, variant = "default", size = "default", disabled = false, type = "button", children, ...props },
	ref,
) {
	return (
		<button
			ref={ref}
			type={type}
			className={cn(
				"inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-100",
				"focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
				"disabled:opacity-50 disabled:pointer-events-none cursor-pointer whitespace-nowrap",
				"active:scale-[0.98]",
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
