const PROXY_BASE = '/api/youtube'

function logFetchFailure(context: string, err: unknown): void {
  console.error(
    `[YouTube API] เรียก ${context} ไม่สำเร็จ — เครือข่าย/ไฟร์วอลล์อาจบล็อกการเชื่อมต่อ:`,
    err
  )
}

export interface VideoDetails {
  videoId: string
  title: string
  channelId: string
  channelTitle: string
  durationSeconds: number
  thumbnail: string
  viewCount?: number
  publishedAt?: string
  description?: string
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
  snippet: {
    title: string
    channelId: string
    channelTitle: string
    description: string
    publishedAt: string
    thumbnails: { medium?: { url: string }; default: { url: string } }
  }
  contentDetails: { duration: string }
  statistics?: { viewCount?: string }
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
    viewCount: item.statistics?.viewCount ? Number(item.statistics.viewCount) : undefined,
    publishedAt: item.snippet.publishedAt,
    description: item.snippet.description,
  }
}

export async function fetchVideoDetailsBatch(videoIds: string[]): Promise<VideoDetails[]> {
  if (videoIds.length === 0) return []

  const chunks: string[][] = []
  for (let i = 0; i < videoIds.length; i += 50) {
    chunks.push(videoIds.slice(i, i + 50))
  }

  const results: VideoDetails[] = []
  for (const chunk of chunks) {
    try {
      const params = new URLSearchParams({
        endpoint: 'videos',
        part: 'snippet,contentDetails,statistics',
        id: chunk.join(','),
      })
      const res = await fetch(`${PROXY_BASE}?${params}`)
      if (!res.ok) {
        console.error(`[YouTube API] videos endpoint ตอบ status ${res.status} ${res.statusText}`)
        continue
      }
      const data: VideosApiResponse = await res.json()
      results.push(...data.items.map(mapVideoItem))
    } catch (err) {
      logFetchFailure('videos (metadata enrichment)', err)
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
  try {
    const params = new URLSearchParams({
      endpoint: 'channels',
      part: 'snippet',
      id: channelId,
    })
    const res = await fetch(`${PROXY_BASE}?${params}`)
    if (!res.ok) {
      console.error(`[YouTube API] channels endpoint ตอบ status ${res.status} ${res.statusText}`)
      return null
    }
    const data: ChannelsApiResponse = await res.json()
    const item = data.items[0]
    if (!item) return null
    return {
      channelId: item.id,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.default.url,
    }
  } catch (err) {
    logFetchFailure('channels', err)
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
  const params = new URLSearchParams({
    endpoint: 'search',
    part: 'snippet',
    type: 'video',
    maxResults: '12',
    q: query,
  })

  let res: Response
  try {
    res = await fetch(`${PROXY_BASE}?${params}`)
  } catch (err) {
    logFetchFailure('search', err)
    throw new Error('เชื่อมต่อ YouTube ไม่สำเร็จ ลองใหม่อีกครั้ง')
  }

  if (res.status === 403) {
    console.error(`[YouTube API] search endpoint ตอบ 403 — โควต้าหมด หรือ API key ถูกจำกัด referrer/IP`)
    throw new Error('โควต้า YouTube API หมดสำหรับวันนี้ ลองใหม่พรุ่งนี้ หรือวาง URL แทนการค้นหา')
  }
  if (res.status === 429) {
    console.error(`[YouTube API] search endpoint ตอบ 429 — ยิง request ถี่เกินไป`)
    throw new Error('ค้นหาถี่เกินไป กรุณารอสักครู่แล้วลองใหม่')
  }
  if (!res.ok) {
    console.error(`[YouTube API] search endpoint ตอบ status ${res.status} ${res.statusText}`)
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
  const videoIds: string[] = []
  let pageToken = ''

  do {
    const params = new URLSearchParams({
      endpoint: 'playlistItems',
      part: 'contentDetails',
      maxResults: '50',
      playlistId,
    })
    if (pageToken) params.set('pageToken', pageToken)

    let res: Response
    try {
      res = await fetch(`${PROXY_BASE}?${params}`)
    } catch (err) {
      logFetchFailure('playlistItems', err)
      throw new Error('เชื่อมต่อ YouTube ไม่สำเร็จ ลองใหม่อีกครั้ง')
    }

    if (res.status === 403) {
      console.error(`[YouTube API] playlistItems endpoint ตอบ 403 — โควต้าหมด หรือ API key ถูกจำกัด referrer/IP`)
      throw new Error('โควต้า YouTube API หมดสำหรับวันนี้ ลองใหม่พรุ่งนี้')
    }
    if (res.status === 429) {
      console.error(`[YouTube API] playlistItems endpoint ตอบ 429 — ยิง request ถี่เกินไป`)
      throw new Error('นำเข้า playlist ถี่เกินไป กรุณารอสักครู่แล้วลองใหม่')
    }
    if (!res.ok) {
      console.error(`[YouTube API] playlistItems endpoint ตอบ status ${res.status} ${res.statusText}`)
      throw new Error('นำเข้า playlist ไม่สำเร็จ ตรวจสอบว่า playlist เป็นสาธารณะ')
    }

    const data: PlaylistItemsApiResponse = await res.json()
    videoIds.push(...data.items.map((item) => item.contentDetails.videoId))
    pageToken = data.nextPageToken ?? ''
  } while (pageToken)

  return videoIds
}
