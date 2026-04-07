import ReactDOM from "react-dom/client";
import { Provider as ReduxProvider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { PersistGate } from "redux-persist/integration/react";
import { ClerkProvider } from "@clerk/clerk-react";
import { SnackbarProvider } from "notistack";

import Snackbar from "components/Snackbar";
import { Main } from "pages";
import { configureRedux } from "utils";

import "./App.css";

const { store, persistor } = configureRedux();
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const snackbarComponents = {
	default: Snackbar,
	success: Snackbar,
	error: Snackbar,
	warning: Snackbar,
	info: Snackbar,
};

ReactDOM.createRoot(document.getElementById("root")).render(
	<ClerkProvider publishableKey={PUBLISHABLE_KEY}>
		<ReduxProvider store={store}>
			<PersistGate loading={null} persistor={persistor}>
				<SnackbarProvider
					maxSnack={3}
					anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
					Components={snackbarComponents}
				>
					<BrowserRouter>
						<Main />
					</BrowserRouter>
				</SnackbarProvider>
			</PersistGate>
		</ReduxProvider>
	</ClerkProvider>,
);
