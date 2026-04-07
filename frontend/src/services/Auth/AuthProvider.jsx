import React, { useContext, useEffect, useState } from "react";
import axios from "axios";

export const AuthContext = React.createContext();

const KEY_TOKEN = "accessToken";
const API_URL = import.meta.env.VITE_API_URL ?? "";

const getStoredToken = () => localStorage.getItem(KEY_TOKEN);
const setStoredToken = (token) => localStorage.setItem(KEY_TOKEN, token);
const clearStoredToken = () => localStorage.removeItem(KEY_TOKEN);

export function useAuthContext() {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error("useAuthContext must be used inside AuthProvider");
	return ctx;
}

export function useIsAuthenticated() {
	const { token } = useAuthContext();
	return !!token;
}

export function useToken() {
	return () => getStoredToken();
}

export default function AuthProvider({ children }) {
	const [token, setToken] = useState(() => getStoredToken());
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		const onStorage = () => setToken(getStoredToken());
		window.addEventListener("storage", onStorage);
		return () => window.removeEventListener("storage", onStorage);
	}, []);

	const signIn = async (email, password) => {
		const params = new URLSearchParams();
		params.append("username", email);
		params.append("password", password);

		const { data } = await axios.post(`${API_URL}/auth/login`, params, {
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
		});

		setStoredToken(data.access_token);
		setToken(data.access_token);
	};

	const signOut = () => {
		clearStoredToken();
		setToken(null);
	};

	return <AuthContext.Provider value={{ token, loading, signIn, signOut }}>{children}</AuthContext.Provider>;
}
