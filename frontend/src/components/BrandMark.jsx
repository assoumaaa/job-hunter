export default function BrandMark({ className = "" }) {
	return (
		<svg
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			aria-hidden="true"
		>
			<path d="M3 6V3h3" />
			<path d="M10 3h3v3" />
			<path d="M13 10v3h-3" />
			<path d="M6 13H3v-3" />
			<circle cx="8" cy="8" r="1.75" fill="currentColor" stroke="none" />
		</svg>
	);
}
