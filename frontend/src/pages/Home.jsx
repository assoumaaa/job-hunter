import { Navigate, Route, Routes } from "react-router-dom";

import MainMenu from "./MainMenu";
import Dashboard from "./Dashboard/Dashboard";
import Jobs from "./Jobs";
import CV from "./CV";
import Positions from "./Positions";
import Profile from "./Profile";

export default function Home() {
	return (
		<div className="flex h-screen overflow-hidden bg-zinc-50">
			<MainMenu />
			<main className="flex-1 flex flex-col overflow-hidden min-w-0">
				<Routes>
					<Route index element={<Navigate to="/home" replace />} />
					<Route path="/home" element={<Dashboard />} />
					<Route path="/jobs" element={<Jobs />} />
					<Route path="/cv" element={<CV />} />
					<Route path="/positions" element={<Positions />} />
					<Route path="/profile" element={<Profile />} />
					<Route path="*" element={<Navigate to="/home" replace />} />
				</Routes>
			</main>
		</div>
	);
}
