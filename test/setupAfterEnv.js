// The profiling loop (core/perf) starts on the first sample, e.g. any gRPC
// call, and metrics save a few seconds later: stop both before the
// environment goes away.
afterAll(() => {
  require('../src/core/perf')._internal.stop();
  require('../src/core/metrics')._cancelSave();
});
