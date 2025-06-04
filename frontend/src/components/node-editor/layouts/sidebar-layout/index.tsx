import { AppNavbar } from '@/components/node-editor/layouts/sidebar-layout/app-navbar';
import { AppSidebar } from '@/components/node-editor/layouts/sidebar-layout/app-sidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/redpanda-ui/sidebar';

export default function SidebarLayout({
  children,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex h-screen w-full flex-col overflow-hidden">
        <SidebarTrigger className="absolute z-10" />
        {children}
        <AppNavbar />
      </main>
    </SidebarProvider>
  );
}
