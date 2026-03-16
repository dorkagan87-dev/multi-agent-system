'use client';
import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { getSocket } from '../lib/socket';

export function useRealtimeDashboard(onUpdate: () => void) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    socket.emit('subscribe:global');

    const events = ['task:status_changed', 'project:progress', 'agent:status_changed', 'queue:stats'];
    events.forEach((e) => socket.on(e, onUpdate));

    return () => {
      events.forEach((e) => socket.off(e, onUpdate));
    };
  }, [token, onUpdate]);
}
