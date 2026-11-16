import {fontFamilyFor} from '../src/components/Text';

describe('Text font', () => {
  test('the weight picks the DM Sans file', () => {
    expect(fontFamilyFor(undefined)).toBe('DMSans-Regular');
    expect(fontFamilyFor('normal')).toBe('DMSans-Regular');
    expect(fontFamilyFor('500')).toBe('DMSans-Medium');
    expect(fontFamilyFor('600')).toBe('DMSans-SemiBold');
    expect(fontFamilyFor('700')).toBe('DMSans-Bold');
    expect(fontFamilyFor('bold')).toBe('DMSans-Bold');
    expect(fontFamilyFor('800')).toBe('DMSans-Bold');
    expect(fontFamilyFor('900')).toBe('DMSans-Bold');
  });
});
