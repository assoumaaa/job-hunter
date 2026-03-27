import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <TooltipProvider>
      <SidebarProvider className="h-screen overflow-hidden">
        <AppSidebar user={session.user} />
        <SidebarInset className="flex flex-col h-screen overflow-hidden">
          <div className="flex items-center h-12 px-3 border-b border-zinc-100 flex-shrink-0">
            <SidebarTrigger className="h-8 w-8" />
          </div>
          <div className="flex-1 overflow-hidden h-full">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
