import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Volume1,
  VolumeX,
  Plus,
  Trash2,
  ListMusic,
  Headphones,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { usePlaylists } from '@/hooks/usePlaylists'
import { AddEpisodeDialog } from '@/components/AddEpisodeDialog'
import { YouTubePlayer, type YouTubePlayerHandle } from '@/components/YouTubePlayer'
import { confirmDestructive, notifySuccess } from '@/lib/swal'

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return ''
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.floor(totalSeconds % 60)
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

const CARD_ACCENTS = [
  'from-fuchsia-500/90 to-indigo-600/90',
  'from-amber-400/90 to-orange-600/90',
  'from-emerald-400/90 to-teal-600/90',
  'from-sky-400/90 to-blue-600/90',
  'from-rose-400/90 to-pink-600/90',
  'from-violet-400/90 to-purple-600/90',
]

export function MusicDashboard() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null)
  const [currentEpisodeId, setCurrentEpisodeId] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(70)

  const {
    playlists,
    createPlaylist,
    deletePlaylist,
    addEpisode,
    addEpisodeFromSearchResult,
    importYouTubePlaylist,
    removeEpisode,
  } = usePlaylists()
  const playerRef = useRef<YouTubePlayerHandle>(null)
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const selectedPlaylist = useMemo(
    () => playlists.find((p) => p.id === selectedPlaylistId) ?? null,
    [playlists, selectedPlaylistId]
  )

  const currentEpisode = useMemo(
    () => selectedPlaylist?.episodes.find((e) => e.id === currentEpisodeId) ?? null,
    [selectedPlaylist, currentEpisodeId]
  )

  useEffect(() => {
    if (!selectedPlaylistId && playlists.length > 0) {
      setSelectedPlaylistId(playlists[0].id)
    }
  }, [playlists, selectedPlaylistId])

  useEffect(() => {
    if (isPlaying) {
      progressTimer.current = setInterval(() => {
        setCurrentTime(playerRef.current?.getCurrentTime() ?? 0)
        setDuration(playerRef.current?.getDuration() ?? 0)
      }, 500)
    } else if (progressTimer.current) {
      clearInterval(progressTimer.current)
      progressTimer.current = null
    }
    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current)
    }
  }, [isPlaying])

  const playEpisode = (playlistId: string, episodeId: string, videoId: string) => {
    setSelectedPlaylistId(playlistId)
    setCurrentEpisodeId(episodeId)
    setCurrentTime(0)
    setDuration(0)
    playerRef.current?.loadVideo(videoId)
    playerRef.current?.setVolume(volume)
    setIsPlaying(true)
  }

  const handleTogglePlay = () => {
    if (!currentEpisode) return
    if (isPlaying) {
      playerRef.current?.pause()
      setIsPlaying(false)
    } else {
      playerRef.current?.play()
      setIsPlaying(true)
    }
  }

  const handleNext = () => {
    if (!selectedPlaylist || !currentEpisode) return
    const idx = selectedPlaylist.episodes.findIndex((e) => e.id === currentEpisode.id)
    const next = selectedPlaylist.episodes[idx + 1]
    if (next) playEpisode(selectedPlaylist.id, next.id, next.videoId)
  }

  const handlePrev = () => {
    if (!selectedPlaylist || !currentEpisode) return
    const idx = selectedPlaylist.episodes.findIndex((e) => e.id === currentEpisode.id)
    const prev = selectedPlaylist.episodes[idx - 1]
    if (prev) playEpisode(selectedPlaylist.id, prev.id, prev.videoId)
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value)
    setVolumeState(next)
    playerRef.current?.setVolume(next)
  }

  const handleDeletePlaylist = async (playlistId: string, playlistName: string) => {
    const confirmed = await confirmDestructive({
      title: `ลบ "${playlistName}"?`,
      text: `episode ทั้งหมด ${
        playlists.find((p) => p.id === playlistId)?.episodes.length ?? 0
      } รายการใน playlist นี้จะถูกลบไปด้วย`,
    })
    if (!confirmed) return

    deletePlaylist(playlistId)
    if (selectedPlaylistId === playlistId) {
      setSelectedPlaylistId(null)
      setCurrentEpisodeId(null)
      setIsPlaying(false)
    }
    notifySuccess(`ลบ "${playlistName}" แล้ว`)
  }

  const handleRemoveEpisode = async (playlistId: string, episodeId: string, episodeTitle: string) => {
    const confirmed = await confirmDestructive({
      title: 'ลบ episode นี้?',
      text: episodeTitle,
    })
    if (!confirmed) return

    removeEpisode(playlistId, episodeId)
    if (currentEpisodeId === episodeId) {
      setCurrentEpisodeId(null)
      setIsPlaying(false)
    }
    notifySuccess('ลบ episode แล้ว')
  }

  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      <YouTubePlayer
        ref={playerRef}
        onStateChange={(state) => {
          if (state === 1) setIsPlaying(true)
          if (state === 2) setIsPlaying(false)
        }}
        onEnded={handleNext}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Playlists — dark sidebar */}
        <aside className="flex w-72 shrink-0 flex-col overflow-y-auto bg-sidebar px-5 py-6 text-sidebar-foreground">
          <div className="flex items-center gap-2.5 pb-8">
            <div className="flex size-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
              <Headphones className="size-4.5" />
            </div>
            <span className="font-heading text-lg font-bold tracking-tight">Podcastery</span>
          </div>

          <div className="flex items-center justify-between pb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
              My Playlists
            </span>
            <Button
              size="icon-sm"
              className="rounded-full bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/85"
              onClick={() => setDialogOpen(true)}
              aria-label="เพิ่ม Episode"
            >
              <Plus className="size-4" />
            </Button>
          </div>

          {playlists.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-sidebar-border py-10 text-center">
              <ListMusic className="size-7 text-sidebar-foreground/40" />
              <p className="px-4 text-sm text-sidebar-foreground/60">
                ยังไม่มี playlist กดปุ่ม + เพื่อเริ่มต้น
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {playlists.map((playlist) => {
                const active = playlist.id === selectedPlaylistId
                return (
                  <div
                    key={playlist.id}
                    className={cn(
                      'group flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors',
                      active
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedPlaylistId(playlist.id)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <ListMusic className="size-4 shrink-0" />
                      <span className="flex-1 truncate font-medium">{playlist.name}</span>
                      <span className="shrink-0 text-xs opacity-50">
                        {playlist.episodes.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePlaylist(playlist.id, playlist.name)}
                      className="shrink-0 opacity-0 hover:text-destructive group-hover:opacity-100"
                      aria-label={`ลบ ${playlist.name}`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </aside>

        {/* Episode grid */}
        <main className="flex-1 min-w-0 overflow-y-auto px-8 py-7">
          {!selectedPlaylist ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              เลือก playlist ทางซ้ายเพื่อดู episode
            </div>
          ) : (
            <>
              <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
                {selectedPlaylist.name}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedPlaylist.episodes.length} episode
                {selectedPlaylist.episodes.length !== 1 ? 's' : ''}
              </p>

              {selectedPlaylist.episodes.length === 0 ? (
                <p className="mt-6 text-sm text-muted-foreground">
                  ยังไม่มี episode ใน playlist นี้
                </p>
              ) : (
                <div className="mt-6 grid grid-cols-2 gap-5 lg:grid-cols-3 xl:grid-cols-4">
                  {selectedPlaylist.episodes.map((episode, index) => {
                    const isCurrent = currentEpisodeId === episode.id
                    const accent = CARD_ACCENTS[index % CARD_ACCENTS.length]
                    return (
                      <div
                        key={episode.id}
                        className={cn(
                          'group relative aspect-square overflow-hidden rounded-3xl shadow-sm ring-1 ring-black/5 transition-transform hover:-translate-y-1 hover:shadow-lg',
                          isCurrent && 'ring-2 ring-primary'
                        )}
                      >
                        <img
                          src={episode.thumbnail}
                          alt={episode.title}
                          className="absolute inset-0 size-full object-cover"
                        />
                        <div
                          className={cn(
                            'absolute inset-0 bg-gradient-to-t opacity-90 mix-blend-multiply',
                            accent
                          )}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

                        <button
                          type="button"
                          onClick={() => playEpisode(selectedPlaylist.id, episode.id, episode.videoId)}
                          className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
                          aria-label={`เล่น ${episode.title}`}
                        >
                          <span className="flex size-12 items-center justify-center rounded-full bg-white text-foreground shadow-xl">
                            {isCurrent && isPlaying ? (
                              <Pause className="size-5 fill-current" />
                            ) : (
                              <Play className="size-5 translate-x-0.5 fill-current" />
                            )}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleRemoveEpisode(selectedPlaylist.id, episode.id, episode.title)
                          }
                          className="absolute top-3 right-3 flex size-7 items-center justify-center rounded-full bg-black/30 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/50 group-hover:opacity-100"
                          aria-label={`ลบ ${episode.title}`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>

                        {episode.durationSeconds ? (
                          <span className="absolute bottom-14 right-3 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
                            {formatDuration(episode.durationSeconds)}
                          </span>
                        ) : null}

                        <div className="absolute bottom-3 left-3.5 right-3.5">
                          <p className="line-clamp-2 text-sm font-semibold leading-tight text-white">
                            {episode.title}
                          </p>
                          {episode.channelTitle ? (
                            <div className="mt-1 flex items-center gap-1.5">
                              {episode.channelThumbnail ? (
                                <img
                                  src={episode.channelThumbnail}
                                  alt={episode.channelTitle}
                                  className="size-4 rounded-full"
                                />
                              ) : null}
                              <span className="truncate text-xs text-white/80">
                                {episode.channelTitle}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Player bar */}
      <div className="flex shrink-0 items-center gap-6 border-t border-border bg-card px-8 py-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="size-12 shrink-0 overflow-hidden rounded-xl bg-muted">
            {currentEpisode && (
              <img
                src={currentEpisode.thumbnail}
                alt={currentEpisode.title}
                className="size-full object-cover"
              />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {currentEpisode ? currentEpisode.title : 'ยังไม่ได้เล่น episode'}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {selectedPlaylist ? selectedPlaylist.name : '—'}
            </p>
          </div>
        </div>

        <div className="flex flex-[1.4] flex-col items-center gap-1.5">
          <div className="flex items-center gap-5">
            <button
              className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
              onClick={handlePrev}
              disabled={!currentEpisode}
              aria-label="ตอนก่อนหน้า"
            >
              <SkipBack className="size-4.5 fill-current" />
            </button>
            <button
              type="button"
              onClick={handleTogglePlay}
              disabled={!currentEpisode}
              className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/30 transition-transform hover:scale-105 disabled:opacity-30 disabled:hover:scale-100"
              aria-label={isPlaying ? 'หยุดชั่วคราว' : 'เล่น'}
            >
              {isPlaying ? (
                <Pause className="size-4.5 fill-current" />
              ) : (
                <Play className="size-4.5 translate-x-0.5 fill-current" />
              )}
            </button>
            <button
              className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
              onClick={handleNext}
              disabled={!currentEpisode}
              aria-label="ตอนถัดไป"
            >
              <SkipForward className="size-4.5 fill-current" />
            </button>
          </div>
          <div className="flex w-full max-w-lg items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <span>{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 1}
              value={currentTime}
              onChange={(e) => playerRef.current?.seekTo(Number(e.target.value))}
              className="h-1 flex-1 accent-primary"
              disabled={!currentEpisode}
            />
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-end gap-2">
          <VolumeIcon className="size-4 text-muted-foreground" />
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={handleVolumeChange}
            className="h-1 w-24 accent-primary"
          />
        </div>
      </div>

      <AddEpisodeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        playlists={playlists}
        defaultPlaylistId={selectedPlaylistId}
        onCreatePlaylist={createPlaylist}
        onAddEpisode={addEpisode}
        onAddEpisodeFromSearchResult={addEpisodeFromSearchResult}
        onImportPlaylist={importYouTubePlaylist}
      />
    </div>
  )
}

export default MusicDashboard
