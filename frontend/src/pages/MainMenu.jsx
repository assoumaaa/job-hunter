import {
	Briefcase,
	ChevronsLeft,
	ChevronsRight,
	FileText,
	LayoutDashboard,
	ListChecks,
	LogOut,
	Settings,
	User,
} from "lucide-react";
import { useEffect, useState } from "react";

import { NavLink } from "react-router-dom";
import { useClerk, useUser } from "@clerk/clerk-react";

import BrandMark from "components/BrandMark";

const NAV = [
	{ to: "/home", label: "Overview", Icon: LayoutDashboard },
	{ to: "/jobs", label: "Jobs", Icon: Briefcase },
	{ to: "/positions", label: "Targeting", Icon: ListChecks },
	{ to: "/cv", label: "My CV", Icon: FileText },
	{ to: "/profile", label: "Profile", Icon: User },
	{ to: "/settings", label: "Settings", Icon: Settings },
];

const STORAGE_KEY = "jh.menu.collapsed";

export default function MainMenu() {
	const { signOut } = useClerk();
	const { user } = useUser();
	const [collapsed, setCollapsed] = useState(() => {
		try {
			return localStorage.getItem(STORAGE_KEY) === "1";
		} catch {
			return false;
		}
	});

	useEffect(() => {
		try {
			localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
		} catch {}
	}, [collapsed]);

	const initials = (user?.fullName || user?.primaryEmailAddress?.emailAddress || "?")
		.split(/\s+/)
		.map((s) => s[0])
		.slice(0, 2)
		.join("")
		.toUpperCase();
	const displayName =
		user?.fullName || user?.firstName || user?.primaryEmailAddress?.emailAddress?.split("@")[0] || "Account";
	const email = user?.primaryEmailAddress?.emailAddress;

	return (
		<aside
			className="flex-shrink-0 border-r border-zinc-200/80 flex flex-col bg-white h-screen transition-[width] duration-200 ease-out"
			style={{ width: collapsed ? 60 : 196 }}
		>
			{/* Brand */}
			<div
				className={`flex items-center gap-2.5 h-14 border-b border-zinc-100 ${collapsed ? "justify-center px-0" : "px-4"}`}
			>
				<div className="h-7 w-7 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm">
					<BrandMark className="h-4 w-4 text-white" />
				</div>
				{!collapsed && (
					<div className="flex flex-col leading-none">
						<span className="text-[15px] font-semibold text-zinc-900 tracking-tight">Job Hunter</span>
						<span className="text-[11px] font-medium text-zinc-400 mt-0.5">workspace</span>
					</div>
				)}
			</div>

			{/* Nav */}
			<nav className="flex-1 px-2 py-3 flex flex-col gap-0.5">
				{!collapsed && (
					<div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
						Workspace
					</div>
				)}
				{NAV.map(({ to, label, Icon }) => (
					<NavLink key={to} to={to} title={collapsed ? label : undefined}>
						{({ isActive }) => (
							<div
								className={`group flex items-center gap-2.5 px-2.5 h-10 rounded-lg text-[14px] font-medium transition-all duration-100 ${
									collapsed ? "justify-center" : ""
								} ${
									isActive
										? "bg-zinc-100 text-zinc-900"
										: "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
								}`}
							>
								<Icon
									className={`h-[18px] w-[18px] flex-shrink-0 transition-colors ${isActive ? "text-zinc-900" : "text-zinc-400 group-hover:text-zinc-700"}`}
								/>
								{!collapsed && <span className="truncate">{label}</span>}
								{!collapsed && isActive && (
									<span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-500" />
								)}
							</div>
						)}
					</NavLink>
				))}
			</nav>

			{/* User card */}
			<div className="border-t border-zinc-100 p-2 flex flex-col gap-1">
				<div className={`flex items-center gap-2.5 px-2 py-2 rounded-lg ${collapsed ? "justify-center" : ""}`}>
					{user?.imageUrl ? (
						<img
							src={user.imageUrl}
							alt={displayName}
							className="h-7 w-7 rounded-full flex-shrink-0 object-cover ring-1 ring-zinc-200"
						/>
					) : (
						<div className="h-7 w-7 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
							{initials}
						</div>
					)}
					{!collapsed && (
						<div className="flex-1 min-w-0">
							<div className="text-[13px] font-semibold text-zinc-900 truncate leading-tight">
								{displayName}
							</div>
							{email && (
								<div className="text-[11px] text-zinc-400 truncate leading-tight mt-0.5">{email}</div>
							)}
						</div>
					)}
				</div>

				<div className="flex gap-1">
					<button
						onClick={() => signOut()}
						title="Sign out"
						className={`${collapsed ? "w-full" : "flex-1"} h-9 rounded-md flex items-center justify-center gap-1.5 text-[13px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors cursor-pointer`}
					>
						<LogOut className="h-4 w-4" />
						{!collapsed && "Sign out"}
					</button>
					{!collapsed && (
						<button
							onClick={() => setCollapsed(true)}
							title="Collapse"
							className="h-8 w-8 rounded-md flex items-center justify-center text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors cursor-pointer"
						>
							<ChevronsLeft className="h-3.5 w-3.5" />
						</button>
					)}
				</div>
				{collapsed && (
					<button
						onClick={() => setCollapsed(false)}
						title="Expand"
						className="h-8 w-full rounded-md flex items-center justify-center text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors cursor-pointer"
					>
						<ChevronsRight className="h-3.5 w-3.5" />
					</button>
				)}
			</div>
		</aside>
	);
}
