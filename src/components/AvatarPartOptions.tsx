import { useEffect, useRef } from 'react'
import { Check } from 'lucide-react'
import type { AvatarConfig } from '../lib/models'
import { AVATAR_CHOICES, avatarSwatchColor, DEFAULT_AVATAR, type AvatarChoice, type AvatarPartKey } from './Avatar'

function AvatarOptionRow({ choice, avatar, onSelect }: { choice: AvatarChoice; avatar: AvatarConfig; onSelect: (key: AvatarPartKey, value: string) => void }) {
  const optionsRef = useRef<HTMLDivElement>(null)
  const selectedValue = avatar.photoUrl ? '' : avatar[choice.key] ?? DEFAULT_AVATAR[choice.key]

  useEffect(() => {
    const container = optionsRef.current
    const selected = container?.querySelector<HTMLElement>('.is-selected')
    if (!container || !selected) return
    container.scrollLeft = Math.max(0, selected.offsetLeft - (container.clientWidth - selected.clientWidth) / 2)
  }, [selectedValue])

  return <div className="avatar-option-row">
    <span>{choice.label}</span>
    <div ref={optionsRef}>
      {choice.values.map((value) => {
        const selected = selectedValue === value
        return <button
          type="button"
          key={value}
          className={`swatch ${choice.previews ? 'swatch--part' : ''} swatch--${choice.key}-${value} ${selected ? 'is-selected' : ''}`}
          style={choice.previews ? undefined : { background: avatarSwatchColor(choice.key, value) }}
          onClick={() => onSelect(choice.key, value)}
          aria-label={`${choice.label}を${choice.previews?.[value] ?? value}にする`}
          aria-pressed={selected}
        >
          {choice.previews?.[value] ?? (selected && <Check size={14} />)}
        </button>
      })}
    </div>
  </div>
}

export function AvatarPartOptions({ avatar, className = '', onSelect }: { avatar: AvatarConfig; className?: string; onSelect: (key: AvatarPartKey, value: string) => void }) {
  return <div className={`avatar-options ${className}`.trim()}>
    {AVATAR_CHOICES.map((choice) => <AvatarOptionRow key={choice.key} choice={choice} avatar={avatar} onSelect={onSelect} />)}
  </div>
}
