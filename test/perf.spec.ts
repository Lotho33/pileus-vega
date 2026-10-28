import * as perf from '../src/core/perf';

afterAll(() => perf._internal.stop());

describe('perf summary', () => {
  beforeEach(() => perf._internal.reset());

  it('one line per metric with percentiles and failures', () => {
    [100, 200, 300, 400].forEach(ms => perf.sample('rpc GetCatalog', ms));
    perf.failure('rpc GetCatalog');
    perf.sample('key→focus', 40);
    expect(perf.summaryLines()).toEqual([
      'key→focus n=1 p50=40 p95=40 max=40',
      'rpc GetCatalog n=4 p50=200 p95=300 max=400 err=1',
    ]);
  });

  it('a failure without samples still shows', () => {
    perf.failure('rpc Search');
    expect(perf.summaryLines()).toEqual(['rpc Search n=0 err=1']);
  });
});

describe('metrics (Tempi di risposta)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const metrics = require('../src/core/metrics');
  beforeEach(() => metrics.clearMetrics());

  it('keeps tracked waits only, with median, last and worst', () => {
    [300, 100, 200].forEach(ms => perf.sample('play first frame', ms));
    perf.sample('rpc ListDownloads', 50);
    const [s] = metrics.metricSummaries();
    expect(metrics.metricSummaries()).toHaveLength(1);
    expect(s.metric.label).toBe('Play → primo frame');
    expect([s.median, s.last, s.worst, s.count]).toEqual([200, 200, 300, 3]);
  });

  it('slow frames per screen as a share', () => {
    metrics.recordFrames('home', 100, 5);
    metrics.recordFrames('home', 100, 15);
    expect(metrics.fluiditySummaries()).toEqual([{label: 'Home', slowPct: 10, frames: 200}]);
  });

  it('formats milliseconds and seconds', () => {
    expect(metrics.fmtMs(850)).toBe('850 ms');
    expect(metrics.fmtMs(2340)).toBe('2.3 s');
  });
});
