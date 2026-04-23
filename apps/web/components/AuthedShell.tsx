'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { AppBar } from './AppBar';

export function AuthedShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { token, hydrated, hydrate } = useAuthStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (hydrated && !token) router.replace('/login');
  }, [hydrated, token, router]);

  if (!hydrated) return <p>Loading…</p>;
  if (!token) return null;

  return (
    <>
      <AppBar />
      {children}
    </>
  );
}
