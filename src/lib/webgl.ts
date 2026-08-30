/**
 * MapLibre needs WebGL2 and throws during construction without it. Probe first
 * so we can show something useful instead of a dead canvas — this is a real
 * case: hardware acceleration switched off, VMs, remote desktops, and locked
 * down corporate profiles all land here.
 */
export function hasWebGL2(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}
