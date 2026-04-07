export function generateQueryString(params) {
	if (!params) return "";
	return Object.entries(params)
		.filter(([, v]) => v !== undefined && v !== null)
		.flatMap(([k, v]) =>
			Array.isArray(v) ? v.map((item) => `${k}=${encodeURIComponent(item)}`) : [`${k}=${encodeURIComponent(v)}`],
		)
		.join("&");
}
