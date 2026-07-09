# YouTube Data API v3 Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เชื่อม YouTube Data API v3 เข้ากับ Podcastery เพื่อดึง duration, channel info, ค้นหาวิดีโอในแอป, และนำเข้าทั้ง YouTube playlist ในครั้งเดียว โดยไม่กระทบการทำงานเดิม (oEmbed/IFrame Player) ที่ไม่ต้องใช้ API key

**Architecture:** เพิ่มเลเยอร์ `src/lib/youtubeDataApi.ts` แยกจาก `youtube.ts` เดิมชัดเจน, ขยาย `Episode` type ด้วย field optional ใหม่, ปรับ `usePlaylists` hook ให้เรียก Data API แบบ non-blocking (fallback เสมอถ้า fail), เพิ่ม tab ค้นหาใน `AddEpisodeDialog`, และเพิ่ม duration/channel badge บน episode card

**Tech Stack:** React 19 + TypeScript + Vite 5, ไม่มี test runner ติดตั้ง (ทดสอบผ่าน `npm run build` type-check + Chrome preview tools), git repo เพิ่ง init ใหม่ (branch `master`, baseline commit มีอยู่แล้วก่อน Task 1) — commit ทุก task ตาม step สุดท้ายของแต่ละ task ห้าม commit ไฟล์ `.env`

## Global Constraints

- API key เก็บใน `.env` เป็น `VITE_YOUTUBE_API_KEY` — ห้าม hardcode ในซอร์สโค้ด
- ทุกฟังก์ชันใน `youtubeDataApi.ts` คืน `null`/`[]` เมื่อ fail แทนการ throw (ยกเว้น `searchVideos` และ `importYouTubePlaylist` ที่ throw `Error` message ภาษาไทยอ่านง่าย เพราะ caller ต้องโชว์ error ให้ user เห็น)
- การเพิ่ม episode จาก URL เดี่ยวต้องสำเร็จได้เสมอแม้ Data API ล้มเหลวทั้งหมด (fallback ไป oEmbed เดิม)
- URL ที่มีทั้ง `v=` และ `list=` ต้องตีความเป็นวิดีโอเดี่ยวเสมอ ไม่ใช่ playlist
- ห้าม auto-search ขณะพิมพ์ — ต้องกดปุ่มค้นหาเท่านั้น (ประหยัด quota)
- `npm run build` ต้องผ่านไม่มี TypeScript error ทุก task
- ทุก URL query string ในไฟล์ `youtubeDataApi.ts` ต้องสร้างด้วย `URLSearchParams` เสมอ ห้าม manual string interpolation (`?a=${x}&b=${y}`)

---

## Task 1: Setup — .env.example (คอนโทรลเลอร์ทำ `.env` และ `.gitignore` ไว้ล่วงหน้าแล้ว)

**สถานะ:** `.env` (มี key จริง) และการเพิ่ม `.env` เข้า `.gitignore` เสร็จไปแล้วนอก workflow นี้ก่อนเริ่ม Task 1 — ห้ามแก้ไข `.env` หรือ `.gitignore` ในทาสก์นี้ และห้ามอ่าน/พิมพ์เนื้อหาไฟล์ `.env` ออกมาที่ใดเด็ดขาด (เสี่ยง key หลุดเข้า log/commit message)

**Files:**
- Create: `.env.example`

**Interfaces:**
- Produces: `import.meta.env.VITE_YOUTUBE_API_KEY` ใช้ได้จากทุกไฟล์ในโปรเจกต์ (Vite inject ให้อัตโนมัติ, ค่าจริงมีอยู่แล้วใน `.env` ที่ root)

- [ ] **Step 1: สร้างไฟล์ `.env.example`**

```
VITE_YOUTUBE_API_KEY=
```

- [ ] **Step 2: ยืนยันว่า `.env` ถูก ignore แล้ว (ห้ามแก้ไขไฟล์ ตรวจอย่างเดียว)**

Run: `git check-ignore .env`
Expected: พิมพ์ `.env` กลับมา (แปลว่าถูก ignore แล้ว) — ถ้าไม่มีผลลัพธ์ ให้รายงาน BLOCKED ทันที ห้ามแก้ `.gitignore` เอง

- [ ] **Step 3: commit**

```bash
git add .env.example
git commit -m "chore: add .env.example for YouTube Data API key"
```

---

## Task 2: `youtubeDataApi.ts` — fetchVideoDetails + fetchVideoDetailsBatch

**Files:**
- Create: `src/lib/youtubeDataApi.ts`

**Interfaces:**
- Consumes: `import.meta.env.VITE_YOUTUBE_API_KEY` (จาก Task 1)
- Produces:
  - `interface VideoDetails { videoId: string; title: string; channelId: string; channelTitle: string; durationSeconds: number; thumbnail: string }`
  - `function parseIsoDuration(iso: string): number`
  - `async function fetchVideoDetails(videoId: string): Promise<VideoDetails | null>`
  - `async function fetchVideoDetailsBatch(videoIds: string[]): Promise<VideoDetails[]>`

- [ ] **Step 1: เขียน `parseIsoDuration` และ `fetchVideoDetailsBatch`/`fetchVideoDetails`**

