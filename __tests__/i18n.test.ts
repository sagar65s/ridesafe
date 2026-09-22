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

  it.each(['Dashboard','Payments','Trip','Trip history','Live location','Broadcast','Delete this maintenance log?'])('translates parent and driver label %s in both locales', label => {
    expect(translateLiteral(label,'ms')).not.toBe(label)
    expect(translateLiteral(label,'zh')).not.toBe(label)
    expect(translateLiteral(translateLiteral(label,'ms'),'en')).toBe(label)
  })

  it.each(['Trip active','Ready for next trip','No active trip','Confirm child boarded','Confirm child arrived home','Mark all read','OIL CHANGE','IN PROGRESS'])('translates a dynamic parent or driver state %s', label => {
    expect(translateLiteral(label,'ms')).not.toBe(label)
    expect(translateLiteral(label,'zh')).not.toBe(label)
  })
})
