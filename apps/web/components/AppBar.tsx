'use client';

import { Button, Logo } from '@ckb/ui-kit';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';

export function AppBar() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  return (
    <header className="ckb-appbar">
      <Link
        href="/contracts"
        className="ckb-appbar__brand"
        style={{ textDecoration: 'none', color: 'inherit' }}
      >
        <Logo variant="horizontal" tone="white" width={180} />
        <span className="ckb-appbar__divider" aria-hidden="true" />
        <strong className="ckb-appbar__product">Contract Knowledge Base</strong>
      </Link>
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
