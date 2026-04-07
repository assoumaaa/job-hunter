import { Route, Routes } from "react-router-dom";
import { useAuth, SignIn, SignUp } from "@clerk/clerk-react";

import { FullPageProgress } from "components";

import Home from "./Home";
import Logout from "./Logout";

export default function Main() {
	const { isLoaded, isSignedIn } = useAuth();

	if (!isLoaded) return <FullPageProgress />;

	return (
		<Routes>
			<Route path="/logout" element={<Logout />} />
			<Route
				path="/register"
				element={
					<div className="flex min-h-screen items-center justify-center bg-zinc-50">
						<SignUp routing="path" path="/register" signInUrl="/" />
					</div>
				}
			/>
			<Route
				path="*"
				element={
					isSignedIn ? (
						<Home />
					) : (
						<div className="flex min-h-screen items-center justify-center bg-zinc-50">
							<SignIn routing="path" path="/" signUpUrl="/register" />
						</div>
					)
				}
			/>
		</Routes>
	);
}
