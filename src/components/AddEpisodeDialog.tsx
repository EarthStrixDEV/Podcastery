import { useState } from 'react'
import { Plus, Search, Loader2, SearchX } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Playlist } from '@/types/playlist'
import { cn } from '@/lib/utils'
import { notifyError, notifySuccess } from '@/lib/swal'
import { extractYouTubePlaylistId } from '@/lib/youtube'
import { searchVideos, type SearchResultItem } from '@/lib/youtubeDataApi'

const NEW_PLAYLIST_VALUE = '__new__'

interface AddEpisodeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  playlists: Playlist[]
  defaultPlaylistId?: string | null
  onCreatePlaylist: (name: string) => string
  onAddEpisode: (playlistId: string, url: string) => Promise<string | null>
  onAddEpisodeFromSearchResult: (playlistId: string, result: SearchResultItem) => Promise<void>
  onImportPlaylist: (
    playlistId: string,
    youtubePlaylistId: string,
    onProgress?: (done: number, total: number) => void
  ) => Promise<void>
}

type TabKey = 'url' | 'search'

export function AddEpisodeDialog({
  open,
  onOpenChange,
  playlists,
  defaultPlaylistId,
  onCreatePlaylist,
  onAddEpisode,
  onAddEpisodeFromSearchResult,
  onImportPlaylist,
}: AddEpisodeDialogProps) {
  const [tab, setTab] = useState<TabKey>('url')
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>(
    defaultPlaylistId ?? (playlists[0]?.id || NEW_PLAYLIST_VALUE)
  )
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(
    null
  )

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [addingVideoId, setAddingVideoId] = useState<string | null>(null)

  const reset = () => {
    setUrl('')
    setNewPlaylistName('')
    setError(null)
    setIsSubmitting(false)
    setImportProgress(null)
    setSearchQuery('')
    setSearchResults([])
    setIsSearching(false)
    setHasSearched(false)
    setAddingVideoId(null)
    setTab('url')
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const handleTabChange = (next: TabKey) => {
    setTab(next)
    if (next === 'url') {
      setSearchQuery('')
      setSearchResults([])
      setHasSearched(false)
      setAddingVideoId(null)
    }
  }

  const resolvePlaylistId = (): string | null => {
    if (selectedPlaylistId !== NEW_PLAYLIST_VALUE) return selectedPlaylistId
    const name = newPlaylistName.trim()
    if (!name) {
      setError('กรุณาตั้งชื่อ playlist')
      return null
    }
    return onCreatePlaylist(name)
  }

  const handleSubmitUrl = async () => {
    setError(null)

    const playlistId = resolvePlaylistId()
    if (!playlistId) return

    if (!url.trim()) {
      setError('กรุณาวางลิงก์ YouTube')
      return
    }

    const playlistIdFromUrl = extractYouTubePlaylistId(url)
    if (playlistIdFromUrl) {
      setIsSubmitting(true)
      setImportProgress({ done: 0, total: 0 })
      try {
        await onImportPlaylist(playlistId, playlistIdFromUrl, (done, total) =>
          setImportProgress({ done, total })
        )
        notifySuccess('นำเข้า playlist สำเร็จ')
        handleOpenChange(false)
      } catch (err) {
        notifyError(err instanceof Error ? err.message : 'นำเข้า playlist ไม่สำเร็จ')
      } finally {
        setIsSubmitting(false)
        setImportProgress(null)
      }
      return
    }

    setIsSubmitting(true)
    const result = await onAddEpisode(playlistId, url)
    setIsSubmitting(false)

    if (result) {
      notifyError(result)
      return
    }

    notifySuccess('เพิ่ม episode แล้ว')
    handleOpenChange(false)
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setIsSearching(true)
    setSearchResults([])
    try {
      const results = await searchVideos(searchQuery.trim())
      setSearchResults(results)
      setHasSearched(true)
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'ค้นหาไม่สำเร็จ')
    } finally {
      setIsSearching(false)
    }
  }

  const handlePickSearchResult = async (result: SearchResultItem) => {
    const playlistId = resolvePlaylistId()
    if (!playlistId) return

    setAddingVideoId(result.videoId)
    try {
      await onAddEpisodeFromSearchResult(playlistId, result)
      notifySuccess('เพิ่ม episode แล้ว')
    } catch {
      notifyError('เพิ่ม episode ไม่สำเร็จ')
    } finally {
      setAddingVideoId(null)
    }
  }

  const playlistSelector = (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1">
        <Label htmlFor="playlist-select" className="text-xs text-muted-foreground">
          Playlist
        </Label>
        <select
          id="playlist-select"
          value={selectedPlaylistId}
          onChange={(e) => setSelectedPlaylistId(e.target.value)}
          className={cn(
            'h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none',
            'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
          )}
        >
          {playlists.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value={NEW_PLAYLIST_VALUE}>+ สร้าง playlist ใหม่</option>
        </select>
      </div>

      {selectedPlaylistId === NEW_PLAYLIST_VALUE && (
        <div className="flex flex-col gap-1 animate-in fade-in-0 slide-in-from-top-1 duration-200">
          <Label htmlFor="new-playlist-name" className="text-xs text-muted-foreground">
            ชื่อ Playlist ใหม่
          </Label>
          <Input
            id="new-playlist-name"
            placeholder="เช่น My Podcasts"
            value={newPlaylistName}
            onChange={(e) => setNewPlaylistName(e.target.value)}
            className="h-9"
          />
        </div>
      )}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>เพิ่ม Episode</DialogTitle>
          <DialogDescription>
            วางลิงก์ YouTube (วิดีโอหรือ playlist) หรือค้นหาวิดีโอโดยตรง
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist">
          <button
            id="tab-url"
            type="button"
            role="tab"
            aria-selected={tab === 'url'}
            aria-controls="panel-url"
            onClick={() => handleTabChange('url')}
            className={cn(
              'flex-1 rounded-md py-1.5 text-sm font-medium transition-all duration-200',
              tab === 'url' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            วาง URL
          </button>
          <button
            id="tab-search"
            type="button"
            role="tab"
            aria-selected={tab === 'search'}
            aria-controls="panel-search"
            onClick={() => handleTabChange('search')}
            className={cn(
              'flex-1 rounded-md py-1.5 text-sm font-medium transition-colors',
              tab === 'search' ? 'bg-background shadow-sm' : 'text-muted-foreground'
            )}
          >
            ค้นหา
          </button>
        </div>

        {playlistSelector}

        {tab === 'url' ? (
          <div id="panel-url" role="tabpanel" aria-labelledby="tab-url" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="youtube-url">YouTube URL (วิดีโอ หรือ playlist)</Label>
              <Input
                id="youtube-url"
                placeholder="https://www.youtube.com/watch?v=... หรือ .../playlist?list=..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            {importProgress && (
              <p className="text-xs text-muted-foreground">
                {importProgress.total > 0
                  ? `กำลังนำเข้า ${importProgress.done}/${importProgress.total}`
                  : 'กำลังดึงรายการวิดีโอจาก playlist...'}
              </p>
            )}

            <DialogFooter>
              <Button
                onClick={handleSubmitUrl}
                disabled={isSubmitting}
                className="gap-1.5 transition-transform active:scale-95"
              >
                {isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                {isSubmitting ? 'กำลังเพิ่ม...' : 'เพิ่ม Episode'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div id="panel-search" role="tabpanel" aria-labelledby="tab-search" className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Input
                placeholder="ค้นหาวิดีโอบน YouTube..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleSearch()
                  }
                }}
              />
              <Button
                type="button"
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
                size="icon"
                className="transition-transform active:scale-90"
              >
                {isSearching ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
              </Button>
            </div>

            <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
              {isSearching &&
                Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex animate-pulse items-center gap-3 rounded-lg p-2"
                    style={{ animationDelay: `${i * 75}ms` }}
                  >
                    <div className="h-10 w-16 shrink-0 rounded-md bg-muted" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="h-3.5 w-3/4 rounded bg-muted" />
                      <div className="h-3 w-1/2 rounded bg-muted" />
                    </div>
                  </div>
                ))}

              {!isSearching && hasSearched && searchResults.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-8 text-center animate-in fade-in-0 duration-200">
                  <SearchX className="size-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    ไม่พบวิดีโอที่ตรงกับ "{searchQuery}"
                  </p>
                </div>
              )}

              {!isSearching &&
                searchResults.map((result, index) => (
                  <button
                    key={result.videoId}
                    type="button"
                    onClick={() => handlePickSearchResult(result)}
                    disabled={addingVideoId === result.videoId}
                    style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                    className="flex items-center gap-3 rounded-lg p-2 text-left text-sm transition-colors duration-150 hover:bg-muted disabled:opacity-50 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards"
                  >
                    <img
                      src={result.thumbnail}
                      alt={result.title}
                      className="h-10 w-16 shrink-0 rounded-md object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{result.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {result.channelTitle}
                      </p>
                    </div>
                    {addingVideoId === result.videoId && (
                      <Loader2 className="size-4 shrink-0 animate-spin" />
                    )}
                  </button>
                ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