```typescript
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
      const res = await fetch(
        `${API_BASE}/videos?part=snippet,contentDetails&id=${chunk.join(',')}&key=${key}`
      )
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
```

- [ ] **Step 2: ตรวจ TypeScript compile**

Run: `npm run build`
Expected: ผ่านไม่มี error (ไฟล์นี้ยังไม่ถูก import ที่ไหน แต่ต้อง type-check ผ่านตัวเอง)

- [ ] **Step 3: ทดสอบผ่านฟังก์ชันจริงที่เพิ่งเขียน (ห้าม hardcode API key ในคำสั่งทดสอบใดๆ)**

ห้ามเขียนหรือพิมพ์ค่า API key ออกมาเองในทุกกรณี — ไฟล์ `.env` มี key ตั้งไว้แล้ว และฟังก์ชัน `fetchVideoDetails`/`fetchVideoDetailsBatch` อ่านค่าจาก `import.meta.env.VITE_YOUTUBE_API_KEY` เองโดยอัตโนมัติอยู่แล้วเมื่อรันผ่าน Vite dev server จริง

สร้างไฟล์ทดสอบชั่วคราว `src/temp-task2-test.ts`:

```typescript
import { fetchVideoDetails } from './lib/youtubeDataApi'

fetchVideoDetails('dQw4w9WgXcQ').then((result) => {
  console.log('TASK2_TEST_RESULT', JSON.stringify(result))
})
```

import ไฟล์นี้ชั่วคราวใน `src/main.tsx` (เพิ่ม `import './temp-task2-test'` บรรทัดบนสุด) เปิด dev server ผ่าน preview tool (`preview_start` ด้วย config ชื่อ `vite-dev` จาก `.claude/launch.json`) แล้วดึง console log ผ่าน `preview_console_logs`

Expected: เห็น log บรรทัดที่ขึ้นต้นด้วย `TASK2_TEST_RESULT` ตามด้วย JSON ที่มี `durationSeconds` เป็นตัวเลข > 0 และ `channelTitle` มีค่า (ไม่ใช่ `null` หรือ `undefined`) — ยืนยันว่า key ใช้งานได้จริงและฟังก์ชัน parse ถูกต้อง

**สำคัญ:** หลังทดสอบผ่านแล้ว ต้องลบทั้ง `src/temp-task2-test.ts` และบรรทัด import ที่เพิ่มใน `src/main.tsx` ออกทั้งหมดก่อน commit — ไฟล์ชั่วคราวนี้ห้ามหลุดเข้า commit เด็ดขาด รัน `npm run build` อีกครั้งหลังลบเพื่อยืนยันว่าโปรเจกต์ยัง build ผ่านโดยไม่มีไฟล์ทดสอบนี้เหลืออยู่

- [ ] **Step 4: commit**

```bash
git add src/lib/youtubeDataApi.ts
git commit -m "feat: add fetchVideoDetails and fetchVideoDetailsBatch to youtubeDataApi"
```

---

## Task 3: `youtubeDataApi.ts` — fetchChannelInfo

**Files:**
- Modify: `src/lib/youtubeDataApi.ts`

**Interfaces:**
- Consumes: `getApiKey()` (private helper จาก Task 2, อยู่ไฟล์เดียวกัน)
- Produces:
  - `interface ChannelInfo { channelId: string; title: string; thumbnail: string }`
  - `async function fetchChannelInfo(channelId: string): Promise<ChannelInfo | null>`

- [ ] **Step 1: เพิ่มฟังก์ชัน `fetchChannelInfo` ต่อท้ายไฟล์**

```typescript
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
    const res = await fetch(`${API_BASE}/channels?part=snippet&id=${channelId}&key=${key}`)
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
```

- [ ] **Step 2: ตรวจ TypeScript compile**

Run: `npm run build`
Expected: ผ่านไม่มี error

- [ ] **Step 3: ทดสอบผ่านฟังก์ชันจริงที่เพิ่งเขียน (ห้าม hardcode API key ในคำสั่งทดสอบใดๆ)**

ใช้วิธีเดียวกับ Task 2 Step 3: สร้างไฟล์ทดสอบชั่วคราว `src/temp-task3-test.ts` เรียก `fetchChannelInfo` ตรงๆ (ใช้ channel ID `UCuAXFkgsw1L7xaCfnd5JJOw`), import เข้า `src/main.tsx` ชั่วคราว, ทดสอบผ่าน dev server + `preview_console_logs`, log ด้วย prefix `TASK3_TEST_RESULT`

Expected: log มี `title` และ `thumbnail` เป็น URL รูปภาพจริง (ไม่ใช่ `null`)

**สำคัญ:** ลบไฟล์ทดสอบชั่วคราวและ import ออกก่อน commit เหมือน Task 2

- [ ] **Step 4: commit**

```bash
git add src/lib/youtubeDataApi.ts
git commit -m "feat: add fetchChannelInfo to youtubeDataApi"
```

---

## Task 4: `youtubeDataApi.ts` — searchVideos (throws on error)

**Files:**
- Modify: `src/lib/youtubeDataApi.ts`

**Interfaces:**
- Consumes: `getApiKey()` (จาก Task 2)
- Produces:
  - `interface SearchResultItem { videoId: string; title: string; channelTitle: string; thumbnail: string }`
  - `async function searchVideos(query: string): Promise<SearchResultItem[]>` — **throws `Error` เมื่อ fail** (ต่างจากฟังก์ชันอื่นที่คืน null)

