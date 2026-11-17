import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** The home-screen icon on iPhone: a gold merge mark on the night ink, drawn at build time. */
const AppleIcon = () =>
  new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0d18' }}>
        <svg width="128" height="128" viewBox="0 0 24 24" fill="none" stroke="#ffd23f" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="6" cy="5" r="2.4" />
          <circle cx="6" cy="19" r="2.4" />
          <circle cx="18" cy="12" r="2.4" />
          <path d="M6 7.4v9.2M6 9c0 3 3 3 9.6 3" />
        </svg>
      </div>
    ),
    size,
  );

export default AppleIcon;
