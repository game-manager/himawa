import type { AvatarConfig } from '../lib/models'

type Props = { config: AvatarConfig; size?: 'small' | 'medium' | 'large'; status?: string | null }

const skinColors: Record<string, string> = { peach: '#f6c5a8', honey: '#d99c72', cocoa: '#9b6548', rose: '#efb0a6' }
const hairColors: Record<string, string> = { ink: '#2f2927', chestnut: '#755038', coral: '#dd6f62', violet: '#6f62a8' }
const outfitColors: Record<string, string> = { tomato: '#ff674d', mint: '#55c995', blue: '#5f83e6', yellow: '#f6c94d' }
const backgroundColors: Record<string, string> = { cream: '#fff0c2', pink: '#ffe0e2', sky: '#dff1ff', lilac: '#ebe3ff' }

export const DEFAULT_AVATAR: AvatarConfig = { skin: 'peach', hair: 'ink', hairStyle: 'soft', mouth: 'smile', hat: 'none', outfit: 'tomato', background: 'cream' }
export type AvatarPartKey = 'skin' | 'hair' | 'hairStyle' | 'mouth' | 'hat' | 'outfit' | 'background'
export const AVATAR_CHOICES: Array<{ key: AvatarPartKey; label: string; values: string[]; previews?: Record<string, string> }> = [
  { key: 'skin', label: '肌', values: ['peach', 'honey', 'cocoa', 'rose'] },
  { key: 'hair', label: '髪色', values: ['ink', 'chestnut', 'coral', 'violet'] },
  { key: 'hairStyle', label: '髪型', values: ['soft', 'bob', 'short', 'wave'], previews: { soft: 'ふわ', bob: 'ボブ', short: '短め', wave: 'ウェーブ' } },
  { key: 'mouth', label: '口', values: ['smile', 'open', 'grin', 'calm'], previews: { smile: '⌣', open: '○', grin: '▽', calm: '―' } },
  { key: 'hat', label: '帽子', values: ['none', 'cap', 'beanie', 'flower'], previews: { none: 'なし', cap: 'キャップ', beanie: 'ニット', flower: '花' } },
  { key: 'outfit', label: '服', values: ['tomato', 'mint', 'blue', 'yellow'] },
  { key: 'background', label: '背景', values: ['cream', 'pink', 'sky', 'lilac'] },
]

export function randomAvatar(): AvatarConfig {
  return Object.fromEntries(
    AVATAR_CHOICES.map((choice) => [choice.key, choice.values[Math.floor(Math.random() * choice.values.length)]]),
  ) as AvatarConfig
}

export function Avatar({ config, size = 'medium', status }: Props) {
  const hairStyle = ['soft', 'bob', 'short', 'wave'].includes(config.hairStyle ?? '') ? config.hairStyle : 'soft'
  const mouth = ['smile', 'open', 'grin', 'calm'].includes(config.mouth ?? '') ? config.mouth : 'smile'
  const hat = ['none', 'cap', 'beanie', 'flower'].includes(config.hat ?? '') ? config.hat : 'none'

  return (
    <div className={`avatar avatar--${size}`} aria-label="アバター">
      <div className="avatar__canvas" style={{ background: backgroundColors[config.background] ?? backgroundColors.cream }}>
        {config.photoUrl ? <img className="avatar__photo" src={config.photoUrl} alt="" /> : <>
          <div className="avatar__body" style={{ background: outfitColors[config.outfit] ?? outfitColors.tomato }} />
          <div className="avatar__neck" style={{ background: skinColors[config.skin] ?? skinColors.peach }} />
          <div className="avatar__head" style={{ background: skinColors[config.skin] ?? skinColors.peach }}>
            <div className={`avatar__hair avatar__hair--${hairStyle}`} style={{ background: hairColors[config.hair] ?? hairColors.ink }} />
            <span className="avatar__eye avatar__eye--left" />
            <span className="avatar__eye avatar__eye--right" />
            <span className={`avatar__mouth avatar__mouth--${mouth}`} />
            {hat !== 'none' && <span className={`avatar__hat avatar__hat--${hat}`} aria-hidden="true" />}
          </div>
        </>}
      </div>
      {status && <span className="avatar__status">{status}</span>}
    </div>
  )
}
