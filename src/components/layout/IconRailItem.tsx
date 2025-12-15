'use client';

import { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface IconRailItemProps {
  icon: LucideIcon;
  label: string;
  href?: string;
  isActive?: boolean;
  onClick?: () => void;
}

/**
 * Individual item in the icon rail navigation
 * Supports both link navigation and click handlers
 */
export function IconRailItem({
  icon: Icon,
  label,
  href,
  isActive = false,
  onClick,
}: IconRailItemProps) {
  const content = (
    <div
      className={cn(
        'relative flex items-center justify-center w-full h-12 cursor-pointer transition-colors',
        'hover:bg-[hsl(var(--rail-muted)/0.3)]',
        isActive && 'bg-[hsl(var(--rail-muted)/0.5)]'
      )}
    >
      {/* Active indicator - left border */}
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-[hsl(var(--rail-active))] rounded-r-full" />
      )}
      <Icon
        className={cn(
          'h-5 w-5 transition-colors',
          isActive
            ? 'text-[hsl(var(--rail-active))]'
            : 'text-[hsl(var(--rail-foreground))]'
        )}
      />
    </div>
  );

  const tooltipWrapper = (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        {href ? (
          <Link href={href} className="block w-full">
            {content}
          </Link>
        ) : (
          <button
            type="button"
            onClick={onClick}
            className="block w-full focus:outline-none"
          >
            {content}
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );

  return tooltipWrapper;
}
