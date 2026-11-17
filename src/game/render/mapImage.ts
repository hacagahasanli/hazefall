import { MAP, SIZE } from '../sim/constants';

/** The colour of a map tile on the minimap and the menu map. */
export const tileColor = (t: string) =>
  t === '#' || t === 'w' ? '#e8dcc4'
    : t === 'o' ? '#3f7fb5'
      : t === 'h' ? '#9aa84a'
        : t === 'v' ? '#9aa0ab'
          : t === 'd' ? '#9a7048'
            : t === '.' || t === 'l' || t === 'u' ? '#b89a72'
              : t === 't' ? '#2f6a32'
                : t === 'b' ? '#4f9a48'
                  : t === 'c' ? '#c9c06a'
                    : t === 'k' ? '#8a8a8a'
                      : t === 'a' ? '#4a4f5e'
                        : t === 'p' ? '#a8865a'
                          : t === 'f' ? '#7a5a3a'
                            : '#5a9a50';

/** The whole map drawn tile by tile, `px` pixels per tile, on an offscreen canvas. */
export const paintMapImage = (px: number) => {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE * px;
  const g = c.getContext('2d')!;
  for (let ty = 0; ty < SIZE; ty++) {
    for (let tx = 0; tx < SIZE; tx++) {
      g.fillStyle = tileColor(MAP[ty][tx]);
      g.fillRect(tx * px, ty * px, px, px);
    }
  }
  return c;
};
