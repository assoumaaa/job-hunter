import { grey } from "@mui/material/colors";
import { createTheme, responsiveFontSizes } from "@mui/material/styles";

export const theme = responsiveFontSizes(
	createTheme({
		palette: {
			primary: { main: "#4f46e5" }, // indigo-600
			secondary: { main: "#6366f1" },
			success: { main: "#22c55e" },
			error: { main: "#ef4444" },
		},
		typography: {
			fontFamily: "Inter, sans-serif",
			body1: { color: "#3f3f46" },
			body2: { color: "#3f3f46" },
		},
		components: {
			MuiCard: {
				styleOverrides: {
					root: { borderRadius: 12, border: `1px solid ${grey[200]}`, boxShadow: "none" },
				},
			},
			MuiButton: {
				styleOverrides: {
					root: { boxShadow: "none", "&:hover": { boxShadow: "none" }, textTransform: "none" },
				},
			},
		},
	}),
);
