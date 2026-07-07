const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/

export function extractYouTubeVideoId(rawUrl: string): string | null {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch {
    return null
  }

  const host = url.hostname.replace(/^www\./, '')
  let candidate: string | null = null

  if (host === 'youtu.be') {
    candidate = url.pathname.slice(1).split('/')[0]
  } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (url.pathname === '/watch') {
      candidate = url.searchParams.get('v')
    } else if (url.pathname.startsWith('/embed/')) {
      candidate = url.pathname.split('/embed/')[1]?.split('/')[0] ?? null
    } else if (url.pathname.startsWith('/shorts/')) {
      candidate = url.pathname.split('/shorts/')[1]?.split('/')[0] ?? null
    }
  }

  if (candidate && YOUTUBE_ID_REGEX.test(candidate)) {
    return candidate
  }
  return null
}

export function getYouTubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
}

export interface OEmbedResult {
  title: string
  authorName: string
}

export async function fetchYouTubeOEmbed(videoId: string): Promise<OEmbedResult | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${videoId}`
      )}&format=json`
    )
    if (!res.ok) return null
    const data = await res.json()
    return { title: data.title as string, authorName: data.author_name as string }
  } catch {
    return null
  }
}
