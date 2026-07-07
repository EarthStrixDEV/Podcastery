import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

export interface YouTubePlayerHandle {
  play: () => void
  pause: () => void
  seekTo: (seconds: number) => void
  setVolume: (volume: number) => void
  loadVideo: (videoId: string) => void
  getDuration: () => number
  getCurrentTime: () => number
}

interface YouTubePlayerProps {
  onReady?: () => void
  onStateChange?: (state: number) => void
  onEnded?: () => void
  onError?: () => void
}

let apiReadyPromise: Promise<void> | null = null

function loadYouTubeIframeApi(): Promise<void> {
  if (apiReadyPromise) return apiReadyPromise
  apiReadyPromise = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve()
      return
    }
    const existing = document.getElementById('youtube-iframe-api-script')
    if (!existing) {
      const tag = document.createElement('script')
      tag.id = 'youtube-iframe-api-script'
      tag.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(tag)
    }
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve()
    }
  })
  return apiReadyPromise
}

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  function YouTubePlayer({ onReady, onStateChange, onEnded, onError }, ref) {
    const playerRef = useRef<YT.Player | null>(null)
    const containerId = useRef(`yt-audio-player-${crypto.randomUUID()}`)

    useEffect(() => {
      let cancelled = false
      loadYouTubeIframeApi().then(() => {
        if (cancelled) return
        playerRef.current = new window.YT.Player(containerId.current, {
          height: '2',
          width: '2',
          playerVars: { controls: 0, disablekb: 1, playsinline: 1, modestbranding: 1 },
          events: {
            onReady: () => onReady?.(),
            onStateChange: (e: YT.OnStateChangeEvent) => {
              onStateChange?.(e.data)
              if (e.data === window.YT.PlayerState.ENDED) onEnded?.()
            },
            onError: () => onError?.(),
          },
        })
      })
      return () => {
        cancelled = true
        playerRef.current?.destroy()
        playerRef.current = null
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useImperativeHandle(
      ref,
      () => ({
        play: () => playerRef.current?.playVideo(),
        pause: () => playerRef.current?.pauseVideo(),
        seekTo: (seconds) => playerRef.current?.seekTo(seconds, true),
        setVolume: (volume) => playerRef.current?.setVolume(volume),
        loadVideo: (videoId) => playerRef.current?.loadVideoById(videoId),
        getDuration: () => playerRef.current?.getDuration() ?? 0,
        getCurrentTime: () => playerRef.current?.getCurrentTime() ?? 0,
      }),
      []
    )

    return (
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          width: 2,
          height: 2,
          overflow: 'hidden',
          opacity: 0,
          pointerEvents: 'none',
          bottom: 0,
          right: 0,
        }}
      >
        <div id={containerId.current} />
      </div>
    )
  }
)