- [ ] **Step 1: เพิ่มฟังก์ชัน `searchVideos`**

```typescript
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
```

- [ ] **Step 2: ตรวจ TypeScript compile**

Run: `npm run build`
Expected: ผ่านไม่มี error

- [ ] **Step 3: ทดสอบผ่านฟังก์ชันจริงที่เพิ่งเขียน (ห้าม hardcode API key ในคำสั่งทดสอบใดๆ)**

ใช้วิธีเดียวกับ Task 2 Step 3: สร้างไฟล์ทดสอบชั่วคราว `src/temp-task4-test.ts` เรียก `searchVideos('lofi')`, import เข้า `src/main.tsx` ชั่วคราว, ทดสอบผ่าน dev server + `preview_console_logs`, log ด้วย prefix `TASK4_TEST_RESULT` (เช่น `console.log('TASK4_TEST_RESULT', results.length, JSON.stringify(results[0]))`)

Expected: `results.length` > 0, แต่ละ item มี `videoId` และ `title`

**สำคัญ:** ลบไฟล์ทดสอบชั่วคราวและ import ออกก่อน commit เหมือน Task 2

- [ ] **Step 4: commit**

```bash
git add src/lib/youtubeDataApi.ts
git commit -m "feat: add searchVideos to youtubeDataApi"
```

---

## Task 5: `youtubeDataApi.ts` — fetchPlaylistVideoIds (throws on error)

**Files:**
- Modify: `src/lib/youtubeDataApi.ts`

**Interfaces:**
- Consumes: `getApiKey()` (จาก Task 2)
- Produces: `async function fetchPlaylistVideoIds(playlistId: string): Promise<string[]>` — **throws `Error`** เมื่อ fail, เดิน pagination ทุกหน้าจนครบ

- [ ] **Step 1: เพิ่มฟังก์ชัน `fetchPlaylistVideoIds`**

```typescript
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
```

- [ ] **Step 2: ตรวจ TypeScript compile**

Run: `npm run build`
Expected: ผ่านไม่มี error

- [ ] **Step 3: ทดสอบผ่านฟังก์ชันจริงที่เพิ่งเขียน (ห้าม hardcode API key ในคำสั่งทดสอบใดๆ)**

