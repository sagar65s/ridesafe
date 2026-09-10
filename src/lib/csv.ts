// Quote values correctly and prevent spreadsheet formula injection from user content.
export function csvCell(value: string | number): string {
  let text=String(value)
  if (/^[\s]*[=+@-]/.test(text)) text="'"+text
  return `"${text.replaceAll('"','""')}"`
}
