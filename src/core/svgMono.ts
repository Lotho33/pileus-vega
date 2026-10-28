// A plugin's SVG icon painted in one color, like pileus-player's
// SvgPicture with ColorFilter.mode(color, BlendMode.srcIn): every painted
// shape takes the text color, shapes and transparency stay. SvgXml's `color`
// alone only reaches `currentColor`, so an icon with its own colors (or a
// gradient) kept them.

const PAINT = /(\b(?:fill|stroke|stop-color|color)\s*=\s*)(["'])(?!\s*none\b)[^"']*\2/gi;
const STYLE_PAINT = /(\b(?:fill|stroke|stop-color|color)\s*:\s*)(?!\s*none\b)[^;"']+/gi;

export function monochromeSvg(xml: string): string {
  const out = xml
    .replace(PAINT, (_m, attr: string, q: string) => `${attr}${q}currentColor${q}`)
    .replace(STYLE_PAINT, (_m, prop: string) => `${prop}currentColor`);
  // Shapes with no fill of their own default to black: inherit instead.
  return out.replace(/<svg\b([^>]*)>/i, (m, attrs: string) =>
    /\bfill\s*=/.test(attrs) ? m : `<svg${attrs} fill="currentColor">`,
  );
}
