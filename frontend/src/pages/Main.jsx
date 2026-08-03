import { useMemo } from "react";
import { Route, Routes } from "react-router-dom";
import { useAuth, SignIn, SignUp } from "@clerk/clerk-react";

import { FullPageProgress } from "components";
import BrandMark from "components/BrandMark";
import { readToken, useTheme } from "services";

import Home from "./Home";
import Logout from "./Logout";

/** Centered auth screen with the Job Hunter lockup above the Clerk card. */
function AuthScreen({ children }) {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas px-4">
			<div className="flex items-center gap-3">
				<div className="h-9 w-9 rounded-lg bg-accent-solid flex items-center justify-center shadow-raised">
					<BrandMark className="h-5 w-5 text-white" />
				</div>
				<div className="flex flex-col leading-none">
					<span className="text-display font-semibold text-ink tracking-tight">Job Hunter</span>
					<span className="text-label text-ink-3 mt-1">Job search workspace</span>
				</div>
			</div>
			{children}
		</div>
	);
}

export default function Main() {
	const { isLoaded, isSignedIn } = useAuth();
	const { resolved } = useTheme();

	// Clerk components read brand tokens per resolved theme.
	const appearance = useMemo(
		() => ({
			variables: {
				colorPrimary: readToken("--k-accent-solid"),
				colorBackground: readToken("--k-surface"),
				colorText: readToken("--k-ink"),
				colorTextSecondary: readToken("--k-ink-2"),
				colorInputBackground: readToken("--k-surface"),
				colorInputText: readToken("--k-ink"),
				colorNeutral: readToken("--k-ink"),
				borderRadius: "8px",
				fontFamily: '"Geist", system-ui, sans-serif',
			},
		}),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[resolved],
	);

	if (!isLoaded) return <FullPageProgress />;

	return (
		<Routes>
			<Route path="/logout" element={<Logout />} />
			<Route
				path="/register"
				element={
					<AuthScreen>
						<SignUp routing="path" path="/register" signInUrl="/" appearance={appearance} />
					</AuthScreen>
				}
			/>
			<Route
				path="*"
				element={
					isSignedIn ? (
						<Home />
					) : (
						<AuthScreen>
							<SignIn routing="path" path="/" signUpUrl="/register" appearance={appearance} />
						</AuthScreen>
					)
				}
			/>
		</Routes>
	);
}
