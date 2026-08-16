import type { CSSProperties } from 'react'
import type { AvatarConfig } from '../lib/models'

type Props = { config: AvatarConfig; size?: 'small' | 'medium' | 'large'; status?: string | null }

const skinColors: Record<string, string> = { porcelain: '#f9d8c5', peach: '#f6c5a8', rose: '#efb0a6', sand: '#e8b58d', honey: '#d99c72', amber: '#c88459', bronze: '#ad724f', cocoa: '#9b6548', mahogany: '#754735', ebony: '#4e3028' }
const hairColors: Record<string, string> = { ink: '#2f2927', chestnut: '#755038', auburn: '#9e4c34', blonde: '#d9ad62', ash: '#8b847c', silver: '#c6c8ce', coral: '#dd6f62', pink: '#d978a1', violet: '#6f62a8', navy: '#34466f' }
const outfitColors: Record<string, string> = { tomato: '#ff674d', mint: '#55c995', blue: '#5f83e6', yellow: '#f6c94d', purple: '#876bd0', navy: '#40547c', pink: '#e884a6', green: '#3ca678', cream: '#e8d9bd', black: '#3d3a40' }
const backgroundColors: Record<string, string> = { cream: '#fff0c2', pink: '#ffe0e2', sky: '#dff1ff', lilac: '#ebe3ff', mint: '#daf4e8', orange: '#ffe1c3', navy: '#ced8ef', gray: '#e7e4df', peach: '#ffd8c9', aqua: '#d6f3f3' }

const hairStyles = ['soft', 'bob', 'short', 'wave', 'center', 'spiky', 'bun', 'ponytail', 'curly', 'long']
const mouths = ['smile', 'open', 'grin', 'calm', 'laugh', 'pout', 'smirk', 'tongue', 'tiny', 'cheer']
const hats = ['none', 'cap', 'beanie', 'flower', 'bucket', 'beret', 'headband', 'crown', 'ribbon', 'hood']

export const DEFAULT_AVATAR: AvatarConfig = { skin: 'peach', hair: 'ink', hairStyle: 'soft', mouth: 'smile', hat: 'none', outfit: 'tomato', background: 'cream' }
export type AvatarPartKey = 'skin' | 'hair' | 'hairStyle' | 'mouth' | 'hat' | 'outfit' | 'background'
export type AvatarChoice = { key: AvatarPartKey; label: string; values: string[]; previews?: Record<string, string> }
const avatarColorMaps: Partial<Record<AvatarPartKey, Record<string, string>>> = { skin: skinColors, hair: hairColors, outfit: outfitColors, background: backgroundColors }
export function avatarSwatchColor(key: AvatarPartKey, value: string) { return avatarColorMaps[key]?.[value] }
export function avatarPartAsset(key: AvatarPartKey, value: string) {
  const folders: Partial<Record<AvatarPartKey, string>> = { hairStyle: 'hair', mouth: 'mouth', hat: 'accessory', outfit: 'outfit' }
  const folder = folders[key]
  if (!folder || (key === 'hat' && value === 'none')) return null
  return `${import.meta.env.BASE_URL}avatar/generated/${folder}/${value}.png`
}
export const AVATAR_CHOICES: AvatarChoice[] = [
  { key: 'skin', label: '肌', values: ['porcelain', 'peach', 'rose', 'sand', 'honey', 'amber', 'bronze', 'cocoa', 'mahogany', 'ebony'] },
  { key: 'hair', label: '髪色', values: ['ink', 'chestnut', 'auburn', 'blonde', 'ash', 'silver', 'coral', 'pink', 'violet', 'navy'] },
  { key: 'hairStyle', label: '髪型', values: hairStyles, previews: { soft: 'ふわ', bob: 'ボブ', short: '短め', wave: 'ウェーブ', center: 'センター', spiky: 'ツンツン', bun: 'お団子', ponytail: 'ポニー', curly: 'カーリー', long: 'ロング' } },
  { key: 'mouth', label: '口', values: mouths, previews: { smile: '⌣', open: '○', grin: '▽', calm: '―', laugh: 'D', pout: '●', smirk: '⌁', tongue: 'ᵕ', tiny: '・', cheer: 'ᴗ' } },
  { key: 'hat', label: '帽子', values: hats, previews: { none: 'なし', cap: 'キャップ', beanie: 'ニット', flower: '花', bucket: 'バケット', beret: 'ベレー', headband: 'バンド', crown: '王冠', ribbon: 'リボン', hood: 'フード' } },
  { key: 'outfit', label: '服', values: ['tomato', 'mint', 'blue', 'yellow', 'purple', 'navy', 'pink', 'green', 'cream', 'black'] },
  { key: 'background', label: '背景', values: ['cream', 'pink', 'sky', 'lilac', 'mint', 'orange', 'navy', 'gray', 'peach', 'aqua'] },
]

export function randomAvatar(): AvatarConfig {
  return Object.fromEntries(
    AVATAR_CHOICES.map((choice) => [choice.key, choice.values[Math.floor(Math.random() * choice.values.length)]]),
  ) as AvatarConfig
}

export function Avatar({ config, size = 'medium', status }: Props) {
  const configuredHairStyle = config.hairStyle ?? ''
  const configuredMouth = config.mouth ?? ''
  const configuredHat = config.hat ?? ''
  const hairStyle = hairStyles.includes(configuredHairStyle) ? configuredHairStyle : 'soft'
  const mouth = mouths.includes(configuredMouth) ? configuredMouth : 'smile'
  const hat = hats.includes(configuredHat) ? configuredHat : 'none'
  const hairAsset = avatarPartAsset('hairStyle', hairStyle)!
  const hairMaskStyle: CSSProperties = {
    background: hairColors[config.hair] ?? hairColors.ink,
    maskImage: `url("${hairAsset}")`,
    WebkitMaskImage: `url("${hairAsset}")`,
  }

  return (
    <div className={`avatar avatar--${size}`} aria-label="アバター">
      <div className="avatar__canvas" style={{ background: backgroundColors[config.background] ?? backgroundColors.cream }}>
        {config.photoUrl ? <img className="avatar__photo" src={config.photoUrl} alt="" /> : <>
          <div className="avatar__body" style={{ background: outfitColors[config.outfit] ?? outfitColors.tomato }} />
          <img className="avatar__generated-outfit" src={avatarPartAsset('outfit', config.outfit) ?? ''} alt="" aria-hidden="true" />
          <div className="avatar__neck" style={{ background: skinColors[config.skin] ?? skinColors.peach }} />
          <div className="avatar__head" style={{ background: skinColors[config.skin] ?? skinColors.peach }}>
            <span className="avatar__generated-hair" style={hairMaskStyle} aria-hidden="true" />
            <span className="avatar__eye avatar__eye--left" />
            <span className="avatar__eye avatar__eye--right" />
            <img className="avatar__generated-mouth" src={avatarPartAsset('mouth', mouth) ?? ''} alt="" aria-hidden="true" />
            {hat !== 'none' && <img className={`avatar__generated-accessory avatar__generated-accessory--${hat}`} src={avatarPartAsset('hat', hat) ?? ''} alt="" aria-hidden="true" />}
          </div>
        </>}
      </div>
      {status && <span className="avatar__status">{status}</span>}
    </div>
  )
}
