import { useContext, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAuthContext } from "services";
import { Button } from "components/ui/button";
import { Input } from "components/ui/input";
import { LoginContext } from "./Login";

export default function SignIn() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);

	const { setError, error } = useContext(LoginContext);
	const { signIn } = useAuthContext();
	const location = useLocation();
	const navigate = useNavigate();

	const handleSubmit = async (e) => {
		e.preventDefault();
		if (!email || !password) { setError("Please enter email and password"); return; }
		try {
			setLoading(true);
			setError(null);
			await signIn(email, password);
			navigate(location.state?.redirect ?? "/jobs", { replace: true });
		} catch (err) {
			setError(err.response?.data?.detail ?? "Invalid email or password");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div>
			<h2 className="text-xl font-semibold text-center mb-6">Sign in</h2>

			{error && <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">{error}</div>}

			<form onSubmit={handleSubmit} className="flex flex-col gap-3">
				<Input label="Email" type="email" autoFocus placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} />
				<Input label="Password" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} />
				<Button type="submit" className="w-full mt-1" disabled={loading}>
					{loading ? "Signing in..." : "Sign in"}
				</Button>
			</form>

			<p className="text-sm text-center mt-4 text-zinc-500">
				No account?{" "}
				<Link to="/register" className="font-semibold text-zinc-700 hover:text-zinc-900">
					Register
				</Link>
			</p>
		</div>
	);
}
