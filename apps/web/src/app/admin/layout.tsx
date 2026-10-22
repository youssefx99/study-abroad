import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Flow — admin',
  // Reachable by URL only, and kept out of search results.
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[var(--color-surface-sunken)]">{children}</div>;
}
