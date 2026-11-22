/**
 * What the browser says about this device, for `autoTier`. The portal's device type wins when it gives one; otherwise a
 * coarse pointer with a small screen means a phone. The GPU name comes from a throwaway WebGL context (where the browser shares it).
 */
import { deviceType } from '../../lib/device';

import type { DeviceFacts } from './quality';

let gpuName: string | undefined | null = null;

const gpu = (): string | undefined => {
  if (gpuName !== null) return gpuName;
  gpuName = undefined;
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpuName = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    /* no WebGL info: decide without it */
  }
  return gpuName;
};

export const deviceFacts = (portalDevice: DeviceFacts['device'] | null): DeviceFacts => {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const device = portalDevice ?? deviceType();
  return { device, cores: nav.hardwareConcurrency, memory: nav.deviceMemory, gpu: gpu(), ua: nav.userAgent };
};
