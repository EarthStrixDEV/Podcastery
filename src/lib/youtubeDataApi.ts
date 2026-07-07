const API_BASE = 'https://www.googleapis.com/youtube/v3'

function getApiKey(): string | undefined {
  return import.meta.env.VITE_YOUTUBE_API_KEY
}

export interface VideoDetails {
  videoId: string
  title: string
  channelId: string
  channelTitle: string
  durationSeconds: number
  thumbnail: string
}

export function parseIsoDuration(iso: string): number {
  const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!match) return 0
  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2] ?? 0)
  const seconds = Number(match[3] ?? 0)
  return hours * 3600 + minutes * 60 + seconds
}

interface VideosApiItem {
  id: string
  snippet: { title: string; channelId: string; channelTitle: string; thumbnails: { medium?: { url: string }; default: { url: string } } }
  contentDetails: { duration: string }
}

interface VideosApiResponse {
  items: VideosApiItem[]
}

function mapVideoItem(item: VideosApiItem): VideoDetails {
  return {
    videoId: item.id,
    title: item.snippet.title,
    channelId: item.snippet.channelId,
    channelTitle: item.snippet.channelTitle,
    durationSeconds: parseIsoDuration(item.contentDetails.duration),
    thumbnail: item.snippet.thumbnails.medium?.url ?? item.snippet.thumbnails.default.url,
  }
}

export async function fetchVideoDetailsBatch(videoIds: string[]): Promise<VideoDetails[]> {
  const key = getApiKey()
  if (!key || videoIds.length === 0) return []

  const chunks: string[][] = []
  for (let i = 0; i < videoIds.length; i += 50) {
    chunks.push(videoIds.slice(i, i + 50))
  }

  const results: VideoDetails[] = []
  for (const chunk of chunks) {
    try {
      const params = new URLSearchParams({
        part: 'snippet,contentDetails',
        id: chunk.join(','),
        key,
      })
      const res = await fetch(`${API_BASE}/videos?${params}`)
      if (!res.ok) continue
      const data: VideosApiResponse = await res.json()
      results.push(...data.items.map(mapVideoItem))
    } catch {
      continue
    }
  }
  return results
}

export async function fetchVideoDetails(videoId: string): Promise<VideoDetails | null> {
  const results = await fetchVideoDetailsBatch([videoId])
  return results[0] ?? null
}

export interface ChannelInfo {
  channelId: string
  title: string
  thumbnail: string
}

interface ChannelsApiItem {
  id: string
  snippet: { title: string; thumbnails: { default: { url: string } } }
}

interface ChannelsApiResponse {
  items: ChannelsApiItem[]
}

export async function fetchChannelInfo(channelId: string): Promise<ChannelInfo | null> {
  const key = getApiKey()
  if (!key) return null

  try {
    const params = new URLSearchParams({
      part: 'snippet',
      id: channelId,
      key,
    })
    const res = await fetch(`${API_BASE}/channels?${params}`)
    if (!res.ok) return null
    const data: ChannelsApiResponse = await res.json()
    const item = data.items[0]
    if (!item) return null
    return {
      channelId: item.id,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.default.url,
    }
  } catch {
    return null
  }
}

export interface SearchResultItem {
  videoId: string
  title: string
  channelTitle: string
  thumbnail: string
}

interface SearchApiItem {
  id: { videoId?: string }
  snippet: { title: string; channelTitle: string; thumbnails: { medium?: { url: string }; default: { url: string } } }
}

interface SearchApiResponse {
  items: SearchApiItem[]
}

export async function searchVideos(query: string): Promise<SearchResultItem[]> {
  const key = getApiKey()
  if (!key) {
    throw new Error('ยังไม่ได้ตั้งค่า YouTube API Key')
  }

  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    maxResults: '12',
    q: query,
    key,
  })

  let res: Response
  try {
    res = await fetch(`${API_BASE}/search?${params}`)
  } catch {
    throw new Error('เชื่อมต่อ YouTube ไม่สำเร็จ ลองใหม่อีกครั้ง')
  }

  if (res.status === 403) {
    throw new Error('โควต้า YouTube API หมดสำหรับวันนี้ ลองใหม่พรุ่งนี้ หรือวาง URL แทนการค้นหา')
  }
  if (!res.ok) {
    throw new Error('ค้นหาไม่สำเร็จ ลองใหม่อีกครั้ง')
  }

  const data: SearchApiResponse = await res.json()
  return data.items
    .filter((item) => !!item.id.videoId)
    .map((item) => ({
      videoId: item.id.videoId as string,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails.medium?.url ?? item.snippet.thumbnails.default.url,
    }))
}

interface PlaylistItemsApiItem {
  contentDetails: { videoId: string }
}

interface PlaylistItemsApiResponse {
  items: PlaylistItemsApiItem[]
  nextPageToken?: string
}

export async function fetchPlaylistVideoIds(playlistId: string): Promise<string[]> {
  const key = getApiKey()
  if (!key) {
    throw new Error('ยังไม่ได้ตั้งค่า YouTube API Key')
  }

  const videoIds: string[] = []
  let pageToken = ''

  do {
    const params = new URLSearchParams({
      part: 'contentDetails',
      maxResults: '50',
      playlistId,
      key,
    })
    if (pageToken) params.set('pageToken', pageToken)

    let res: Response
    try {
      res = await fetch(`${API_BASE}/playlistItems?${params}`)
    } catch {
      throw new Error('เชื่อมต่อ YouTube ไม่สำเร็จ ลองใหม่อีกครั้ง')
    }

    if (res.status === 403) {
      throw new Error('โควต้า YouTube API หมดสำหรับวันนี้ ลองใหม่พรุ่งนี้')
    }
    if (!res.ok) {
      throw new Error('นำเข้า playlist ไม่สำเร็จ ตรวจสอบว่า playlist เป็นสาธารณะ')
    }

    const data: PlaylistItemsApiResponse = await res.json()
    videoIds.push(...data.items.map((item) => item.contentDetails.videoId))
    pageToken = data.nextPageToken ?? ''
  } while (pageToken)

  return videoIds
}
