'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { track } from '@/lib/analytics/client';
import { normalisePath } from '@/lib/analytics/events';

/** Last path counted, kept outside React so a Strict Mode re-run is not a second view. */
let lastTracked: string | null = null;

/** Counts one page view per screen opened. Renders nothing. */
export function AnalyticsTracker() {
  const pathname = usePathname();

  React.useEffect(() => {
    if (!pathname || pathname === lastTracked) return;
    lastTracked = pathname;
    track('page_view', { name: normalisePath(pathname) });
  }, [pathname]);

  return null;
}