ใช้วิธีเดียวกับ Task 2 Step 3: สร้างไฟล์ทดสอบชั่วคราว `src/temp-task5-test.ts` เรียก `fetchPlaylistVideoIds('PLillGF-RfqbYE6Ik_EuXA2iZFcE082B3s')` (playlist สาธารณะที่รู้จักแน่นอน — YouTube's own "First YouTube videos"), import เข้า `src/main.tsx` ชั่วคราว, ทดสอบผ่าน dev server + `preview_console_logs`, log ด้วย prefix `TASK5_TEST_RESULT`

Expected: array ที่ได้มีความยาว > 0 (ไม่ throw error)

**สำคัญ:** ลบไฟล์ทดสอบชั่วคราวและ import ออกก่อน commit เหมือน Task 2

- [ ] **Step 4: commit**

```bash
git add src/lib/youtubeDataApi.ts
git commit -m "feat: add fetchPlaylistVideoIds to youtubeDataApi"
```

---

## Task 6: `youtube.ts` — extractYouTubePlaylistId

**Files:**
- Modify: `src/lib/youtube.ts`

**Interfaces:**
- Consumes: ไม่มี (pure function เหมือน `extractYouTubeVideoId` ที่มีอยู่แล้ว)
- Produces: `function extractYouTubePlaylistId(rawUrl: string): string | null`

- [ ] **Step 1: อ่านไฟล์ปัจจุบันเพื่อยืนยันตำแหน่งแทรกโค้ด**

อ่าน `src/lib/youtube.ts` — ฟังก์ชัน `extractYouTubeVideoId` อยู่บรรทัด 1-30 (นับจาก `YOUTUBE_ID_REGEX` ถึง `return null`) เพิ่มฟังก์ชันใหม่ต่อท้ายฟังก์ชันนี้ ก่อน `getYouTubeThumbnail`

- [ ] **Step 2: เพิ่มฟังก์ชัน `extractYouTubePlaylistId`**

แทรกหลังบรรทัด `export function extractYouTubeVideoId(...) { ... }` (ก่อน `export function getYouTubeThumbnail`):

```typescript
export function extractYouTubePlaylistId(rawUrl: string): string | null {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch {
    return null
  }

  const host = url.hostname.replace(/^www\./, '')
  if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'music.youtube.com') {
    return null
  }

  if (url.pathname !== '/playlist') return null
  if (url.searchParams.get('v')) return null // มี video id ร่วมด้วย → ถือเป็นวิดีโอเดี่ยวเสมอ

  return url.searchParams.get('list')
}
```

- [ ] **Step 3: ตรวจ TypeScript compile**

Run: `npm run build`
Expected: ผ่านไม่มี error

- [ ] **Step 4: ทดสอบ manual ผ่าน browser console**

ผ่าน dev server ที่รันอยู่ (import ผ่าน dynamic import ใน console ใช้ยาก ให้ทดสอบ logic ตรงๆ ด้วย regex เทียบเคียงแทน):

```javascript
(function() {
  function test(url) {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    if (host !== 'youtube.com') return null
    if (u.pathname !== '/playlist') return null
    if (u.searchParams.get('v')) return null
    return u.searchParams.get('list')
  }
  console.log(test('https://www.youtube.com/playlist?list=PLxxx')) // ควรได้ 'PLxxx'
  console.log(test('https://www.youtube.com/watch?v=abc&list=PLxxx')) // ควรได้ null
  console.log(test('https://www.youtube.com/watch?v=abc')) // ควรได้ null
})()
```

Expected: ผลลัพธ์ตรงตาม comment ทั้ง 3 บรรทัด

- [ ] **Step 5: commit**

```bash
git add src/lib/youtube.ts
git commit -m "feat: add extractYouTubePlaylistId to youtube.ts"
```

---

## Task 7: `playlist.ts` — ขยาย Episode type

**Files:**
- Modify: `src/types/playlist.ts`

**Interfaces:**
- Produces: `Episode` type มี field ใหม่ `durationSeconds?: number`, `channelTitle?: string`, `channelThumbnail?: string`

- [ ] **Step 1: แก้ไข interface `Episode`**

แทนที่ทั้งไฟล์:

```typescript
export interface Episode {
  id: string
  url: string
  videoId: string
  title: string
  thumbnail: string
  addedAt: number
  durationSeconds?: number
  channelTitle?: string
  channelThumbnail?: string
}

export interface Playlist {
  id: string
  name: string
  episodes: Episode[]
  createdAt: number
}
```

- [ ] **Step 2: ตรวจ TypeScript compile**

Run: `npm run build`
Expected: ผ่านไม่มี error (field เป็น optional ไม่กระทบโค้ดเดิมที่ยังไม่ได้ set ค่าพวกนี้)

- [ ] **Step 3: commit**

```bash
git add src/types/playlist.ts
git commit -m "feat: extend Episode type with duration and channel fields"
```

---

## Task 8: `usePlaylists.ts` — enrichEpisodeMetadata helper + ปรับ addEpisode

**Files:**
- Modify: `src/hooks/usePlaylists.ts`

**Interfaces:**
- Consumes:
  - `fetchVideoDetails(videoId: string): Promise<VideoDetails | null>` (Task 2)
  - `fetchChannelInfo(channelId: string): Promise<ChannelInfo | null>` (Task 3)
  - `extractYouTubeVideoId`, `fetchYouTubeOEmbed`, `getYouTubeThumbnail` (มีอยู่แล้ว)
- Produces: `addEpisode` signature เดิมไม่เปลี่ยน (`(playlistId: string, rawUrl: string) => Promise<string | null>`) แต่ episode ที่สร้างมี `durationSeconds`/`channelTitle`/`channelThumbnail` เติมเข้ามาถ้าดึงสำเร็จ

- [ ] **Step 1: อ่านไฟล์ปัจจุบันทั้งหมด**

ไฟล์ปัจจุบัน (อ้างอิงจาก spec ที่อ่านมาก่อนหน้า) มีโครง:
```typescript
import { useCallback, useState } from 'react'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import type { Episode, Playlist } from '@/types/playlist'
import { extractYouTubeVideoId, fetchYouTubeOEmbed, getYouTubeThumbnail } from '@/lib/youtube'

const STORAGE_KEY = 'podcastery:playlists'

export function usePlaylists() {
  // ...createPlaylist, deletePlaylist เหมือนเดิม ไม่แตะ...

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

  // ...removeEpisode เหมือนเดิม ไม่แตะ...
}
```

- [ ] **Step 2: เพิ่ม import และเขียน helper `buildEpisodeFromVideoId`**

แก้ import บรรทัดบนสุด:

```typescript
import { useCallback, useState } from 'react'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import type { Episode, Playlist } from '@/types/playlist'
import { extractYouTubeVideoId, fetchYouTubeOEmbed, getYouTubeThumbnail } from '@/lib/youtube'
import { fetchVideoDetails, fetchChannelInfo, fetchVideoDetailsBatch, type VideoDetails } from '@/lib/youtubeDataApi'
```

เพิ่ม helper function ก่อน `export function usePlaylists()` (module-level function ไม่ต้องอยู่ใน hook):

```typescript
async function buildEpisodeFromVideoId(videoId: string, rawUrl: string): Promise<Episode> {
  const [dataApiResult, oembedResult] = await Promise.allSettled([
    fetchVideoDetails(videoId),
    fetchYouTubeOEmbed(videoId),
  ])

  const details: VideoDetails | null = dataApiResult.status === 'fulfilled' ? dataApiResult.value : null
  const oembed = oembedResult.status === 'fulfilled' ? oembedResult.value : null

  let channelThumbnail: string | undefined
  if (details?.channelId) {
    const channel = await fetchChannelInfo(details.channelId)
    channelThumbnail = channel?.thumbnail
  }

  return {
    id: crypto.randomUUID(),
    url: rawUrl.trim(),
    videoId,
    title: details?.title ?? oembed?.title ?? `Episode ${videoId}`,
    thumbnail: getYouTubeThumbnail(videoId),
    addedAt: Date.now(),
    durationSeconds: details?.durationSeconds,
    channelTitle: details?.channelTitle,
    channelThumbnail,
  }
}
```

- [ ] **Step 3: แก้ `addEpisode` ให้ใช้ helper ใหม่**

แทนที่ body ของ `addEpisode`:

```typescript
  const addEpisode = useCallback(
    async (playlistId: string, rawUrl: string): Promise<string | null> => {
      const videoId = extractYouTubeVideoId(rawUrl)
      if (!videoId) {
        return 'ลิงก์ YouTube ไม่ถูกต้อง กรุณาวางลิงก์รูปแบบ youtube.com/watch?v=... หรือ youtu.be/...'
      }

      const episode = await buildEpisodeFromVideoId(videoId, rawUrl)
      setPlaylists((prev) =>
        prev.map((p) => (p.id === playlistId ? { ...p, episodes: [...p.episodes, episode] } : p))
      )
      return null
    },
    [setPlaylists]
  )
```

- [ ] **Step 4: ตรวจ TypeScript compile**

Run: `npm run build`
Expected: ผ่านไม่มี error

- [ ] **Step 5: ทดสอบผ่าน browser จริง (เพิ่ม episode จาก URL เดี่ยว)**

เปิด dev server ผ่าน preview tool, คลิกปุ่ม "เพิ่ม Episode", กรอก URL `https://www.youtube.com/watch?v=dQw4w9WgXcQ`, submit

Expected: episode ถูกเพิ่มสำเร็จ, toast "เพิ่ม episode แล้ว" ขึ้น — ตรวจสอบ data ที่เก็บจริงผ่าน `preview_eval`:

```javascript
JSON.parse(localStorage.getItem('podcastery:playlists'))
```

Expected: episode ล่าสุดมี `durationSeconds` เป็นตัวเลข > 0, `channelTitle` มีค่า, `channelThumbnail` เป็น URL รูปภาพ

- [ ] **Step 6: commit**

```bash
git add src/hooks/usePlaylists.ts
git commit -m "feat: enrich addEpisode with Data API duration and channel info"
```

---

## Task 9: `usePlaylists.ts` — addEpisodeFromSearchResult

**Files:**
- Modify: `src/hooks/usePlaylists.ts`

**Interfaces:**
- Consumes: `buildEpisodeFromVideoId` (Task 8), `SearchResultItem` type (Task 4)
- Produces: `async function addEpisodeFromSearchResult(playlistId: string, result: SearchResultItem): Promise<void>` — เพิ่มเข้า return object ของ hook

- [ ] **Step 1: เพิ่ม import `SearchResultItem` type**

แก้บรรทัด import จาก `@/lib/youtubeDataApi` ให้รวม type ใหม่:

```typescript
import { fetchVideoDetails, fetchChannelInfo, fetchVideoDetailsBatch, type VideoDetails, type SearchResultItem } from '@/lib/youtubeDataApi'
```

- [ ] **Step 2: เพิ่มฟังก์ชัน `addEpisodeFromSearchResult` ในตัว hook**

แทรกหลัง `addEpisode` (ก่อน `removeEpisode`):

```typescript
  const addEpisodeFromSearchResult = useCallback(
    async (playlistId: string, result: SearchResultItem) => {
      const rawUrl = `https://www.youtube.com/watch?v=${result.videoId}`
      const episode = await buildEpisodeFromVideoId(result.videoId, rawUrl)
      setPlaylists((prev) =>
        prev.map((p) => (p.id === playlistId ? { ...p, episodes: [...p.episodes, episode] } : p))
      )
    },
    [setPlaylists]
  )
