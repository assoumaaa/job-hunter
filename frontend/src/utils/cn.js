import { clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Our @theme (App.css) defines custom text size tokens: text-micro, text-label,
// text-body, text-title, text-display, text-stat. tailwind-merge doesn't know
// them, so it treats e.g. `text-body` as a text COLOR and, seeing it beside
// `text-white` in the same className, drops the color — which is why solid
// buttons rendered dark labels. Registering the tokens as font sizes keeps the
// size and the color in separate groups so both survive the merge.
const twMerge = extendTailwindMerge({
	extend: {
		classGroups: {
			"font-size": [{ text: ["micro", "label", "body", "title", "display", "stat"] }],
		},
	},
});

export function cn(...inputs) {
	return twMerge(clsx(inputs));
}
