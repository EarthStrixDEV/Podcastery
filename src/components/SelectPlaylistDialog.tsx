import { useState } from 'react'
import { Plus, Loader2 } from 'lucide-react'
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
import type { SearchResultItem } from '@/lib/youtubeDataApi'

const NEW_PLAYLIST_VALUE = '__new__'

interface SelectPlaylistDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  playlists: Playlist[]
  clip: SearchResultItem | null
  onCreatePlaylist: (name: string) => string
  onAddEpisodeFromSearchResult: (playlistId: string, result: SearchResultItem) => Promise<void>
}

export function SelectPlaylistDialog({
  open,
  onOpenChange,
  playlists,
  clip,
  onCreatePlaylist,
  onAddEpisodeFromSearchResult,
}: SelectPlaylistDialogProps) {
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>(
    playlists[0]?.id || NEW_PLAYLIST_VALUE
  )
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const reset = () => {
    setNewPlaylistName('')
    setError(null)
    setIsSubmitting(false)
    setSelectedPlaylistId(playlists[0]?.id || NEW_PLAYLIST_VALUE)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const handleSubmit = async () => {
    if (!clip) return
    setError(null)

    let playlistId = selectedPlaylistId
    if (playlistId === NEW_PLAYLIST_VALUE) {
      const name = newPlaylistName.trim()
      if (!name) {
        setError('กรุณาตั้งชื่อ playlist')
        return
      }
      playlistId = onCreatePlaylist(name)
    }

    setIsSubmitting(true)
    try {
      await onAddEpisodeFromSearchResult(playlistId, clip)
      notifySuccess('เพิ่ม episode แล้ว')
      handleOpenChange(false)
    } catch {
      notifyError('เพิ่ม episode ไม่สำเร็จ')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>เพิ่มเข้า Playlist</DialogTitle>
          <DialogDescription>
            {clip ? clip.title : 'เลือกหรือสร้าง playlist สำหรับคลิปนี้'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-1">
            <Label htmlFor="select-playlist" className="text-xs text-muted-foreground">
              Playlist
            </Label>
            <select
              id="select-playlist"
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
              <Label htmlFor="select-new-playlist-name" className="text-xs text-muted-foreground">
                ชื่อ Playlist ใหม่
              </Label>
              <Input
                id="select-new-playlist-name"
                placeholder="เช่น My Podcasts"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                className="h-9"
              />
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !clip}
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
      </DialogContent>
    </Dialog>
  )
}
