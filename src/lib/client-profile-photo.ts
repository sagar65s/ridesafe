export async function prepareProfilePhoto(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    throw new Error('Choose a JPEG, PNG or WebP photo up to 5 MB')
  }
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Unable to read photo'))
    reader.readAsDataURL(file)
  })
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const item = new Image()
    item.onload = () => resolve(item)
    item.onerror = () => reject(new Error('Invalid photo'))
    item.src = source
  })
  const scale = Math.min(1, 512 / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Photo processing is unavailable')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const result = canvas.toDataURL('image/webp', 0.78)
  if (result.length > 800000) throw new Error('Photo is still too large; choose a smaller image')
  return result
}
