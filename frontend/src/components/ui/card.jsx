import { cn } from "utils/cn";

export function Card({ className, children, ...props }) {
	return (
		<div className={cn("bg-surface rounded-xl border border-line shadow-raised", className)} {...props}>
			{children}
		</div>
	);
}

export function CardHeader({ className, children, ...props }) {
	return (
		<div className={cn("px-5 py-4 border-b border-line", className)} {...props}>
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
