'use client';

import * as React from 'react';
import { isOptedOut, setOptedOut } from '@/lib/analytics/client';
import { SwitchRow } from '@/components/ui/primitives';

/** Keeps the operator's own testing out of the numbers they are reading. */
export function ExcludeToggle() {
  const [excluded, setExcluded] = React.useState(false);

  // Browser storage is unknown to the server render, so it is read after mount.
  React.useEffect(() => setExcluded(isOptedOut()), []);

  return (
    <SwitchRow
      label="Don't count this browser"
      hint="Turn this on in every browser you use Flow from yourself, so your own testing and token spend stay out of these numbers."
      checked={excluded}
      onCheckedChange={(value) => {
        setOptedOut(value);
        setExcluded(value);
      }}
    />
  );
}
