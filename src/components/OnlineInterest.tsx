'use client';

import { useEffect, useState } from 'react';

import { track } from '~/lib/telemetry';

const KEY = 'lcs:online-interest';

/**
 * Site only (the lobby renders it; the portal build never imports it). While online play is not open, one tap says "I want
 * this" and is counted once per browser. No email, no account: the tap sends one anonymous `online_interest` event.
 */
export const OnlineInterest = () => {
  const [said, setSaid] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(KEY)) setSaid(true);
    } catch {
      /* no storage: the button simply shows again next visit */
    }
  }, []);
  if (said)
    return (
      <p role="status" className="px-2 text-sm font-semibold text-green">
        Thanks, we&apos;ll count you in
      </p>
    );
  return (
    <button
      type="button"
      onClick={() => {
        track('online_interest', { action: 'notify' });
        try {
          window.localStorage.setItem(KEY, '1');
        } catch {
          /* ignore */
        }
        setSaid(true);
      }}
      className="panel-cut border border-gold/40 bg-gold/10 px-4 py-3 text-left text-sm font-semibold text-gold transition hover:bg-gold hover:text-ink-deep"
    >
      Online is coming &mdash; tell me when
    </button>
  );
};
