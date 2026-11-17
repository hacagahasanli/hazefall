import { Lobby } from '~/components/Lobby';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Play' };

const PlayPage = () => <Lobby />;

export default PlayPage;
