/**
 * Real loading progress, for the loading screens (no fake bars): every model file the game asks for is counted when it is
 * requested and when it arrives, and the portal page's boot screen (portal/index.html) is told about each real milestone.
 * Nothing here draws; it only counts and forwards.
 */

export interface LoadCount {
  /** Files asked for since the page opened. */
  total: number;
  /** Of those, arrived (or failed: a failed file never holds a screen up). */
  done: number;
}

const count: LoadCount = { total: 0, done: 0 };
const listeners = new Set<(c: LoadCount) => void>();
const emit = () => listeners.forEach((fn) => fn({ ...count }));

/** Counts one file load: call it with the promise of the request. */
export const trackLoad = <T,>(p: Promise<T>): Promise<T> => {
  count.total++;
  emit();
  return p.finally(() => {
    count.done++;
    emit();
  });
};

export const loadCount = (): LoadCount => ({ ...count });

/** Listens for files asked for and arrived; returns the way to stop listening. */
export const onLoadCount = (fn: (c: LoadCount) => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** The boot screen's hooks (portal/index.html defines them; on the site there is no boot screen and these do nothing). */
interface BootApi {
  /**
   * A finished step: the bar's checkpoint moves to `at` (0..1), and `next` says where the step after it will land, so the
   * bar may ease part of the way there meanwhile (never past it). The screen's one progress value comes from
   * src/lib/bootProgress.ts: it never goes back and stays under 100 % until `done`.
   */
  step: (text: string, at: number, next?: number) => void;
  /** Progress inside the current step: checkpoint `at`, a live line (e.g. "Loading models 12 / 28"), and the next one. */
  progress: (at: number, live?: string, next?: number) => void;
  /** The menu is up underneath: from now on any key or tap skips the rest. */
  ready: () => void;
  /** Everything is in: the number runs on to 100 %, then the boot screen plays its exit and goes. */
  done: () => void;
  /** True until the boot screen has gone. */
  active: () => boolean;
  /** Called once when it has gone (at once if it already has). */
  onGone: (fn: () => void) => void;
}

const api = (): BootApi | undefined => (typeof window === 'undefined' ? undefined : (window as unknown as { __lcsBoot?: BootApi }).__lcsBoot);

export const boot = {
  step: (text: string, at: number, next?: number) => api()?.step(text, at, next),
  progress: (at: number, live?: string, next?: number) => api()?.progress(at, live, next),
  ready: () => api()?.ready(),
  done: () => api()?.done(),
  active: () => api()?.active() ?? false,
  onGone: (fn: () => void) => {
    const a = api();
    if (a) a.onGone(fn);
    else fn();
  },
};
