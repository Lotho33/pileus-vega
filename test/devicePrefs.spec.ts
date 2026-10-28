jest.mock('@amazon-devices/react-native-async-storage__async-storage', () => ({}));
import {sanitize} from '../src/core/devicePrefs';

describe('device prefs', () => {
  it('defaults and clamps like the Flutter settings', () => {
    expect(sanitize(undefined)).toEqual({maxVideoHeight: 0, vodBufferSec: 60, liveBufferSec: 20});
    expect(sanitize({maxVideoHeight: 999, vodBufferSec: 500, liveBufferSec: 1})).toEqual({
      maxVideoHeight: 0,
      vodBufferSec: 180,
      liveBufferSec: 6,
    });
    expect(sanitize({maxVideoHeight: 720}).maxVideoHeight).toBe(720);
  });
});
