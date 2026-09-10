export function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value)

  return `"${text.replace(/"/g, '""')}"`
}