'use client';

import { Button } from '@ckb/ui-kit';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';

export function AppBar() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  return (
    <header className="ckb-appbar">
      <div>
        <Link href="/contracts" style={{ textDecoration: 'none', color: 'inherit' }}>
          <strong>Contract Knowledge Base</strong>
        </Link>
      </div>
      {user && (
        <div className="ckb-stack-row">
          <span className="ckb-help">
            {user.displayName} ({user.email})
          </span>
          <Button
            variant="ghost"
            onClick={() => {
              logout();
              router.push('/login');
            }}
          >
            Sign out
          </Button>
        </div>
      )}
    </header>
  );
}
