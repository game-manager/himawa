import type { AvatarConfig } from '../lib/models'

type Props = { config: AvatarConfig; size?: 'small' | 'medium' | 'large'; status?: string | null }

const skinColors: Record<string, string> = { peach: '#f6c5a8', honey: '#d99c72', cocoa: '#9b6548', rose: '#efb0a6' }
const hairColors: Record<string, string> = { ink: '#2f2927', chestnut: '#755038', coral: '#dd6f62', violet: '#6f62a8' }
const outfitColors: Record<string, string> = { tomato: '#ff674d', mint: '#55c995', blue: '#5f83e6', yellow: '#f6c94d' }
const backgroundColors: Record<string, string> = { cream: '#fff0c2', pink: '#ffe0e2', sky: '#dff1ff', lilac: '#ebe3ff' }

export const DEFAULT_AVATAR: AvatarConfig = { skin: 'peach', hair: 'ink', outfit: 'tomato', background: 'cream' }

export function Avatar({ config, size = 'medium', status }: Props) {
  return (
    <div className={`avatar avatar--${size}`} aria-label="アバター">
      <div className="avatar__canvas" style={{ background: backgroundColors[config.background] ?? backgroundColors.cream }}>
        <div className="avatar__body" style={{ background: outfitColors[config.outfit] ?? outfitColors.tomato }} />
        <div className="avatar__neck" style={{ background: skinColors[config.skin] ?? skinColors.peach }} />
        <div className="avatar__head" style={{ background: skinColors[config.skin] ?? skinColors.peach }}>
          <div className="avatar__hair" style={{ background: hairColors[config.hair] ?? hairColors.ink }} />
          <span className="avatar__eye avatar__eye--left" />
          <span className="avatar__eye avatar__eye--right" />
          <span className="avatar__smile" />
        </div>
      </div>
      {status && <span className="avatar__status">{status}</span>}
    </div>
  )
}
