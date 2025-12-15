'use client';

import { useDashboard } from '@/context/DashboardContext';
import { CollectionsSidebar } from './CollectionsSidebar';
import { Settings, Store } from 'lucide-react';

/**
 * Placeholder sidebar for Shop section (future feature)
 */
function ShopSidebar() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[hsl(var(--sidebar-border))]">
        <Store className="h-4 w-4 text-primary" />
        <h2 className="font-semibold text-sm">Community Shop</h2>
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center">
          <Store className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Coming Soon</p>
          <p className="text-xs text-muted-foreground mt-1">
            Browse and share research collections with the community
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Placeholder sidebar for Settings section (future feature)
 */
function SettingsSidebar() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[hsl(var(--sidebar-border))]">
        <Settings className="h-4 w-4 text-primary" />
        <h2 className="font-semibold text-sm">Settings</h2>
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center">
          <Settings className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Coming Soon</p>
          <p className="text-xs text-muted-foreground mt-1">
            Configure your account and preferences
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Context sidebar container
 * Renders appropriate sidebar based on active rail item
 */
export function ContextSidebar() {
  const { activeSection } = useDashboard();

  switch (activeSection) {
    case 'library':
      return <CollectionsSidebar />;
    case 'shop':
      return <ShopSidebar />;
    case 'settings':
      return <SettingsSidebar />;
    default:
      return <CollectionsSidebar />;
  }
}
