'use client';
import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { getSocket } from '../lib/socket';

/**
 * Subscribes to the Socket.io `agent-hub:contracts:done` event for a specific
 * contractId and calls `onDone` when the worker finishes analysis.
 */
export function useContractSocket(contractId: string | null, onDone: () => void) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  // Keep a stable ref to onDone so the effect doesn't re-run (and cause a
  // re-registration race window) whenever the callback identity changes.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!token || !contractId) return;

    const socket = getSocket(token);
    socket.emit('subscribe:global');

    const handler = (data: { contractId: string }) => {
      if (data.contractId === contractId) {
        onDoneRef.current();
      }
    };

    socket.on('agent-hub:contracts:done', handler);

    return () => {
      socket.off('agent-hub:contracts:done', handler);
      socket.emit('unsubscribe:global');
    };
  }, [token, contractId]); // onDone intentionally excluded — accessed via ref
}
