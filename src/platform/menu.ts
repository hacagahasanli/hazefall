/** Whether the main menu shows the disabled "Online · Coming soon" row: our own site does, a CrazyGames visitor never sees it (it says the real game is elsewhere). */
export const showsOnlineRow = (platformId: 'web' | 'crazygames', onlineOpen: boolean) => !onlineOpen && platformId !== 'crazygames';
