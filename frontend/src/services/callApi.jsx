import { useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "@clerk/clerk-react";
import axios from "axios";
import { isFunction } from "lodash";
import { useSnackbar } from "notistack";

import { setAliasLoading } from "actions/AppAction";
import Config from "services/Config";
import { generateQueryString } from "utils";

const API_URL = Config.getEnv("VITE_API_URL") ?? "";

export default function useCallApi() {
	const [loading_, setLoading_] = useState(false);

	const dispatch = useDispatch();
	const navigate = useNavigate();
	const { enqueueSnackbar } = useSnackbar();
	const { getToken } = useAuth();
	const location = useLocation();

	const fetch = useMemo(() => {
		const fetch = axios.create({
			paramsSerializer: (params) => generateQueryString(params),
		});
		fetch.interceptors.response.use((resp) => resp.data);
		fetch.interceptors.request.use(async (config) => {
			const token = await getToken();
			if (token) config.headers["Authorization"] = `Bearer ${token}`;
			return config;
		});

		return (
			endpoint,
			{
				onSuccess,
				onError,
				onBeforeError,
				error,
				suppressError = false,
				success,
				json,
				method,
				alias,
				...rest
			} = {},
		) => {
			const opts = { method, ...rest };

			if (json) {
				opts.data = json;
				opts.method = opts.method ?? "post";
				opts.headers = { ...(opts.headers ?? {}), "Content-Type": "application/json" };
			}
			opts.method = opts.method ?? "get";

			let url;
			if (endpoint.startsWith("http")) {
				url = endpoint;
			} else if (endpoint.startsWith("/")) {
				url = `${API_URL}${endpoint}`;
			} else {
				url = `${API_URL}/${endpoint}`;
			}

			if (alias) {
				dispatch(setAliasLoading({ [alias]: true }));
			}
			setLoading_(true);

			return fetch(url, opts)
				.then((resp) => {
					if (onSuccess) {
						return onSuccess(resp);
					}
					return resp;
				})
				.then((resp) => {
					if (success) {
						const message = isFunction(success) ? success(resp) : success;
						enqueueSnackbar(message, { variant: "success" });
					}
					return resp;
				})
				.catch((err) => {
					if (onBeforeError?.(err) === false) {
						return;
					}

					const status = err?.response?.status;
					if (status === 401 || err.message === "Unauthorized" || err.message === "Error fetching token") {
						navigate("/logout", { state: { redirect: location.pathname } });
						enqueueSnackbar("Session expired, please login again", { variant: "error" });
						return;
					}

					if (status === 404) {
						enqueueSnackbar(err?.message, { variant: "error" });
						return;
					}

					if (status === 403) {
						enqueueSnackbar(err?.message ?? "Access forbidden", { variant: "error" });
						navigate("/", { replace: true });
						return;
					}

					if (status === 410) {
						enqueueSnackbar(err?.message ?? "Resource deleted", { variant: "error" });
						navigate("/", { replace: true });
						return;
					}

					console.error(err.message, err.response?.data);
					if (!suppressError) {
						enqueueSnackbar(error ?? "Unknown error, please try again", { variant: "error" });
					}
					onError?.(err.response);
				})
				.finally(() => {
					if (alias) {
						dispatch(setAliasLoading({ [alias]: false }));
					}
					setLoading_(false);
				});
		};
	}, [navigate, location, enqueueSnackbar, getToken, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

	return [fetch, loading_];
}
