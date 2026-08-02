import { Navigate, Route, Routes } from "react-router-dom";

import MainMenu from "./MainMenu";
import Dashboard from "./Dashboard/Dashboard";
import Jobs from "./Jobs";
import TweakJob from "./Jobs/TweakJob";
import CV from "./CV";
import Positions from "./Positions";
import Profile from "./Profile";
import Settings from "./Settings";

export default function Home() {
	return (
		<div className="flex h-screen overflow-hidden bg-canvas">
			<a
				href="#main"
				className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-accent-solid focus:px-3 focus:py-2 focus:text-label focus:font-medium focus:text-white"
			>
				Skip to content
			</a>
			<MainMenu />
			<main id="main" className="flex-1 flex flex-col overflow-hidden min-w-0">
				<Routes>
					<Route index element={<Navigate to="/home" replace />} />
					<Route path="/home" element={<Dashboard />} />
					<Route path="/jobs" element={<Jobs />} />
					<Route path="/jobs/:jobId/tweak" element={<TweakJob />} />
					<Route path="/cv" element={<CV />} />
					<Route path="/positions" element={<Positions />} />
					<Route path="/profile" element={<Profile />} />
					<Route path="/settings" element={<Settings />} />
					<Route path="*" element={<Navigate to="/home" replace />} />
				</Routes>
			</main>
		</div>
	);
}