```

- [ ] **Step 3: เพิ่มเข้า return statement ของ hook**

หา `return { playlists, createPlaylist, deletePlaylist, addEpisode, removeEpisode, nowPlaying, setNowPlaying }` แก้เป็น:

```typescript
  return {
    playlists,
    createPlaylist,
    deletePlaylist,
    addEpisode,
    addEpisodeFromSearchResult,
    removeEpisode,
    nowPlaying,
    setNowPlaying,
  }
```

- [ ] **Step 4: ตรวจ TypeScript compile**

Run: `npm run build`
Expected: ผ่านไม่มี error

- [ ] **Step 5: commit**

```bash
git add src/hooks/usePlaylists.ts
git commit -m "feat: add addEpisodeFromSearchResult to usePlaylists"
```

---

## Task 10: `usePlaylists.ts` — importYouTubePlaylist

**Files:**
- Modify: `src/hooks/usePlaylists.ts`

**Interfaces:**
- Consumes: `fetchPlaylistVideoIds` (Task 5), `fetchVideoDetailsBatch` (Task 2, already imported ใน Task 8), `extractYouTubePlaylistId` ไม่ใช้ตรงนี้ (ใช้ใน component)
- Produces: `async function importYouTubePlaylist(playlistId: string, youtubePlaylistId: string, onProgress?: (done: number, total: number) => void): Promise<void>` — throws `Error` เมื่อ fail (ให้ caller จับผ่าน try/catch)

- [ ] **Step 1: เพิ่ม import `fetchPlaylistVideoIds`**

แก้บรรทัด import จาก `@/lib/youtubeDataApi` (เพิ่ม `fetchPlaylistVideoIds` เข้าไปในรายการที่มีอยู่แล้วจาก Task 8/9):

```typescript
import {
  fetchVideoDetails,
  fetchChannelInfo,
  fetchVideoDetailsBatch,
  fetchPlaylistVideoIds,
  type VideoDetails,
  type SearchResultItem,
} from '@/lib/youtubeDataApi'
```

- [ ] **Step 2: เพิ่ม helper `buildEpisodeFromVideoDetails` (สร้าง Episode จาก VideoDetails ที่มีอยู่แล้ว ไม่ fetch ซ้ำ)**

เพิ่มต่อจาก `buildEpisodeFromVideoId` (module-level function):

```typescript
async function buildEpisodeFromVideoDetails(details: VideoDetails): Promise<Episode> {
  const channel = await fetchChannelInfo(details.channelId)
  return {
    id: crypto.randomUUID(),
    url: `https://www.youtube.com/watch?v=${details.videoId}`,
    videoId: details.videoId,
    title: details.title,
    thumbnail: getYouTubeThumbnail(details.videoId),
    addedAt: Date.now(),
    durationSeconds: details.durationSeconds,
    channelTitle: details.channelTitle,
    channelThumbnail: channel?.thumbnail,
  }
}
```

- [ ] **Step 3: เพิ่มฟังก์ชัน `importYouTubePlaylist` ในตัว hook**

แทรกหลัง `addEpisodeFromSearchResult`:

```typescript
  const importYouTubePlaylist = useCallback(
    async (
      playlistId: string,
      youtubePlaylistId: string,
      onProgress?: (done: number, total: number) => void
    ) => {
      const videoIds = await fetchPlaylistVideoIds(youtubePlaylistId)
      if (videoIds.length === 0) {
        throw new Error('ไม่พบวิดีโอใน playlist นี้ หรือ playlist ไม่ใช่สาธารณะ')
      }

      const allDetails = await fetchVideoDetailsBatch(videoIds)
      const episodes: Episode[] = []
      for (let i = 0; i < allDetails.length; i++) {
        const episode = await buildEpisodeFromVideoDetails(allDetails[i])
        episodes.push(episode)
        onProgress?.(i + 1, allDetails.length)
      }

      setPlaylists((prev) =>
        prev.map((p) =>
          p.id === playlistId ? { ...p, episodes: [...p.episodes, ...episodes] } : p
        )
      )
    },
    [setPlaylists]
  )
