export interface Episode {
  id: string
  url: string
  videoId: string
  title: string
  thumbnail: string
  addedAt: number
}

export interface Playlist {
  id: string
  name: string
  episodes: Episode[]
  createdAt: number
}
