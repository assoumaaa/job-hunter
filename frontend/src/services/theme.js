import { useCallback, useEffect, useState } from "react";

/**
 * Job Hunter theme service.
 * Preference ("system" | "light" | "dark") persists in localStorage; the
 * resolved mode lands on <html data-theme> (bootstrapped before first paint
 * by the inline script in index.html). Token values live in App.css; JS
 * consumers (ag-grid, Clerk) read them back via readToken().
 */

const STORAGE_KEY = "kestrel.theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");

export function getThemePref() {
	try {
		const v = localStorage.getItem(STORAGE_KEY);
		return v === "light" || v === "dark" ? v : "system";
	} catch {
		return "system";
	}
}

function resolve(pref) {
	if (pref === "light" || pref === "dark") return pref;
	return media.matches ? "dark" : "light";
}

function apply(pref) {
	document.documentElement.setAttribute("data-theme", resolve(pref));
}

export function setThemePref(pref) {
	try {
		localStorage.setItem(STORAGE_KEY, pref);
	} catch {
		/* storage unavailable; theme still applies for this session */
	}
	apply(pref);
}

/** Read a CSS custom property (e.g. "--k-surface") for the active theme. */
export function readToken(name) {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function useTheme() {
	const [pref, setPrefState] = useState(getThemePref);
	const [resolved, setResolved] = useState(() => resolve(getThemePref()));

	useEffect(() => {
		if (pref !== "system") return;
		const onChange = () => {
			apply("system");
			setResolved(resolve("system"));
		};
		media.addEventListener("change", onChange);
		return () => media.removeEventListener("change", onChange);
	}, [pref]);

	const setPref = useCallback((next) => {
		setThemePref(next);
		setPrefState(next);
		setResolved(resolve(next));
	}, []);

	return { pref, resolved, setPref };
}
