import {monochromeSvg} from '../src/core/svgMono';

describe('monochromeSvg', () => {
  it('paints every color with currentColor, keeps none', () => {
    const out = monochromeSvg(
      '<svg viewBox="0 0 24 24"><path fill="#e11d48" stroke=\'red\' d="M0 0"/><rect fill="none" style="fill:#fff;opacity:.5"/><stop stop-color="#000"/></svg>',
    );
    expect(out).toContain('<svg viewBox="0 0 24 24" fill="currentColor">');
    expect(out).toContain('fill="currentColor" stroke=\'currentColor\'');
    expect(out).toContain('fill="none"');
    expect(out).toContain('style="fill:currentColor;opacity:.5"');
    expect(out).toContain('stop-color="currentColor"');
    expect(out).not.toMatch(/#e11d48|red|#fff|#000/);
  });

  it('leaves an explicit root fill alone', () => {
    expect(monochromeSvg('<svg fill="none"><path/></svg>')).toBe('<svg fill="none"><path/></svg>');
  });
});
