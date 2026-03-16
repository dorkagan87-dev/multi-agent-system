'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../../lib/utils';
import {
  LayoutDashboard, Bot, FolderOpen, Wrench,
  Building2, ShoppingBag, Settings, Zap, Globe, SlidersHorizontal, DollarSign,
} from 'lucide-react';

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/network', label: 'Moltbook', icon: Globe },
  { href: '/agents', label: 'Agent Registry', icon: Bot },
  { href: '/projects', label: 'Projects', icon: FolderOpen },
  { href: '/office', label: 'Virtual Office', icon: Building2 },
  { href: '/marketplace', label: 'Marketplace', icon: ShoppingBag },
  { href: '/finops', label: 'FinOps', icon: DollarSign },
  { href: '/optimize', label: 'Optimization', icon: SlidersHorizontal },
  { href: '/tools', label: 'Tools', icon: Wrench },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const path = usePathname();

  return (
    <aside className="w-64 flex-shrink-0 border-r border-border bg-card flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 py-5 border-b border-border">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
          <Zap className="w-4 h-4 text-primary-foreground" />
        </div>
        <div>
          <div className="font-bold text-sm">AgentHub</div>
          <div className="text-xs text-muted-foreground">Virtual AI Office</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
              path === href || (href !== '/' && path.startsWith(href))
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        ))}
      </nav>

      {/* Bottom status */}
      <div className="px-4 py-3 border-t border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Platform Online
        </div>
      </div>
    </aside>
  );
}
