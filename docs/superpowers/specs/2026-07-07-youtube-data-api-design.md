# YouTube Data API v3 Integration — Design

## Context

Podcastery ปัจจุบันใช้ YouTube สองทางที่ไม่ต้องใช้ API key: **oEmbed** (ดึง title ตอนเพิ่ม episode จาก URL) และ **IFrame Player API** (เล่นเสียงจริง) ทั้งสองอยู่ใน [youtube.ts](../../../src/lib/youtube.ts) และ [YouTubePlayer.tsx](../../../src/components/YouTubePlayer.tsx)

พี่เอิร์ธต้องการอัปเกรดให้ใช้ **YouTube Data API v3** (ต้องมี API key, มี quota จำกัด) เพิ่มเพื่อดึง:
1. ความยาววิดีโอจริง (duration)
2. ดึงทั้ง YouTube playlist มาเป็น episode ในครั้งเดียว
3. ชื่อ + avatar ของช่อง (channel)
4. ค้นหาวิดีโอจาก YouTube ได้ในแอปเลย โดยไม่ต้องออกไปคัด URL เอง

API key ที่พี่เอิร์ธให้มาจะเก็บใน `.env` (ไม่ commit เข้า git) ใช้แบบ client-side ตรงๆ (ยังไม่มี backend) — พี่เอิร์ธรับทราบความเสี่ยงและจะตั้ง HTTP referrer restriction ที่ Google Cloud Console เอง

## Non-goals

- ไม่ sync playlist กับ YouTube ต่อเนื่อง — import ครั้งเดียวตอนนำเข้า เก็บผลลัพธ์ใน localStorage แบบเดิม ไม่มีการ refresh อัตโนมัติ
- ไม่ทำ backend proxy สำหรับ API key ในเวอร์ชันนี้
- ไม่ implement OAuth — ใช้ API key แบบ public data เท่านั้น (search, videos, playlistItems, channels — ทั้งหมดเป็น public endpoints)

## Architecture

### 1. Foundation

- **Env var**: `VITE_YOUTUBE_API_KEY` ใน `.env` (เพิ่ม `.env` เข้า `.gitignore` ถ้ายังไม่มี, สร้าง `.env.example` ที่มีแค่ key name ว่างเป็น template ให้ commit ได้)
- **ไฟล์ใหม่**: `src/lib/youtubeDataApi.ts` — แยกจาก `youtube.ts` เดิมชัดเจน (เดิม = ไม่ใช้ key, ใหม่ = ต้องใช้ key)
- Base URL: `https://www.googleapis.com/youtube/v3`
- ทุกฟังก์ชันคืนค่าแบบ `Promise<T | null>` เมื่อ fail (network error, quota exceeded, invalid key) — ไม่ throw ให้ component ต้อง try/catch เอง สอดคล้องกับ pattern ของ `fetchYouTubeOEmbed` เดิม ยกเว้น `searchVideos` ที่ user กดค้นหาเอง ต้องแสดง error ให้เห็นชัดเจนผ่าน `notifyError` (toast) เพราะ user รอผลอยู่

```ts
// src/lib/youtubeDataApi.ts
export interface VideoDetails {
  videoId: string
  title: string
  channelId: string
  channelTitle: string
  durationSeconds: number
  thumbnail: string
}

export interface ChannelInfo {
  channelId: string
  title: string
  thumbnail: string
}

export interface SearchResultItem {
  videoId: string
  title: string
  channelTitle: string
  thumbnail: string
}

export async function fetchVideoDetails(videoId: string): Promise<VideoDetails | null>
export async function fetchVideoDetailsBatch(videoIds: string[]): Promise<VideoDetails[]>  // videos.list รับได้สูงสุด 50 id/ครั้ง
export async function fetchChannelInfo(channelId: string): Promise<ChannelInfo | null>
export async function searchVideos(query: string): Promise<SearchResultItem[] | null>
export async function fetchPlaylistVideoIds(playlistId: string): Promise<string[] | null>  // เดิน pagination ทุกหน้า (50/หน้า)
```

