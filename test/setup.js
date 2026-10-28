// AsyncStorage has no native module under jest: an in-memory stand-in for
// every spec (a spec's own jest.mock still wins).
jest.mock('@amazon-devices/react-native-async-storage__async-storage', () => {
  const store = new Map();
  return {
    getItem: jest.fn(async k => (store.has(k) ? store.get(k) : null)),
    setItem: jest.fn(async (k, v) => void store.set(k, v)),
    removeItem: jest.fn(async k => void store.delete(k)),
  };
});
