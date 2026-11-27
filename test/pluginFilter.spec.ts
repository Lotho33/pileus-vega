jest.mock('@amazon-devices/react-native-async-storage__async-storage', () => ({}));

import {pluginChoices} from '../src/core/pluginFilter';

describe('pluginChoices', () => {
  const order = ['zeta', 'alpha', 'mid'];
  const hidden = new Set(['hidden']);

  it('follows the side menu order, unknown ones last by id', () => {
    expect(pluginChoices(['alpha', 'x2', 'zeta', 'x1'], order, hidden)).toEqual(['zeta', 'alpha', 'x1', 'x2']);
  });

  it('leaves hidden plugins out, remembered or not', () => {
    expect(pluginChoices(['hidden', 'alpha'], order, hidden)).toEqual(['alpha']);
    expect(pluginChoices(['alpha'], order, hidden, 'hidden')).toEqual(['alpha']);
  });

  it('keeps the remembered plugin with nothing of it', () => {
    expect(pluginChoices(['alpha'], order, hidden, 'zeta')).toEqual(['zeta', 'alpha']);
  });
});
