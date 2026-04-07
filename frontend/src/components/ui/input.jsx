import { forwardRef } from "react";
import { cn } from "utils/cn";

export const Input = forwardRef(function Input({ className, ...props }, ref) {
	return (
		<input
			ref={ref}
			className={cn(
				"flex h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 py-1 text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-0 disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
});
