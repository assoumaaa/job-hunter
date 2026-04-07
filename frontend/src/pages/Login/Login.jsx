import { createContext, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Zap } from "lucide-react";

import SignIn from "./SignIn";
import Register from "./Register";

export const LoginContext = createContext();

export default function Login() {
	const [error, setError] = useState();
	const location = useLocation();

	return (
		<main className="flex flex-col min-h-screen items-center justify-center py-8 bg-zinc-50">
			<div className="w-full max-w-sm px-4 flex flex-col gap-6">
				<div className="flex justify-center">
					<div className="h-11 w-11 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm">
						<Zap className="h-6 w-6 text-white" />
					</div>
				</div>

				<div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
					<LoginContext.Provider value={{ error, setError }}>
						<Routes>
							<Route path="/register" element={<Register />} />
							<Route path="/" element={<SignIn />} />
							<Route path="*" element={<Navigate to="/" state={{ redirect: location.pathname }} />} />
						</Routes>
					</LoginContext.Provider>
				</div>
			</div>
		</main>
	);
}
