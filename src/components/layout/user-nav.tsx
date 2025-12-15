'use client';

import { useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import { LogOut, User as UserIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

interface UserNavProps {
  user: User | null;
  variant?: 'default' | 'rail';
}

export function UserNav({ user, variant = 'default' }: UserNavProps) {
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.refresh();
  };

  if (!user) {
    if (variant === 'rail') {
      return (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/login')}
          className="h-10 w-10 rounded-full text-[hsl(var(--rail-foreground))] hover:bg-[hsl(var(--rail-muted)/0.3)]"
        >
          <UserIcon className="h-5 w-5" />
        </Button>
      );
    }
    return (
      <Button
        variant="default"
        onClick={() => router.push('/login')}
        className="ml-auto"
      >
        Sign In
      </Button>
    );
  }

  const getUserInitials = (email: string) => {
    return email.substring(0, 2).toUpperCase();
  };

  const isRail = variant === 'rail';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={
            isRail
              ? 'relative h-9 w-9 rounded-full hover:bg-[hsl(var(--rail-muted)/0.3)]'
              : 'relative h-10 w-10 rounded-full'
          }
        >
          <Avatar className={isRail ? 'h-8 w-8' : 'h-10 w-10'}>
            <AvatarImage
              src={user.user_metadata?.avatar_url}
              alt={user.email ?? 'User avatar'}
            />
            <AvatarFallback
              className={
                isRail
                  ? 'bg-[hsl(var(--rail-muted))] text-[hsl(var(--rail-foreground))] text-xs'
                  : ''
              }
            >
              {user.email ? getUserInitials(user.email) : 'U'}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-56"
        align={isRail ? 'start' : 'end'}
        side={isRail ? 'right' : 'bottom'}
        sideOffset={isRail ? 8 : 0}
        forceMount
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">
              {user.user_metadata?.full_name ?? 'User'}
            </p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push('/profile')}>
          <UserIcon className="mr-2 h-4 w-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
