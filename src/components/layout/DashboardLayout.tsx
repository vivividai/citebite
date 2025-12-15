'use client';

import { ReactNode } from 'react';

interface DashboardLayoutProps {
  rail: ReactNode;
  sidebar: ReactNode;
  content: ReactNode;
  chat: ReactNode;
}

/**
 * 4-column dashboard layout component
 * Layout: [Rail 60px] [Sidebar 220px] [Content 1fr] [Chat 400px]
 */
export function DashboardLayout({
  rail,
  sidebar,
  content,
  chat,
}: DashboardLayoutProps) {
  return (
    <div className="h-screen w-full grid grid-cols-[60px_220px_1fr_400px] overflow-hidden">
      {/* Icon Rail - Navigation */}
      <aside className="h-full bg-[hsl(var(--rail))] flex flex-col">
        {rail}
      </aside>

      {/* Context Sidebar - Collection list, Settings, etc. */}
      <aside className="h-full bg-[hsl(var(--sidebar))] border-r border-[hsl(var(--sidebar-border))] overflow-hidden flex flex-col">
        {sidebar}
      </aside>

      {/* Main Content - Paper list + Graph */}
      <main className="h-full bg-background overflow-hidden flex flex-col">
        {content}
      </main>

      {/* Chat Panel */}
      <aside className="h-full bg-card border-l overflow-hidden flex flex-col">
        {chat}
      </aside>
    </div>
  );
}
