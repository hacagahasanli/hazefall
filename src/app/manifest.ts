import type { MetadataRoute } from 'next';

/**
 * Installable as an app. On iPhone that is the only way to play without the browser bars:
 * Share -> Add to Home Screen, then open Last Commit Standing from the home screen.
 */
const manifest = (): MetadataRoute.Manifest => ({
  name: 'Last Commit Standing · Nalbaki Games',
  short_name: 'Last Commit',
  description: 'A battle royale for developers who never agree. The last one standing gets to merge.',
  start_url: '/',
  display: 'fullscreen',
  orientation: 'landscape',
  background_color: '#16110E',
  theme_color: '#0C1A17',
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
});

export default manifest;
