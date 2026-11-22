'use client';

import { useEffect } from 'react';

import { init } from '~/lib/telemetry';

/**
 * Starts anonymous visit counting on our own site's /play page, and only when NEXT_PUBLIC_STATS_URL is set (so local builds
 * never send). Only the Next site renders this; the portal build has its own entry (portal/main.tsx) that never imports it,
 * so portal builds send nothing and carry no stats address.
 */
export const TelemetryInit = () => {
  useEffect(() => {
    const endpoint = process.env.NEXT_PUBLIC_STATS_URL;
    if (endpoint) init({ endpoint, game: 'lcs', build: process.env.NEXT_PUBLIC_BUILD || 'site' });
  }, []);
  return null;
};
