// Logo strings arrive encoded as "url|norm_w|norm_h|dark" (legacy
// "url|w|h"), norm dims from mycelium's image.analyze_logo. Port of the
// helpers in pileus-player lib/features/media/presentation/details_screen.dart.

export function logoUrlOnly(encoded: string): string {
  const parts = encoded.split('|');
  if (parts.length >= 4) {
    return parts.slice(0, parts.length - 3).join('|');
  }
  if (parts.length === 3) {
    return parts.slice(0, parts.length - 2).join('|');
  }
  return encoded;
}

export function logoDark(encoded: string): boolean {
  const parts = encoded.split('|');
  return parts.length >= 4 && parts[parts.length - 1] === '1';
}

export function logoRenderSize(
  encoded: string,
  targetW: number,
  maxH: number,
  maxW: number,
): {w: number; h: number} {
  const parts = encoded.split('|');
  let srcW = 0;
  let srcH = 0;
  if (parts.length >= 4) {
    srcW = Number(parts[parts.length - 3]) || 0;
    srcH = Number(parts[parts.length - 2]) || 0;
  } else if (parts.length === 3) {
    srcW = Number(parts[1]) || 0;
    srcH = Number(parts[2]) || 0;
  }
  let w = targetW;
  let h = srcW > 0 && srcH > 0 ? (targetW * srcH) / srcW : targetW / 3;
  if (h > maxH) {
    w = (w * maxH) / h;
    h = maxH;
  }
  if (w > maxW) {
    h = (h * maxW) / w;
    w = maxW;
  }
  // Ultra-wide logos must not shrink to a thin line.
  h = Math.max(h, maxH * 0.3);
  return {w, h};
}
