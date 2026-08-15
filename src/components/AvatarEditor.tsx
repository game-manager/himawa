import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Check, ImagePlus, Shuffle, Trash2 } from 'lucide-react'
import type { AvatarConfig } from '../lib/models'
import { avatarWithoutPhoto, prepareAvatarPhoto } from '../lib/avatarImage'
import { Avatar, AVATAR_CHOICES, randomAvatar } from './Avatar'

export function AvatarEditor({ current, busy, onSave }: { current: AvatarConfig; busy: boolean; onSave: (avatar: AvatarConfig) => void }) {
  const [avatar, setAvatar] = useState(current)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  function updatePart(key: 'skin' | 'hair' | 'outfit' | 'background', value: string) {
    setAvatar((item) => ({ ...avatarWithoutPhoto(item), [key]: value }))
    setError('')
  }

  async function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || processing) return
    setProcessing(true)
    setError('')
    try {
      const photoUrl = await prepareAvatarPhoto(file)
      setAvatar((item) => ({ ...item, photoUrl }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '画像を読み込めませんでした。')
    } finally {
      setProcessing(false)
    }
  }

  return <form className="avatar-editor" onSubmit={(event: FormEvent) => { event.preventDefault(); onSave(avatar) }}>
    <div className="avatar-editor__preview"><Avatar config={avatar} size="large" status="🌻" /></div>
    <div className="avatar-source-actions">
      <label className="avatar-photo-button"><ImagePlus size={17} />{processing ? '画像を加工中…' : avatar.photoUrl ? '別の画像を選ぶ' : '画像を選ぶ'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void selectPhoto(event)} disabled={processing || busy} /></label>
      {avatar.photoUrl ? <button type="button" onClick={() => setAvatar((item) => avatarWithoutPhoto(item))}><Trash2 size={16} />画像を外す</button> : <button type="button" onClick={() => setAvatar(randomAvatar())}><Shuffle size={16} />おまかせ</button>}
    </div>
    <p className="avatar-photo-hint">画像は中央を正方形に切り抜き、端末内で軽くしてから保存します。</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="avatar-options avatar-editor__parts">
      {AVATAR_CHOICES.map((choice) => <div className="avatar-option-row" key={choice.key}>
        <span>{choice.label}</span><div>{choice.values.map((value) => <button type="button" key={value} className={`swatch swatch--${choice.key}-${value} ${!avatar.photoUrl && avatar[choice.key] === value ? 'is-selected' : ''}`} onClick={() => updatePart(choice.key, value)} aria-label={`${choice.label}を${value}にする`}>{!avatar.photoUrl && avatar[choice.key] === value && <Check size={14} />}</button>)}</div>
      </div>)}
    </div>
    <button className="primary-button avatar-save-button" type="submit" disabled={busy || processing}>{busy ? '保存中…' : 'このアイコンにする'}</button>
  </form>
}
