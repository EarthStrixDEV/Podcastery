import { useCallback, useState } from 'react'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import type { Episode, Playlist } from '@/types/playlist'
import { extractYouTubeVideoId, fetchYouTubeOEmbed, getYouTubeThumbnail } from '@/lib/youtube'

const STORAGE_KEY = 'podcastery:playlists'

export function usePlaylists() {
  const [playlists, setPlaylists] = useLocalStorage<Playlist[]>(STORAGE_KEY, [])
  const [nowPlaying, setNowPlaying] = useState<{ playlistId: string; episodeId: string } | null>(
    null
  )

  const createPlaylist = useCallback(
    (name: string) => {
      const playlist: Playlist = {
        id: crypto.randomUUID(),
        name,
        episodes: [],
        createdAt: Date.now(),
      }
      setPlaylists((prev) => [...prev, playlist])
      return playlist.id
    },
    [setPlaylists]
  )

  const deletePlaylist = useCallback(
    (playlistId: string) => {
      setPlaylists((prev) => prev.filter((p) => p.id !== playlistId))
    },
    [setPlaylists]
  )

  const addEpisode = useCallback(
    async (playlistId: string, rawUrl: string): Promise<string | null> => {
      const videoId = extractYouTubeVideoId(rawUrl)
      if (!videoId) {
        return 'ลิงก์ YouTube ไม่ถูกต้อง กรุณาวางลิงก์รูปแบบ youtube.com/watch?v=... หรือ youtu.be/...'
      }

      const oembed = await fetchYouTubeOEmbed(videoId)
      const episode: Episode = {
        id: crypto.randomUUID(),
        url: rawUrl.trim(),
        videoId,
        title: oembed?.title ?? `Episode ${videoId}`,
        thumbnail: getYouTubeThumbnail(videoId),
        addedAt: Date.now(),
      }
      setPlaylists((prev) =>
        prev.map((p) => (p.id === playlistId ? { ...p, episodes: [...p.episodes, episode] } : p))
      )
      return null
    },
    [setPlaylists]
  )

  const removeEpisode = useCallback(
    (playlistId: string, episodeId: string) => {
      setPlaylists((prev) =>
        prev.map((p) =>
          p.id === playlistId ? { ...p, episodes: p.episodes.filter((e) => e.id !== episodeId) } : p
        )
      )
    },
    [setPlaylists]
  )

  return {
    playlists,
    createPlaylist,
    deletePlaylist,
    addEpisode,
    removeEpisode,
    nowPlaying,
    setNowPlaying,
  }
}
