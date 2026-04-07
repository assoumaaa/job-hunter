import { createSlice } from "@reduxjs/toolkit";

const appSlice = createSlice({
	name: "app",
	initialState: { loading: true, aliasLoading: false, mobileDevice: false },
	reducers: {
		setLoading: (state, action) => {
			state.loading = action.payload;
		},
		setAliasLoading: (state, action) => ({ ...state, aliasLoading: { ...state.aliasLoading, ...action.payload } }),
		setMobileDevice: (state, action) => {
			state.mobileDevice = action.payload;
		},
	},
});

export const { setLoading, setAliasLoading, setMobileDevice } = appSlice.actions;
export default appSlice.reducer;
