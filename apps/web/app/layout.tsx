import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Contract Knowledge Base',
  description: 'Technica CKB',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
