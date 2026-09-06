import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { ToastProvider } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/primitives';
import { AppShell } from '@/components/app-shell';
import './globals.css';

/**
 * Three typefaces, three jobs.
 *
 * Bricolage Grotesque carries headings because it has enough character to make
 * the product feel like something rather than a default admin panel. IBM Plex
 * Sans carries the interface for a practical reason: applicants are worldwide,
 * and Plex has the widest script coverage of the faces that read well at 13px.
 * Plex Mono marks anything that is an identifier rather than prose.
 */
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display-loaded',
  display: 'swap',
  weight: ['500', '600', '700'],
});

const sans = IBM_Plex_Sans({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-sans-loaded',
  display: 'swap',
  weight: ['400', '500', '600'],
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-mono-loaded',
  display: 'swap',
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: 'Flow — study-abroad outreach',
  description:
    'Research every professor, programme, and scholarship on your list, judge the fit, and draft the message. For applicants anywhere, in any field.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfbfc' },
    { media: '(prefers-color-scheme: dark)', color: '#0c111a' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <ThemeProvider>
          <ToastProvider>
            <TooltipProvider>
              <AppShell>{children}</AppShell>
            </TooltipProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
