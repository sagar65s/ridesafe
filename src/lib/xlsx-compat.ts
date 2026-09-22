import JSZip from 'jszip'

// Bundled template workbooks use the legal OOXML x: element prefix. ExcelJS
// only recognizes default-namespace element names; normalize a bounded copy
// before handing it to ExcelJS. Ordinary Excel files are left unchanged.
export async function excelJsCompatibleXlsx(bytes: Buffer): Promise<Buffer> {
  const archive = await JSZip.loadAsync(bytes, { checkCRC32: true })
  const workbook = archive.file('xl/workbook.xml')
  if (!workbook) throw new Error('Invalid Excel workbook: workbook.xml is missing')
  const xml = await workbook.async('string')
  if (!/<x:workbook\b/.test(xml)) return bytes
  for (const [name, entry] of Object.entries(archive.files)) {
    if (!/^xl\/(?:workbook\.xml|worksheets\/[^/]+\.xml|styles\.xml|sharedStrings\.xml|tables\/[^/]+\.xml)$/.test(name) || entry.dir) continue
    const source = await entry.async('string')
    if (!/xmlns:x=/.test(source)) continue
    let normalized = source.replace(/<(\/?)x:/g, '<$1').replace(/xmlns:x=/g, 'xmlns=')
    // The templates' visual Excel tables are not part of their import data.
    // Their relationship descriptors lack fields ExcelJS requires when loading.
    if (/^xl\/worksheets\/[^/]+\.xml$/.test(name)) normalized = normalized.replace(/<tableParts\b[^>]*>[\s\S]*?<\/tableParts>/g, '')
    archive.file(name, normalized)
  }
  return archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
