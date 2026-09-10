import {csvCell} from '@/lib/csv'
test('CSV quotes delimiters and quotes correctly',()=>{expect(csvCell('A, "B"')).toBe('"A, ""B"""')})
test.each(['=HYPERLINK("https://example.com")','+60123456789','  @SUM(1,2)'])('CSV does not execute imported user values: %s',value=>{expect(csvCell(value).startsWith('"\'')).toBe(true)})
