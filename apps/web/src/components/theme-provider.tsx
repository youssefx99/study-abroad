'use client';

import { ThemeProvider as NextThemeProvider } from 'next-themes';

/**
 * Theme is stored per browser and defaults to the operating system setting.
 * `disableTransitionOnChange` stops every colour on the page animating at once
 * when the theme flips, which reads as a glitch rather than a transition.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemeProvider>
  );
}
