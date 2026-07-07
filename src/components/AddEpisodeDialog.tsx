import { useState } from 'react'
import { Plus } from 'lucide-react'
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

const NEW_PLAYLIST_VALUE = '__new__'

interface AddEpisodeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  playlists: Playlist[]
  defaultPlaylistId?: string | null
  onCreatePlaylist: (name: string) => string
  onAddEpisode: (playlistId: string, url: string) => Promise<string | null>
}

export function AddEpisodeDialog({
  open,
  onOpenChange,
  playlists,
  defaultPlaylistId,
  onCreatePlaylist,
  onAddEpisode,
}: AddEpisodeDialogProps) {
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>(
    defaultPlaylistId ?? (playlists[0]?.id || NEW_PLAYLIST_VALUE)
  )
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const reset = () => {
    setUrl('')
    setNewPlaylistName('')
    setError(null)
    setIsSubmitting(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const handleSubmit = async () => {
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

    if (!url.trim()) {
      setError('กรุณาวางลิงก์ YouTube')
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>เพิ่ม Episode</DialogTitle>
          <DialogDescription>
            เลือกหรือสร้าง playlist แล้ววางลิงก์ YouTube ที่ต้องการฟัง
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="playlist-select">Playlist</Label>
            <select
              id="playlist-select"
              value={selectedPlaylistId}
              onChange={(e) => setSelectedPlaylistId(e.target.value)}
              className={cn(
                'h-8 rounded-lg border border-border bg-background px-2.5 text-sm outline-none',
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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-playlist-name">ชื่อ Playlist ใหม่</Label>
              <Input
                id="new-playlist-name"
                placeholder="เช่น My Podcasts"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="youtube-url">YouTube URL</Label>
            <Input
              id="youtube-url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-1.5">
            <Plus className="size-4" />
            {isSubmitting ? 'กำลังเพิ่ม...' : 'เพิ่ม Episode'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
