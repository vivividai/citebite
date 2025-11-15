import Link from 'next/link';
import { User } from '@supabase/supabase-js';
import { BookOpen } from 'lucide-react';
import { UserNav } from './user-nav';

interface NavigationProps {
  user: User | null;
}

export function Navigation({ user }: NavigationProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center px-4">
        <div className="mr-4 flex">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <BookOpen className="h-6 w-6" />
            <span className="font-bold text-xl">CiteBite</span>
          </Link>
          <nav className="flex items-center space-x-6 text-sm font-medium">
            <Link
              href="/"
              className="transition-colors hover:text-foreground/80 text-foreground"
            >
              Home
            </Link>
            {user && (
              <Link
                href="/collections"
                className="transition-colors hover:text-foreground/80 text-foreground/60"
              >
                Collections
              </Link>
            )}
            <Link
              href="/discover"
              className="transition-colors hover:text-foreground/80 text-foreground/60"
            >
              Discover
            </Link>
          </nav>
        </div>
        <div className="ml-auto flex items-center space-x-4">
          <UserNav user={user} />
        </div>
      </div>
    </header>
  );
}
