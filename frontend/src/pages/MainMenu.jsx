import { Briefcase, ChevronLeft, ChevronRight, FileText, LayoutDashboard, ListChecks, LogOut, User, Zap } from "lucide-react";
import { useState } from "react";

import { NavLink } from "react-router-dom";
import { useClerk } from "@clerk/clerk-react";

const NAV = [
	{ to: "/home", label: "Home", Icon: LayoutDashboard },
	{ to: "/jobs", label: "Jobs", Icon: Briefcase },
	{ to: "/positions", label: "Positions", Icon: ListChecks },
	{ to: "/cv", label: "My CV", Icon: FileText },
	{ to: "/profile", label: "Profile", Icon: User },
];

export default function MainMenu() {
	const { signOut } = useClerk();
	const [collapsed, setCollapsed] = useState(false);

	return (
		<nav
			className="flex-shrink-0 border-r border-zinc-200 flex flex-col bg-white py-3 h-screen transition-all duration-200"
			style={{ width: collapsed ? 56 : 180 }}
		>
			{/* Logo */}
			<div className={`flex items-center gap-2.5 px-3 py-2 ${collapsed ? "justify-center" : ""}`}>
				<div className="h-7 w-7 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm">
					<Zap className="h-4 w-4 text-white" />
				</div>
				{!collapsed && (
					<span className="text-sm font-bold tracking-tight text-indigo-600 truncate">Job Hunter</span>
				)}
			</div>

			<div className="border-t border-zinc-100 my-2" />

			{/* Nav items */}
			<div className="flex-1 px-2 flex flex-col gap-0.5">
				{NAV.map(({ to, label, Icon }) => (
					<NavLink key={to} to={to} style={{ textDecoration: "none" }} title={collapsed ? label : undefined}>
						{({ isActive }) => (
							<div
								className={`flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
									collapsed ? "justify-center" : ""
								} ${
									isActive
										? "bg-indigo-50 text-indigo-700"
										: "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
								}`}
							>
								<Icon className="h-[18px] w-[18px] flex-shrink-0" />
								{!collapsed && label}
							</div>
						)}
					</NavLink>
				))}
			</div>

			<div className="border-t border-zinc-100 mb-2" />

			{/* Collapse toggle */}
			<div className="px-2 mb-1">
				<button
					onClick={() => setCollapsed((c) => !c)}
					className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-sm font-medium text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors cursor-pointer ${collapsed ? "justify-center" : ""}`}
				>
					{collapsed ? (
						<ChevronRight className="h-[18px] w-[18px] flex-shrink-0" />
					) : (
						<>
							<ChevronLeft className="h-[18px] w-[18px] flex-shrink-0" />
							<span>Collapse</span>
						</>
					)}
				</button>
			</div>

			{/* Logout */}
			<div className="px-2">
				<button
					onClick={signOut}
					title={collapsed ? "Logout" : undefined}
					className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-sm font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors cursor-pointer ${collapsed ? "justify-center" : ""}`}
				>
					<LogOut className="h-[18px] w-[18px] flex-shrink-0" />
					{!collapsed && "Logout"}
				</button>
			</div>
		</nav>
	);
}
