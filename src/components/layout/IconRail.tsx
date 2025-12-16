'use client';

import { usePathname } from 'next/navigation';
import { Library, Store, Settings } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { IconRailItem } from './IconRailItem';
import { UserNav } from './user-nav';
import { User } from '@supabase/supabase-js';
import { BookOpen } from 'lucide-react';
import Link from 'next/link';

interface IconRailProps {
  user: User | null;
}

/**
 * Navigation rail items configuration
 */
const navigationItems = [
  {
    icon: Library,
    label: 'Library',
    href: '/dashboard',
    section: 'library' as const,
  },
  {
    icon: Store,
    label: 'Shop',
    href: '/dashboard/shop',
    section: 'shop' as const,
  },
];

const utilityItems = [
  {
    icon: Settings,
    label: 'Settings',
    href: '/dashboard/settings',
    section: 'settings' as const,
  },
];

/**
 * Icon rail navigation component
 * Fixed 60px width, full height, dark background
 */
export function IconRail({ user }: IconRailProps) {
  const pathname = usePathname();

  // Determine active section from pathname
  const getActiveSection = () => {
    if (pathname.startsWith('/dashboard/shop')) return 'shop';
    if (pathname.startsWith('/dashboard/settings')) return 'settings';
    return 'library';
  };

  const activeSection = getActiveSection();

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center justify-center h-14 border-b border-[hsl(var(--rail-muted)/0.3)]"
        >
          <BookOpen className="h-6 w-6 text-[hsl(var(--rail-foreground))]" />
        </Link>

        {/* Navigation Items */}
        <nav className="flex-1 py-2">
          <div className="space-y-1">
            {navigationItems.map(item => (
              <IconRailItem
                key={item.section}
                icon={item.icon}
                label={item.label}
                href={item.href}
                isActive={activeSection === item.section}
              />
            ))}
          </div>
        </nav>

        {/* Utility Items */}
        <div className="py-2 border-t border-[hsl(var(--rail-muted)/0.3)]">
          <div className="space-y-1">
            {utilityItems.map(item => (
              <IconRailItem
                key={item.section}
                icon={item.icon}
                label={item.label}
                href={item.href}
                isActive={activeSection === item.section}
              />
            ))}
          </div>

          {/* User Profile */}
          <div className="mt-2 flex justify-center pb-2">
            <UserNav user={user} variant="rail" />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