- Parse ISO-8601 duration (`PT1H2M3S`) → seconds ด้วย regex เล็กๆ ในไฟล์เดียวกัน ไม่ต้องพึ่ง library ภายนอก

### 2. Data Model

เพิ่ม field ให้ `Episode` ใน [playlist.ts](../../../src/types/playlist.ts):

```ts
export interface Episode {
  id: string
  url: string
  videoId: string
  title: string
  thumbnail: string
  addedAt: number
  // ใหม่ — optional เพราะอาจดึงไม่สำเร็จ (quota/network) โดยไม่บล็อกการเพิ่ม episode
  durationSeconds?: number
  channelTitle?: string
  channelThumbnail?: string
}
```

### 3. `usePlaylists` hook — ปรับ `addEpisode`

`addEpisode(playlistId, rawUrl)` เดิมเรียก `extractYouTubeVideoId` + `fetchYouTubeOEmbed` แล้วสร้าง episode ทันที ปรับ flow ใหม่:

1. `extractYouTubeVideoId(rawUrl)` เหมือนเดิม — ถ้า `null` ให้ตรวจต่อว่าเป็น playlist URL หรือไม่ (ดู §5)
2. เรียก `fetchVideoDetails(videoId)` (Data API) **ควบคู่** กับ `fetchYouTubeOEmbed(videoId)` (oEmbed เดิม) ผ่าน `Promise.allSettled` — ถ้า Data API สำเร็จ ใช้ title/duration/channelTitle จากตรงนั้นเป็นหลัก (แม่นกว่า), ถ้า Data API fail (ไม่มี key, quota หมด) fallback ไปใช้ oEmbed title เหมือนเดิมทุกประการ — **ระบบต้องเพิ่ม episode ได้เสมอแม้ Data API ล่มทั้งหมด**
3. ถ้าได้ `channelId` จาก Data API มา → เรียก `fetchChannelInfo(channelId)` เพิ่มเพื่อ avatar (fire-and-forget ไม่ block การเพิ่ม episode — ถ้า fail แค่ไม่มี avatar)
4. เพิ่มฟังก์ชันใหม่ `addEpisodeFromSearchResult(playlistId, result: SearchResultItem)` — ใช้ตอนเลือกจากผลค้นหา (มี videoId อยู่แล้ว ไม่ต้อง parse URL) เรียก flow เดียวกับข้อ 2-3 ต่อ
5. เพิ่มฟังก์ชันใหม่ `importYouTubePlaylist(playlistId, youtubePlaylistId, onProgress?)` — เรียก `fetchPlaylistVideoIds` แล้ว batch เรียก `fetchVideoDetailsBatch` (50 id/ครั้ง) สร้าง episodes ทั้งหมดต่อคิวเข้า playlist เดียว, เรียก `onProgress(done, total)` callback ระหว่างทางให้ UI แสดง progress

### 4. `youtube.ts` เดิม — เพิ่ม playlist ID parsing

เพิ่มฟังก์ชันใหม่ (ไม่แก้ของเดิม):

```ts
export function extractYouTubePlaylistId(rawUrl: string): string | null
```

รองรับ `youtube.com/playlist?list=PLxxxx` **เท่านั้น** (ไม่มี `v=` ร่วมด้วย) — ตามที่ยืนยันแล้วว่า URL ที่มีทั้ง `v=` และ `list=` พร้อมกัน (เช่น กดวิดีโอจากใน playlist) ให้ตีความเป็นวิดีโอเดี่ยวเสมอ ไม่ใช่ playlist

### 5. `AddEpisodeDialog` — ปรับเป็น 3 แท็บ

โครง: playlist selector (เลือก/สร้างใหม่) ใช้ร่วมกันบนสุดเหมือนเดิม ด้านล่างเป็น tab bar:

