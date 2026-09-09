import { translateLiteral } from '@/i18n/literal'

describe('legacy full-site translation compatibility', () => {
  it('translates a legacy admin label to Malay and Chinese', () => {
    expect(translateLiteral('Add Bus', 'ms')).toBe('Tambah Bas')
    expect(translateLiteral('Add Bus', 'zh')).toBe('添加校车')
  })

  it('can switch directly between translated languages and back to English', () => {
    expect(translateLiteral('Tambah Bas', 'zh')).toBe('添加校车')
    expect(translateLiteral('添加校车', 'en')).toBe('Add Bus')
  })

  it('preserves surrounding whitespace in JSX text nodes', () => {
    expect(translateLiteral('  Cancel\n', 'ms')).toBe('  Batal\n')
  })
})
