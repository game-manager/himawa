import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchMusic } from './music'

describe('music search helpers', () => {
  afterEach(() => vi.restoreAllMocks())

  it('skips network access for very short searches', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    await expect(searchMusic('a')).resolves.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sanitizes iTunes song results', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      results: [
        {
          wrapperType: 'track', kind: 'song', trackId: 123,
          trackName: '  Song title  ', artistName: 'Artist',
          trackViewUrl: 'https://music.apple.com/jp/album/song/1?i=123',
          artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/example/100x100bb.jpg',
          previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/example.m4a',
        },
        {
          wrapperType: 'track', kind: 'song', trackId: 456,
          trackName: 'Unsafe', artistName: 'Artist',
          trackViewUrl: 'https://evil.example/song',
        },
      ],
    }), { status: 200 }))

    await expect(searchMusic('song')).resolves.toEqual([{
      provider: 'apple', trackId: '123', title: 'Song title', artistName: 'Artist',
      url: 'https://music.apple.com/jp/album/song/1?i=123',
      thumbnailUrl: 'https://is1-ssl.mzstatic.com/image/thumb/example/100x100bb.jpg',
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/example.m4a',
    }])
  })

  it('reports failed searches', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }))
    await expect(searchMusic('song')).rejects.toThrow('MUSIC_SEARCH_FAILED')
  })
})
