'use client';

import { ReactNode, useRef, useState, createContext, useContext } from 'react';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import type { ImperativePanelHandle } from 'react-resizable-panels';

// Context for content panel collapse state
interface ContentPanelContextValue {
  isCollapsed: boolean;
  toggle: () => void;
}

const ContentPanelContext = createContext<ContentPanelContextValue | null>(
  null
);

export function useContentPanel() {
  const context = useContext(ContentPanelContext);
  if (!context) {
    throw new Error('useContentPanel must be used within DashboardLayout');
  }
  return context;
}

interface DashboardLayoutProps {
  rail: ReactNode;
  sidebar: ReactNode;
  content: ReactNode;
  chat: ReactNode;
}

/**
 * 4-column dashboard layout component
 * Layout: [Rail 60px] [Sidebar 220px] [Content <-> Chat (resizable)]
 * Content panel can be collapsed to focus on chat
 */
export function DashboardLayout({
  rail,
  sidebar,
  content,
  chat,
}: DashboardLayoutProps) {
  const contentPanelRef = useRef<ImperativePanelHandle>(null);
  const [isContentCollapsed, setIsContentCollapsed] = useState(false);

  const toggleContentPanel = () => {
    const panel = contentPanelRef.current;
    if (panel) {
      if (isContentCollapsed) {
        panel.expand();
      } else {
        panel.collapse();
      }
    }
  };

  return (
    <ContentPanelContext.Provider
      value={{ isCollapsed: isContentCollapsed, toggle: toggleContentPanel }}
    >
      <div className="h-screen w-full grid grid-cols-[60px_220px_1fr] overflow-hidden">
        {/* Icon Rail - Navigation */}
        <aside className="h-full bg-[hsl(var(--rail))] flex flex-col">
          {rail}
        </aside>

        {/* Context Sidebar - Collection list, Settings, etc. */}
        <aside className="h-full bg-[hsl(var(--sidebar))] border-r border-[hsl(var(--sidebar-border))] overflow-hidden flex flex-col">
          {sidebar}
        </aside>

        {/* Main Content + Chat - Resizable */}
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Main Content - Paper list + Graph (collapsible) */}
          <ResizablePanel
            ref={contentPanelRef}
            defaultSize={70}
            minSize={30}
            collapsible
            collapsedSize={0}
            onCollapse={() => setIsContentCollapsed(true)}
            onExpand={() => setIsContentCollapsed(false)}
          >
            <main className="h-full bg-background overflow-hidden flex flex-col">
              {content}
            </main>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Chat Panel */}
          <ResizablePanel defaultSize={30} minSize={20}>
            <aside className="h-full bg-card border-l overflow-hidden flex flex-col">
              {chat}
            </aside>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </ContentPanelContext.Provider>
  );
}
