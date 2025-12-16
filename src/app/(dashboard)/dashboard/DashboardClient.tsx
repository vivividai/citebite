'use client';

import { User } from '@supabase/supabase-js';
import { DashboardProvider } from '@/context/DashboardContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { IconRail } from '@/components/layout/IconRail';
import { ContextSidebar } from '@/components/layout/ContextSidebar';
import { ContentPanel } from '@/components/layout/ContentPanel';
import { ChatPanel } from '@/components/layout/ChatPanel';

interface DashboardClientProps {
  user: User | null;
}

/**
 * Dashboard client component
 * Provides context and renders layout with all panels
 */
export function DashboardClient({ user }: DashboardClientProps) {
  return (
    <DashboardProvider>
      <DashboardLayout
        rail={<IconRail user={user} />}
        sidebar={<ContextSidebar />}
        content={<ContentPanel />}
        chat={<ChatPanel />}
      />
    </DashboardProvider>
  );
}
