import {mycelium} from '../src/core/api';
import {downloadedIndex} from '../src/downloads/downloadedIndex';

describe('already downloaded', () => {
  beforeEach(() => {
    downloadedIndex.reset();
    mycelium.creds.profileId = 'prof';
    jest.spyOn(mycelium, 'listDownloads').mockResolvedValue({
      downloads: [
        {pluginId: 'p', mediaId: 'done', status: 'completed'},
        {pluginId: 'p', mediaId: 'coming', status: 'queued'},
        {pluginId: 'p', mediaId: 'failed', status: 'failed'},
      ],
    } as never);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    mycelium.creds.profileId = '';
  });

  test('completed or on its way counts, a failed one does not', async () => {
    await downloadedIndex.refresh();
    expect(downloadedIndex.has('p', 'done')).toBe(true);
    expect(downloadedIndex.has('p', 'coming')).toBe(true);
    expect(downloadedIndex.has('p', 'failed')).toBe(false);
    expect(downloadedIndex.has('other', 'done')).toBe(false);
  });

  test('another profile does not see them', async () => {
    await downloadedIndex.refresh();
    mycelium.creds.profileId = 'kid';
    expect(downloadedIndex.has('p', 'done')).toBe(false);
  });

  test('a request marks it at once', () => {
    downloadedIndex.markRequested('p', ['new']);
    expect(downloadedIndex.has('p', 'new')).toBe(true);
  });
});
