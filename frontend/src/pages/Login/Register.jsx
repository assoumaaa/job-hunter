import { useContext, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";

import { useAuthContext } from "services";
import { Button } from "components/ui/button";
import { Input } from "components/ui/input";
import { LoginContext } from "./Login";

const API_URL = import.meta.env.VITE_API_URL ?? "";

export default function Register() {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);

	const { setError, error } = useContext(LoginContext);
	const { signIn } = useAuthContext();
	const navigate = useNavigate();

	const handleSubmit = async (e) => {
		e.preventDefault();
		if (!email || !password) { setError("Please enter email and password"); return; }
		try {
			setLoading(true);
			setError(null);
			await axios.post(`${API_URL}/auth/register`, { name, email, password });
			await signIn(email, password);
			navigate("/jobs", { replace: true });
		} catch (err) {
			setError(err.response?.data?.detail ?? "Registration failed");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div>
			<h2 className="text-xl font-semibold text-center mb-6">Create account</h2>

			{error && <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">{error}</div>}

			<form onSubmit={handleSubmit} className="flex flex-col gap-3">
				<Input autoFocus placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} disabled={loading} />
				<Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} />
				<Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} />
				<Button type="submit" className="w-full mt-1" disabled={loading}>
					{loading ? "Creating..." : "Create account"}
				</Button>
			</form>

			<p className="text-sm text-center mt-4 text-zinc-500">
				Already have an account?{" "}
				<Link to="/" className="font-semibold text-zinc-700 hover:text-zinc-900">
					Sign in
				</Link>
			</p>
		</div>
	);
}
