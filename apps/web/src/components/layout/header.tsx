'use client';
import { useSession, signOut } from 'next-auth/react';
import { Bell, LogOut, User } from 'lucide-react';
import { usePathname } from 'next/navigation';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/agents': 'Agent Registry',
  '/projects': 'Projects',
  '/office': 'Virtual Office',
  '/marketplace': 'Marketplace',
  '/tools': 'Tools',
  '/settings': 'Settings',
};

export function Header() {
  const { data: session } = useSession();
  const path = usePathname();
  const title = Object.entries(PAGE_TITLES).find(([k]) => path === k || (k !== '/' && path.startsWith(k)))?.[1] ?? 'AgentHub';

  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-6">
      <h1 className="text-base font-semibold">{title}</h1>
      <div className="flex items-center gap-3">
        <button className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground">
          <Bell className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <User className="w-4 h-4" />
          <span>{(session?.user as any)?.name ?? session?.user?.email ?? 'User'}</span>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/auth/login' })}
          className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
