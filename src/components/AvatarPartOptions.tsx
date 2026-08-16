import { useEffect, useRef } from 'react'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import type { AvatarConfig } from '../lib/models'
import { AVATAR_CHOICES, avatarPartAsset, avatarSwatchColor, DEFAULT_AVATAR, type AvatarChoice, type AvatarPartKey } from './Avatar'

function AvatarOptionRow({ choice, avatar, onSelect }: { choice: AvatarChoice; avatar: AvatarConfig; onSelect: (key: AvatarPartKey, value: string) => void }) {
  const optionsRef = useRef<HTMLDivElement>(null)
  const selectedValue = avatar.photoUrl ? '' : avatar[choice.key] ?? DEFAULT_AVATAR[choice.key]

  useEffect(() => {
    const container = optionsRef.current
    const selected = container?.querySelector<HTMLElement>('.is-selected')
    if (!container || !selected) return
    const containerBounds = container.getBoundingClientRect()
    const selectedBounds = selected.getBoundingClientRect()
    const selectedOffset = selectedBounds.left - containerBounds.left + container.scrollLeft
    container.scrollLeft = Math.max(0, selectedOffset - (container.clientWidth - selected.clientWidth) / 2)
  }, [selectedValue])

  function scrollOptions(direction: -1 | 1) {
    optionsRef.current?.scrollBy({ left: direction * Math.max(180, optionsRef.current.clientWidth * .72), behavior: 'smooth' })
  }

  return <div className="avatar-option-row">
    <span>{choice.label}</span>
    <div className="avatar-option-scroll-shell">
      <button type="button" className="avatar-scroll-button avatar-scroll-button--left" onClick={() => scrollOptions(-1)} aria-label={`${choice.label}を左へスクロール`}><ChevronLeft size={16} /></button>
      <div
        className="avatar-option-track"
        ref={optionsRef}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') { event.preventDefault(); scrollOptions(-1) }
          if (event.key === 'ArrowRight') { event.preventDefault(); scrollOptions(1) }
        }}
        onWheel={(event) => {
          const container = optionsRef.current
          if (!container || container.scrollWidth <= container.clientWidth || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
          event.preventDefault()
          container.scrollLeft += event.deltaY
        }}
        aria-label={`${choice.label}の選択肢`}
      >
        {choice.values.map((value) => {
          const selected = selectedValue === value
          const asset = avatarPartAsset(choice.key, value)
          const hairPreviewStyle = choice.key === 'hairStyle' && asset ? {
            background: avatarSwatchColor('hair', avatar.hair) ?? '#2f2927',
            maskImage: `url("${asset}")`, WebkitMaskImage: `url("${asset}")`,
          } : undefined
          return <button
            type="button"
            key={value}
            className={`swatch ${choice.previews ? 'swatch--part' : ''} ${asset ? 'swatch--generated' : ''} swatch--${choice.key}-${value} ${selected ? 'is-selected' : ''}`}
            style={choice.previews ? undefined : { background: avatarSwatchColor(choice.key, value) }}
            onClick={() => onSelect(choice.key, value)}
            aria-label={`${choice.label}を${choice.previews?.[value] ?? value}にする`}
            aria-pressed={selected}
            title={choice.previews?.[value] ?? value}
          >
            {asset ? choice.key === 'hairStyle' ? <span className="generated-hair-preview" style={hairPreviewStyle} /> : <img src={asset} alt="" /> : choice.previews?.[value] ?? (selected && <Check size={14} />)}
            {selected && asset && <span className="swatch__check"><Check size={11} /></span>}
          </button>
        })}
      </div>
      <button type="button" className="avatar-scroll-button avatar-scroll-button--right" onClick={() => scrollOptions(1)} aria-label={`${choice.label}を右へスクロール`}><ChevronRight size={16} /></button>
    </div>
  </div>
}

export function AvatarPartOptions({ avatar, className = '', onSelect }: { avatar: AvatarConfig; className?: string; onSelect: (key: AvatarPartKey, value: string) => void }) {
  return <div className={`avatar-options ${className}`.trim()}>
    {AVATAR_CHOICES.map((choice) => <AvatarOptionRow key={choice.key} choice={choice} avatar={avatar} onSelect={onSelect} />)}
  </div>
}