```

- [ ] **Step 4: เพิ่มเข้า return statement**

```typescript
  return {
    playlists,
    createPlaylist,
    deletePlaylist,
    addEpisode,
    addEpisodeFromSearchResult,
    importYouTubePlaylist,
    removeEpisode,
    nowPlaying,
    setNowPlaying,
  }
```

- [ ] **Step 5: ตรวจ TypeScript compile**

Run: `npm run build`
Expected: ผ่านไม่มี error

- [ ] **Step 6: commit**

```bash
git add src/hooks/usePlaylists.ts
git commit -m "feat: add importYouTubePlaylist to usePlaylists"
```

---

## Task 11: `formatDuration` helper ใน MusicDashboard

**Files:**
- Modify: `src/components/MusicDashboard.tsx`

**Interfaces:**
- Produces: `function formatDuration(totalSeconds: number): string` — คืนรูปแบบ `H:MM:SS` ถ้า >= 1 ชั่วโมง, `M:SS` ถ้าน้อยกว่า

- [ ] **Step 1: เพิ่มฟังก์ชัน `formatDuration` ต่อจาก `formatTime` ที่มีอยู่**

หาบรรทัด:
```typescript
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
```

เพิ่มต่อท้าย:

```typescript
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
```

- [ ] **Step 2: ตรวจ TypeScript compile**

Run: `npm run build`
Expected: ผ่านไม่มี error (ฟังก์ชันยังไม่ถูกเรียกใช้ที่ไหน แต่ไม่มี unused-var error เพราะ `noUnusedLocals` เช็คเฉพาะ local variable ไม่เช็ค top-level function ที่ export — ถ้า error ให้ export ฟังก์ชันนี้ออกไปด้วยเพื่อกัน unused warning)

**หมายเหตุ:** ยังไม่ต้อง commit ใน task นี้ — `formatDuration` ยังไม่ถูกเรียกใช้จริง จะ commit รวมกับ Task 12 ที่นำไปใช้จริงใน JSX เพื่อไม่ให้มี commit ที่โค้ดยังไม่ทำงาน

---

## Task 12: Episode card UI — duration badge + channel row

**Files:**
- Modify: `src/components/MusicDashboard.tsx`

**Interfaces:**
- Consumes: `formatDuration` (Task 11), `episode.durationSeconds`, `episode.channelTitle`, `episode.channelThumbnail` (Task 7)

- [ ] **Step 1: หา JSX ของ episode card ปัจจุบัน**

ในฟังก์ชัน `MusicDashboard`, ส่วน `.map((episode, index) => { ... })` ของ episode grid มีโครงสร้าง:

```tsx
                        <p className="absolute bottom-3 left-3.5 right-3.5 line-clamp-2 text-sm font-semibold leading-tight text-white">
                          {episode.title}
                        </p>
                      </div>
                    )
                  })}
