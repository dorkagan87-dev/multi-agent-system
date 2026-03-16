import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(date: string | Date): string {
  const d = new Date(date);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export const STATUS_COLORS: Record<string, string> = {
  idle: 'bg-green-500',
  busy: 'bg-yellow-500',
  error: 'bg-red-500',
  disabled: 'bg-gray-400',
  rate_limited: 'bg-orange-500',
  pending: 'bg-gray-400',
  queued: 'bg-blue-400',
  running: 'bg-yellow-400 animate-pulse',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  cancelled: 'bg-gray-500',
  blocked: 'bg-purple-400',
  draft: 'bg-gray-400',
  active: 'bg-green-500',
  paused: 'bg-yellow-500',
  archived: 'bg-gray-300',
};

export const PROVIDER_ICONS: Record<string, string> = {
  openai: '🤖',
  anthropic: '🧠',
  google: '✨',
  mistral: '💫',
  cohere: '🌐',
  custom: '⚙️',
};
