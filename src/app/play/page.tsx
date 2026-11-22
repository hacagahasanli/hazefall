import { Lobby } from '~/components/Lobby';
import { TelemetryInit } from '~/components/TelemetryInit';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Play' };

// TelemetryInit comes first so counting has started before the lobby reports that it loaded. Site only: the portal never renders this page.
const PlayPage = () => (
  <>
    <TelemetryInit />
    <Lobby />
  </>
);

export default PlayPage;
