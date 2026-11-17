import { Bungee, Chakra_Petch } from 'next/font/google';

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

const display = Bungee({ weight: '400', subsets: ['latin'], variable: '--font-bungee' });
const ui = Chakra_Petch({ weight: ['400', '500', '600', '700'], subsets: ['latin'], variable: '--font-chakra' });

export const metadata: Metadata = {
  title: { default: 'Last Commit Standing · Merge Conflict', template: '%s · Last Commit Standing' },
  description: 'Ten developers, one countryside, and the Deadline closing in. The last commit standing ships.',
  // Added to the iPhone home screen it opens full screen, with no browser bars.
  appleWebApp: { capable: true, title: 'Last Commit', statusBarStyle: 'black-translucent' },
};

/** Phones: edge to edge (the notch is handled with safe-area insets), and no pinch zoom mid-fight. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0a0d18',
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en" className={`${display.variable} ${ui.variable}`}>
    <body className="min-h-screen font-sans">{children}</body>
  </html>
);

export default RootLayout;
