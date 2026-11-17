import type { MetadataRoute } from 'next';

/**
 * Installable as an app. On iPhone that is the only way to play without the browser bars:
 * Share -> Add to Home Screen, then open Last Commit Standing from the home screen.
 */
const manifest = (): MetadataRoute.Manifest => ({
  name: 'Last Commit Standing · Merge Conflict',
  short_name: 'Last Commit',
  description: 'A battle royale for developers who never agree. The last one standing gets to merge.',
  start_url: '/',
  display: 'fullscreen',
  orientation: 'landscape',
  background_color: '#0a0d18',
  theme_color: '#0a0d18',
  icons: [
    { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
  ],
});

export default manifest;
