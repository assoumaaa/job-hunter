import { useSelector } from "react-redux";

export default function useLoading() {
	return useSelector((state) => state.app.aliasLoading);
}
