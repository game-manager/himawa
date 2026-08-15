import type { AvatarConfig } from './models'

const MAX_SOURCE_BYTES = 10 * 1024 * 1024
export const MAX_AVATAR_DATA_LENGTH = 120_000
const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function avatarImageError(file: Pick<File, 'size' | 'type'>) {
  if (!acceptedTypes.has(file.type)) return 'JPEG・PNG・WebPの画像を選んでください。'
  if (file.size > MAX_SOURCE_BYTES) return '画像は10MB以下のものを選んでください。'
  return ''
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)
    image.decoding = 'async'
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('画像を読み込めませんでした。'))
    }
    image.src = objectUrl
  })
}

export async function prepareAvatarPhoto(file: File) {
  const validationError = avatarImageError(file)
  if (validationError) throw new Error(validationError)
  const image = await loadImage(file)
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight)
  if (!sourceSize) throw new Error('画像を読み込めませんでした。')
  const sourceX = (image.naturalWidth - sourceSize) / 2
  const sourceY = (image.naturalHeight - sourceSize) / 2

  for (const [size, quality] of [[256, 0.82], [224, 0.7], [192, 0.6]] as const) {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    if (!context) throw new Error('この端末では画像を加工できません。')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, size, size)
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size)
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    if (dataUrl.length <= MAX_AVATAR_DATA_LENGTH) return dataUrl
  }
  throw new Error('画像を小さくできませんでした。別の画像を選んでください。')
}

export function avatarWithoutPhoto(avatar: AvatarConfig): AvatarConfig {
  const { photoUrl: _photoUrl, ...parts } = avatar
  return parts
}
