import {DownloadInfo} from '../src/gen/media';
import {
  downloadStatusLabel,
  formatBytes,
  formatEta,
  isCancellable,
  qualityBelowUsualWarning,
  retentionLabel,
} from '../src/downloads/format';

const info = (o: Partial<DownloadInfo>) => ({...DownloadInfo.fromPartial({}), ...o});

describe('download labels', () => {
  it('formats sizes and ETAs like the Flutter app', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(3.2 * 1024 ** 3)).toBe('3.2 GB');
    expect(formatBytes(150 * 1024 ** 2)).toBe('150 MB');
    expect(formatEta(1000, 100)).toBe('~10 s');
    expect(formatEta(600000, 100)).toBe('~1 h 40min');
    expect(formatEta(1000, 0)).toBe('');
  });

  it('labels status, retention and quality warnings', () => {
    expect(downloadStatusLabel(info({status: 'running', progress: 0.426}))).toBe('Preparazione 43%');
    expect(downloadStatusLabel(info({status: 'failed', error: 'boom'}))).toBe('boom');
    expect(isCancellable(info({status: 'paused'}))).toBe(true);
    expect(isCancellable(info({status: 'completed'}))).toBe(false);
    expect(retentionLabel(1)).toBe('Il file resta sul server per 1 giorno');
    expect(qualityBelowUsualWarning(true, 1080, 720)).toBe('Ora il massimo è 720p, di solito 1080p: conviene scaricare più tardi');
    expect(qualityBelowUsualWarning(false, 1080, 720)).toBe('');
  });
});
