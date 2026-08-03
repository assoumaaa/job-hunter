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

	return (
		<aside
			className="flex-shrink-0 border-r border-line flex flex-col bg-surface h-screen transition-[width] duration-200 ease-out"
			style={{ width: collapsed ? 60 : 196 }}
		>
			{/* Brand */}
			<div
				className={`flex items-center gap-2.5 h-14 border-b border-line ${collapsed ? "justify-center px-0" : "px-4"}`}
			>
				<div className="h-7 w-7 rounded-lg bg-accent-solid flex items-center justify-center flex-shrink-0 shadow-raised">
					<BrandMark className="h-4 w-4 text-white" />
				</div>
				{!collapsed && (
					<div className="flex flex-col leading-none">
						<span className="text-title font-semibold text-ink tracking-tight">Kestrel</span>
						<span className="text-micro font-medium text-ink-3 mt-0.5">Job search</span>
					</div>
				)}
			</div>

			{/* Nav */}
			<nav className="flex-1 px-2 py-3 flex flex-col gap-0.5">
				{NAV.map(({ to, label, Icon }) => (
					<NavLink key={to} to={to} title={collapsed ? label : undefined}>
						{({ isActive }) => (
							<div
								className={`group flex items-center gap-2.5 px-2.5 h-10 rounded-lg text-body font-medium transition-all duration-100 ${
									collapsed ? "justify-center" : ""
								} ${isActive ? "bg-muted text-ink" : "text-ink-2 hover:bg-hovertint hover:text-ink"}`}
							>
								<Icon
									aria-hidden="true"
									className={`h-[18px] w-[18px] flex-shrink-0 transition-colors ${isActive ? "text-accent" : "text-ink-3 group-hover:text-ink-2"}`}
								/>
								{!collapsed && <span className="truncate">{label}</span>}
							</div>
						)}
					</NavLink>
				))}
			</nav>

			{/* User card */}
			<div className="border-t border-line p-2 flex flex-col gap-1">
				<div className={`flex items-center gap-2.5 px-2 py-2 rounded-lg ${collapsed ? "justify-center" : ""}`}>
					{user?.imageUrl ? (
						<img
							src={user.imageUrl}
							alt={displayName}
							className="h-7 w-7 rounded-full flex-shrink-0 object-cover ring-1 ring-line"
						/>
					) : (
						<div className="h-7 w-7 rounded-full bg-accent-soft text-accent-text text-micro font-semibold flex items-center justify-center flex-shrink-0">
							{initials}
						</div>
					)}
					{!collapsed && (
						<div className="flex-1 min-w-0">
							<div className="text-body font-semibold text-ink truncate leading-tight">{displayName}</div>
						</div>
					)}
				</div>

				<div className={`flex gap-1 ${collapsed ? "flex-col" : ""}`}>
					<button
						type="button"
						onClick={() => signOut()}
						aria-label="Sign out"
						className={`${collapsed ? "w-full" : "flex-1"} h-9 rounded-lg flex items-center justify-center gap-1.5 text-body font-medium text-ink-2 hover:bg-muted hover:text-ink transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2`}
					>
						<LogOut className="h-4 w-4" aria-hidden="true" />
						{!collapsed && "Sign out"}
					</button>
					<button
						type="button"
						onClick={() => setCollapsed((c) => !c)}
						aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
						className={`${collapsed ? "w-full" : ""} h-8 w-8 rounded-lg flex items-center justify-center text-ink-3 hover:bg-muted hover:text-ink-2 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2`}
					>
						{collapsed ? (
							<ChevronsRight className="h-3.5 w-3.5" aria-hidden="true" />
						) : (
							<ChevronsLeft className="h-3.5 w-3.5" aria-hidden="true" />
						)}
					</button>
				</div>
			</div>
		</aside>
	);
}
