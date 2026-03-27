"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Briefcase, FileText, ListChecks, LogOut, User, Zap } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";

const navItems = [
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/positions", label: "Positions", icon: ListChecks },
  { href: "/cv", label: "My CV", icon: FileText },
  { href: "/profile", label: "Profile", icon: User },
];

interface Props {
  user: { name?: string | null; email?: string | null; image?: string | null };
}

export function AppSidebar({ user }: Props) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" className="border-r border-zinc-200">
      <SidebarHeader className="px-3 py-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="h-11 px-2 gap-3 hover:bg-transparent cursor-default" tooltip="Job Hunter">
              <div className="h-7 w-7 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                <Zap className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-bold tracking-tight text-indigo-600">Job Hunter</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent className="px-2 py-2">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {navItems.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === href}
                    tooltip={label}
                    className="h-11 text-sm px-3 gap-3"
                  >
                    <Link href={href}>
                      <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                      <span className="font-medium">{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-2 py-3">
        <SidebarSeparator className="mb-3" />
        <SidebarMenu className="gap-1">
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={user.email ?? "Profile"}
              className="h-11 px-3 gap-3 cursor-default"
            >
              <div className="h-6 w-6 rounded-full bg-zinc-200 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-zinc-600">
                {user.name?.[0]?.toUpperCase() ?? "U"}
              </div>
              <div className="flex flex-col text-left min-w-0">
                <span className="text-sm font-medium truncate leading-tight">{user.name}</span>
                <span className="text-xs text-muted-foreground truncate leading-tight">{user.email}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Logout"
              className="h-11 px-3 gap-3 text-zinc-500 hover:text-zinc-900"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="h-[18px] w-[18px] flex-shrink-0" />
              <span className="font-medium">Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
