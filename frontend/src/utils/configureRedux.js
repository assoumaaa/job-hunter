import { configureStore } from "@reduxjs/toolkit";
import { persistStore, persistReducer, FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER } from "redux-persist";
import storage from "redux-persist/lib/storage";

import { appReducer } from "actions";

const persistConfig = { key: "root", storage, whitelist: [] };
const persistedApp = persistReducer(persistConfig, appReducer);

export function configureRedux() {
	const store = configureStore({
		reducer: { app: persistedApp },
		middleware: (getDefault) =>
			getDefault({ serializableCheck: { ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER] } }),
	});
	const persistor = persistStore(store);
	return { store, persistor };
}
