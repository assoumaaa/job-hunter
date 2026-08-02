import { forwardRef, useId } from "react";
import { cn } from "utils/cn";

const controlCls = cn(
	"w-full rounded-lg border border-line bg-surface text-body text-ink",
	"placeholder:text-ink-3 transition-colors",
	"hover:border-line-strong",
	"focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-0 focus-visible:border-transparent",
	"disabled:opacity-50 disabled:cursor-not-allowed",
);

/**
 * Wraps a control with an associated <label>, optional hint and inline error.
 * Every form control gets a programmatic name: pass `label`, or when the
 * design has no visible label, pass `aria-label` on the control instead.
 */
function Labelled({ id, label, hint, error, children }) {
	if (!label && !error && !hint) return children;
	return (
		<div className="flex flex-col gap-1.5">
			{label && (
				<label htmlFor={id} className="text-micro font-medium text-ink-2">
					{label}
				</label>
			)}
			{children}
			{hint && !error && (
				<p id={`${id}-hint`} className="text-micro text-ink-3 m-0">
					{hint}
				</p>
			)}
			{error && (
				<p id={`${id}-error`} className="text-micro text-red-600 m-0">
					{error}
				</p>
			)}
		</div>
	);
}

export const Input = forwardRef(function Input({ className, label, hint, error, id, ...props }, ref) {
	const autoId = useId();
	const inputId = id ?? (label || hint || error ? autoId : undefined);
	return (
		<Labelled id={inputId} label={label} hint={hint} error={error}>
			<input
				ref={ref}
				id={inputId}
				aria-invalid={error ? "true" : undefined}
				aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
				className={cn("flex h-9 px-3 py-1", controlCls, className)}
				{...props}
			/>
		</Labelled>
	);
});

export const Textarea = forwardRef(function Textarea({ className, label, hint, error, id, ...props }, ref) {
	const autoId = useId();
	const inputId = id ?? (label || hint || error ? autoId : undefined);
	return (
		<Labelled id={inputId} label={label} hint={hint} error={error}>
			<textarea
				ref={ref}
				id={inputId}
				aria-invalid={error ? "true" : undefined}
				aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
				className={cn("px-3 py-2", controlCls, className)}
				{...props}
			/>
		</Labelled>
	);
});