```

- [ ] **Step 2: เพิ่ม duration badge ก่อน title, และ channel row ใต้ title**

แทนที่ block ด้านบนด้วย:

```tsx
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
```

- [ ] **Step 3: ตรวจ TypeScript compile**

Run: `npm run build`
Expected: ผ่านไม่มี error

- [ ] **Step 4: ทดสอบผ่าน browser จริง**

เปิด dev server, ดู episode ที่เพิ่มจาก Task 8 (มี `durationSeconds`/`channelTitle` แล้ว) ผ่าน `preview_screenshot` หรือ `preview_snapshot`

Expected: เห็น duration badge มุมล่างขวาเหนือ title, เห็นชื่อช่อง + avatar ใต้ title ของ episode card

- [ ] **Step 5: commit (รวม Task 11 + 12)**

```bash
git add src/components/MusicDashboard.tsx
git commit -m "feat: show duration badge and channel info on episode cards"
```

---

## Task 13: `AddEpisodeDialog` — restructure เป็น 2 tabs (วาง URL / ค้นหา) + playlist auto-detect

**Files:**
- Modify: `src/components/AddEpisodeDialog.tsx`
- Modify: `src/components/MusicDashboard.tsx` (ปรับ props ที่ส่งเข้า `AddEpisodeDialog`)

**Interfaces:**
- Consumes:
  - `extractYouTubePlaylistId` (Task 6)
  - `addEpisodeFromSearchResult`, `importYouTubePlaylist` (Task 9, 10)
  - `searchVideos`, `SearchResultItem` (Task 4)
- Produces: `AddEpisodeDialogProps` ใหม่:
```typescript
interface AddEpisodeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  playlists: Playlist[]
  defaultPlaylistId?: string | null
  onCreatePlaylist: (name: string) => string
  onAddEpisode: (playlistId: string, url: string) => Promise<string | null>
  onAddEpisodeFromSearchResult: (playlistId: string, result: SearchResultItem) => Promise<void>
  onImportPlaylist: (playlistId: string, youtubePlaylistId: string, onProgress?: (done: number, total: number) => void) => Promise<void>
}
```

- [ ] **Step 1: เขียนไฟล์ `AddEpisodeDialog.tsx` ใหม่ทั้งหมด**

```tsx
import { useState } from 'react'
import { Plus, Search, Loader2 } from 'lucide-react'
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
    setAddingVideoId(null)
    setTab('url')
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
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
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>เพิ่ม Episode</DialogTitle>
          <DialogDescription>
            วางลิงก์ YouTube (วิดีโอหรือ playlist) หรือค้นหาวิดีโอโดยตรง
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => setTab('url')}
            className={cn(
              'flex-1 rounded-md py-1.5 text-sm font-medium transition-colors',
              tab === 'url' ? 'bg-background shadow-sm' : 'text-muted-foreground'
            )}
          >
            วาง URL
          </button>
          <button
            type="button"
            onClick={() => setTab('search')}
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
          <div className="flex flex-col gap-4">
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
              <Button onClick={handleSubmitUrl} disabled={isSubmitting} className="gap-1.5">
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
          <div className="flex flex-col gap-3">
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
              >
                {isSearching ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
              </Button>
            </div>

            <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
              {searchResults.map((result) => (
                <button
                  key={result.videoId}
                  type="button"
                  onClick={() => handlePickSearchResult(result)}
                  disabled={addingVideoId === result.videoId}
                  className="flex items-center gap-3 rounded-lg p-2 text-left text-sm hover:bg-muted disabled:opacity-50"
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
```

- [ ] **Step 2: ตรวจ TypeScript compile**

Run: `npm run build`
Expected: มี error เพราะ `MusicDashboard.tsx` ยังส่ง props เดิม (ยังไม่มี `onAddEpisodeFromSearchResult`/`onImportPlaylist`) — ทำ Step 3 ต่อทันทีในไฟล์เดียวกันก่อน build

- [ ] **Step 3: แก้ `MusicDashboard.tsx` — ปรับ destructure จาก `usePlaylists()` และ props ที่ส่งเข้า dialog**

หาบรรทัด:
```typescript
  const { playlists, createPlaylist, deletePlaylist, addEpisode, removeEpisode } = usePlaylists()
```
แก้เป็น:
```typescript
  const {
    playlists,
    createPlaylist,
    deletePlaylist,
    addEpisode,
    addEpisodeFromSearchResult,
    importYouTubePlaylist,
    removeEpisode,
  } = usePlaylists()
```

หาบรรทัด (ท้ายไฟล์):
```tsx
      <AddEpisodeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        playlists={playlists}
        defaultPlaylistId={selectedPlaylistId}
        onCreatePlaylist={createPlaylist}
        onAddEpisode={addEpisode}
      />
```
แก้เป็น:
```tsx
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
```

- [ ] **Step 4: ตรวจ TypeScript compile**

Run: `npm run build`
Expected: ผ่านไม่มี error

- [ ] **Step 5: ทดสอบผ่าน browser จริง — Tab ค้นหา**

เปิด dev server, คลิกปุ่ม "เพิ่ม Episode", คลิก tab "ค้นหา", พิมพ์ "lofi hip hop", กดปุ่มค้นหา (ไอคอน search)

Expected: แสดงผลลัพธ์เป็น list การ์ด (thumbnail + title + channel), คลิกอันหนึ่ง → toast "เพิ่ม episode แล้ว" ขึ้น, dialog ไม่ปิด (ยังอยู่ที่ tab ค้นหา ตามที่ระบุใน spec §5)

- [ ] **Step 6: ทดสอบผ่าน browser จริง — Import playlist**

ปิด dialog เดิม เปิดใหม่ อยู่ที่ tab "วาง URL" ตามค่าเริ่มต้น, วาง URL playlist สาธารณะที่รู้จัก เช่น `https://www.youtube.com/playlist?list=PLillGF-RfqbYE6Ik_EuXA2iZFcE082B3s`, submit

Expected: เห็นข้อความ "กำลังนำเข้า X/Y" เปลี่ยนค่าไปเรื่อยๆ, จบแล้ว toast "นำเข้า playlist สำเร็จ" ขึ้น, episode ทั้งหมดปรากฏใน playlist grid พร้อม duration/channel

- [ ] **Step 7: ทดสอบ URL ที่มีทั้ง v= และ list= ต้องเป็นวิดีโอเดี่ยว**

วาง URL `https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLillGF-RfqbYE6Ik_EuXA2iZFcE082B3s`, submit

Expected: เพิ่มแค่ 1 episode (วิดีโอเดียว) ไม่ใช่ทั้ง playlist — ตรวจสอบผ่าน `preview_eval`:
```javascript
JSON.parse(localStorage.getItem('podcastery:playlists')).find(p => /* playlist ที่เพิ่งเพิ่ม */)
```

- [ ] **Step 8: commit**

```bash
git add src/components/AddEpisodeDialog.tsx src/components/MusicDashboard.tsx
git commit -m "feat: add search and playlist-import tabs to AddEpisodeDialog"
```

---

## Task 14: Full regression pass — ทดสอบ end-to-end ทุก flow เดิม + ใหม่ร่วมกัน

**Files:** ไม่มีการแก้โค้ด — task นี้คือ verification ล้วนๆ

**Interfaces:** ไม่มี

- [ ] **Step 1: `npm run build` ผ่านสมบูรณ์**

Run: `npm run build`
Expected: ไม่มี TypeScript error, ไม่มี unused import/variable ใดๆ

- [ ] **Step 2: ทดสอบ flow เดิมทั้งหมดยังทำงานถูกต้อง**

ผ่าน preview tools บน dev server ที่รันจริง:
1. เพิ่ม playlist ใหม่พร้อม URL วิดีโอเดี่ยว (tab วาง URL) → สำเร็จ, มี duration+channel
2. เล่น episode → เสียงเล่นจริง, iframe ซ่อนถูกต้อง (เช็ค `display` ไม่ใช่ `none`)
3. Pause/Resume/Skip next/prev → ทำงานถูกต้อง
4. ลบ episode → มี Swal confirm ก่อน, toast หลังลบสำเร็จ
5. ลบ playlist → มี Swal confirm ก่อน, toast หลังลบสำเร็จ
6. วาง URL ผิดรูปแบบ → toast error ขึ้น ไม่เพิ่มรายการ

- [ ] **Step 3: ทดสอบ flow ใหม่ทั้งหมด**

1. Tab ค้นหา: ค้นหาคำที่มีผลลัพธ์แน่นอน, คลิกเพิ่มจากผลลัพธ์ → episode ปรากฏพร้อม duration/channel
2. Tab ค้นหา: ค้นหาคำที่ไม่มีผลลัพธ์ (เช่น สตริงสุ่มไร้ความหมายยาวๆ) → แสดง list ว่างไม่ error
3. วาง playlist URL → progress แสดงผล, episode ทั้งหมดถูกเพิ่ม
4. วาง URL ที่มีทั้ง v= และ list= → เพิ่มแค่วิดีโอเดียว
5. ทดสอบ resilience: ลบ `.env` ชั่วคราว (หรือ comment ค่า `VITE_YOUTUBE_API_KEY` แล้ว restart dev server) → เพิ่ม episode จาก URL เดี่ยวยังสำเร็จ (fallback oEmbed, ไม่มี duration/channel) แต่ tab ค้นหากดค้นหาแล้วต้องขึ้น error toast "ยังไม่ได้ตั้งค่า YouTube API Key" — เสร็จแล้วคืนค่า `.env` กลับ

- [ ] **Step 4: ทดสอบ reload persistence**

`preview_eval`: `location.reload()` แล้วตรวจว่า playlist/episode ทั้งหมด (รวมที่มี duration/channel) ยัง persist อยู่ใน localStorage และแสดงผลถูกต้องหลัง reload

- [ ] **Step 5: สรุปผลและรายงานพี่เอิร์ธ**

ถ้าทุกข้อผ่าน → แจ้งพี่เอิร์ธว่างานเสร็จสมบูรณ์ พร้อมสรุปสิ่งที่ทำทั้งหมด
ถ้ามีข้อไหนไม่ผ่าน → กลับไปแก้ไข task ที่เกี่ยวข้อง แล้ววนกลับมาทดสอบ Task 14 ใหม่ทั้งหมดอีกครั้ง (ไม่ข้ามขั้นตอนใด)
