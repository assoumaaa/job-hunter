import { cn } from "utils/cn";

export function Card({ className, children, ...props }) {
	return (
		<div
			className={cn(
				"bg-white rounded-xl border border-zinc-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)]",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}

export function CardHeader({ className, children, ...props }) {
	return (
		<div className={cn("px-5 py-4 border-b border-zinc-100", className)} {...props}>
			{children}
		</div>
	);
}

export function CardBody({ className, children, ...props }) {
	return (
		<div className={cn("p-5", className)} {...props}>
			{children}
		</div>
	);
}