**Tab "วาง URL"** (ของเดิม): ช่อง input วาง URL เดียว — ตอน submit ให้เช็คก่อนว่าเป็น playlist URL ล้วน (`extractYouTubePlaylistId`) หรือ video URL (`extractYouTubeVideoId`); ถ้าเป็น playlist → เรียก `importYouTubePlaylist` แทน `addEpisode` และแสดง progress ("กำลังนำเข้า 12/50") ใน footer ของ dialog แทนปุ่ม submit ชั่วคราว

**Tab "ค้นหา"** (ใหม่): input + ปุ่มค้นหา (ไม่ debounce/auto-search — กดปุ่มเท่านั้น เพราะ search.list cost 100 units/ครั้ง) → เรียก `searchVideos(query)` → แสดงผลใน scroll list การ์ดเล็ก (thumbnail 16:9 + title + channelTitle) → คลิกอันไหนเรียก `addEpisodeFromSearchResult` ทันที พร้อม toast success/error, ไม่ปิด dialog ทันทีหลังเพิ่ม (เผื่อ user อยากเพิ่มหลายอันจากผลค้นหาเดียวกัน) — ปิดเองด้วยปุ่ม X

ไม่มี Tab แยกสำหรับ "นำเข้า Playlist" — รวมเข้ากับ Tab "วาง URL" โดย auto-detect ตามที่อธิบายด้านบน ลด UI ที่ต้องเรียนรู้

### 6. UI แสดงผล — Duration + Channel

**Episode grid card** ([MusicDashboard.tsx](../../../src/components/MusicDashboard.tsx)):
- Duration badge มุมล่างขวาของ thumbnail: `bg-black/70 text-white text-[11px] font-medium px-1.5 py-0.5 rounded-md` แสดงรูปแบบ `H:MM:SS` หรือ `M:SS` (ใช้ `formatTime` ที่มีอยู่แล้ว ปรับให้รองรับชั่วโมง)
- ใต้ title (บรรทัดใหม่เล็กๆ): channel avatar วงกลม 16px + channelTitle สีขาว/80 — ถ้าไม่มีข้อมูล (fetch fail) ให้ซ่อนทั้งแถวไปเลย ไม่โชว์ placeholder ว่างๆ

## Error & Quota Handling

- `youtubeDataApi.ts` เช็ค HTTP status: `403` (quota exceeded/key invalid) → คืน `null` จากฟังก์ชัน fetch เดี่ยวๆ, แต่ `searchVideos`/`importYouTubePlaylist` ที่ user รอผลอยู่ต้องโยน error message ที่อ่านง่ายกลับไปแสดงผ่าน `notifyError`: "โควต้า YouTube API หมดสำหรับวันนี้ ลองใหม่พรุ่งนี้ หรือวาง URL แทนการค้นหา"
- ไม่มี retry logic อัตโนมัติ — ให้ user กดใหม่เอง

## Testing / Verification

1. ตั้ง `.env` จริงด้วย key ที่พี่เอิร์ธให้มา, รัน dev server
2. เพิ่ม episode จาก URL เดี่ยว → เช็ค duration badge + channel avatar ขึ้นถูกต้อง
3. ค้นหาคำที่รู้ผลลัพธ์แน่นอน (เช่น "lofi hip hop") → เช็คแสดงผล, คลิกเพิ่มจากผลค้นหา
4. วาง playlist URL (`youtube.com/playlist?list=...`) → เช็ค progress + episodes ทั้งหมดถูกเพิ่มเข้า playlist เดียว พร้อม duration/channel ครบ
5. วาง URL ที่มีทั้ง `v=` และ `list=` → เช็คว่าเพิ่มแค่วิดีโอเดียว ไม่ใช่ทั้ง playlist
6. ทดสอบ key ผิด/ลบ `.env` ชั่วคราว → เช็คว่าเพิ่ม episode จาก URL เดี่ยวยังทำงานได้ (fallback ไป oEmbed) แต่ค้นหา/import playlist แสดง error toast ที่เข้าใจง่าย
7. `npm run build` ผ่านไม่มี type error
