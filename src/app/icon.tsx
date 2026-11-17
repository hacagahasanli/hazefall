import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

/** The app icon: a gold merge mark on the night ink, drawn at build time. */
const Icon = () =>
  new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0d18' }}>
        <svg width="360" height="360" viewBox="0 0 24 24" fill="none" stroke="#ffd23f" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="6" cy="5" r="2.4" />
          <circle cx="6" cy="19" r="2.4" />
          <circle cx="18" cy="12" r="2.4" />
          <path d="M6 7.4v9.2M6 9c0 3 3 3 9.6 3" />
        </svg>
      </div>
    ),
    size,
  );

export default Icon;
