import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Contract Knowledge Base',
  description: 'Technica CKB',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
