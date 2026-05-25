# Filebrew — local media converter by [Code Crunch Labs](https://codecrunchlabs.vercel.app)

> Open-source local media converter. Drag a video or image into your browser, get **MP4 · WebM · MOV · MKV · GIF · MP3 · M4A · WAV · FLAC · JPG · PNG · WebP · AVIF · BMP · TIFF** out. Image resizing built in. Everything runs on your machine — no upload to the cloud, no account, no quotas, no watermarks.

Built on Node.js + [ffmpeg](https://ffmpeg.org/). MIT-licensed.

---

## Two converters in one app

Open `http://localhost:3000` and pick one:

| Converter | URL | What it does |
|---|---|---|
| **Video & Audio** | `/video` | Convert videos to MP4 / WebM / MOV / MKV / GIF, or extract audio to MP3 / M4A / WAV / FLAC. |
| **Image** | `/image` | Convert images to JPG / PNG / WebP / AVIF / BMP / TIFF, with optional resize (thumbnail · small · medium · large · custom px). Aspect ratio is preserved automatically. |

---

## Fork this repo

This is open source under the MIT license — **fork it**, change it, ship it. The whole thing is ~600 lines of vanilla Node + HTML with zero npm dependencies, so there's nothing to learn before hacking on it.

```sh
# on github.com, click "Fork" in the top-right, then:
git clone https://github.com/CODE-CRUNCH-LABS/Filebrew
cd localvid-1
```

PRs welcome.

---

## Install

You need **Node.js 16+** and **ffmpeg + ffprobe** on your `PATH`.

### macOS

```sh
brew install node ffmpeg
```

If you don't have Homebrew yet: https://brew.sh — one-line install.

### Windows

Easiest path via [winget](https://learn.microsoft.com/en-us/windows/package-manager/winget/) (preinstalled on Windows 10/11):

```powershell
winget install OpenJS.NodeJS
winget install Gyan.FFmpeg
```

Alternatively download installers from [nodejs.org](https://nodejs.org/) and [ffmpeg.org](https://ffmpeg.org/download.html). For ffmpeg, extract the ZIP and add the `bin/` folder to your `PATH` (Search → "Edit the system environment variables" → Environment Variables → edit `Path`).

Verify both work in a new terminal:
```powershell
node --version
ffmpeg -version
```

### Linux

```sh
# Debian / Ubuntu
sudo apt update && sudo apt install -y nodejs npm ffmpeg

# Fedora / RHEL
sudo dnf install -y nodejs ffmpeg

# Arch
sudo pacman -S nodejs npm ffmpeg
```

---

## Run

```sh
git clone https://github.com/CODE-CRUNCH-LABS/Filebrew
cd localvid-1
npm start
```

Open **http://localhost:3000** in your browser (Chrome / Safari / Firefox / Edge — any modern browser works). Pick **Video & Audio** or **Image** from the landing page.

That's it. There's no build step, no `npm install` (the project has zero dependencies), no database.

To stop: press `Ctrl+C` in the terminal where the server is running.

---

## Open it in your IDE

Most editors just need you to point them at the cloned folder. No project-specific extensions or settings are required — there's no build step, no linter config, no TypeScript. Edit `server.js` or any `.html` file, then refresh the browser.

| Editor | How |
|---|---|
| **VS Code** | `code localvid-1` (or `File → Open Folder…`) |
| **Cursor** | `cursor localvid-1` (or `File → Open Folder…`) |
| **JetBrains** (WebStorm / IntelliJ) | `File → Open…` → select the folder |
| **Sublime Text** | `subl localvid-1` (or `File → Open…`) |
| **Neovim / Vim** | `cd localvid-1 && nvim .` |
| **Anything else** | Just open the folder — it's all vanilla files |

**On VS Code:** if the `code` shell command isn't found, open VS Code → `⌘⇧P` (Mac) / `Ctrl+Shift+P` (Win/Linux) → search **"Shell Command: Install 'code' command in PATH"**.

**On Cursor:** same procedure via `Cmd/Ctrl+Shift+P` → **"Shell Command: Install 'cursor' command"**.

---

## How to use it

### Method 1 — Browser (drag-and-drop)

1. Open http://localhost:3000 and pick **Video & Audio Converter** or **Image Converter**.
2. *(Image only)* Pick a resize option at the top — Original, Thumbnail (200 px), Small (480 px), Medium (800 px), Large (1920 px), or Custom.
3. **Drag** a file from your file explorer onto the colored format pill of the output you want (e.g. drag a `.mov` onto **MP4**, or a `.png` onto **WebP**).
4. Alternatively **click** any format pill to open your computer's file picker.
5. Watch the **Processing** panel — upload progress → conversion progress → done.
6. The converted file appears in **Library** and plays / previews in the right pane when clicked.

### Method 2 — Drop into a watched folder

For batch conversions without opening the browser, drop files into these folders (auto-created on first run inside `data/`):

| Drop file here | Gets converted to | Output ends up in |
|---|---|---|
| `data/videos-to-convert/` | MP4 (browser-safe H.264 + AAC) | `data/converted/mp4/` |
| `data/audio-to-extract/`  | MP3 (192 kbps)                  | `data/converted/mp3/` |
| `data/images-to-convert/` | JPG (high quality, original size) | `data/converted/jpg/` |

A polling watcher checks every second; once a file's size has been stable for 3 seconds (so partial copies are never touched), it's queued for conversion.

For non-default formats (WebM, MOV, GIF, M4A, AVIF, etc.) or image resizing, use the browser UI.

---

## How it works

```
┌─────────────────────────┐
│ Browser (Chrome/Safari) │
│  drag → upload XHR      │◀────── streams converted file
└──────────┬──────────────┘             (HTTP range requests)
           │                                   ▲
           │   POST /api/upload                │
           │   (file body, no multipart)       │
           ▼                                   │
┌─────────────────────────────────────────────┴───────┐
│ Node server (server.js · single file · 0 npm deps)  │
│                                                     │
│   ┌─────────────┐   ┌───────────────┐               │
│   │ 1s watcher  │──▶│  job queue    │──▶ spawn      │
│   │ on drop dirs│   │  (serial,     │    ffmpeg /   │
│   └─────────────┘   │   one job at  │    ffprobe    │
│                     │   a time)     │               │
│                     └───────────────┘               │
└─────────────────────────────────────────────────────┘
                            │
                            ▼
                ┌─────────────────────────┐
                │ data/converted/<format>/│
                └─────────────────────────┘
```

**Key decisions:**

- **Zero npm dependencies.** Everything uses Node built-ins (`http`, `fs`, `path`, `child_process`). One `git clone` and `npm start` — no `npm install` needed.
- **Folder watcher uses polling, not `fs.watch`.** `fs.watch` behaves differently on macOS, Windows, and Linux (recursive vs. flat, event coalescing, etc.). A 1 Hz poll is boring and works identically on every OS.
- **3-second size stability check** before processing. Catches partially-copied or actively-recording files without ever touching them.
- **H.264 sources are remuxed (`-c copy`)** when targeting MP4 or MOV. This skips the slow re-encode and finishes in seconds even for multi-GB files. HEVC/other codecs transcode to H.264 + AAC for cross-browser playback.
- **Image resize** uses ffmpeg's `scale` filter with `force_original_aspect_ratio=decrease`-style math, so the longest edge becomes the requested size and the other edge shrinks proportionally.
- **Range-request streaming** so the browser's `<video>` element can seek into multi-GB files without downloading them in full.
- **One conversion at a time.** Avoids thrashing CPU. Multiple uploads queue up and process in order.

---

## Where files are stored

Everything lives under a single `data/` folder (auto-created on first run, or wherever you point `DATA_DIR=`):

```
data/
├── conversions.log           append-only text log of every conversion
│
├── videos-to-convert/        ── drop folder (default → MP4)
├── audio-to-extract/         ── drop folder (default → MP3)
├── images-to-convert/        ── drop folder (default → JPG)
│
├── uploads/                  ── staging for browser uploads (auto-cleaned)
│   ├── mp4/    webm/   mov/   mkv/   gif/
│   ├── mp3/    m4a/    wav/   flac/
│   └── jpg/    png/    webp/  avif/  bmp/   tiff/
│
└── converted/                ── all output files
    ├── mp4/    webm/   mov/   mkv/   gif/     ← video
    ├── mp3/    m4a/    wav/   flac/           ← audio
    └── jpg/    png/    webp/  avif/  bmp/   tiff/   ← image
```

The default `data/` directory is inside the project folder. **Override it** with the `DATA_DIR` environment variable if you want files on an external drive:

```sh
# macOS / Linux
DATA_DIR=/Volumes/ExternalDrive/converter npm start

# Windows (PowerShell)
$env:DATA_DIR="D:\converter"; npm start
```

Resized images get a `-<size>px` suffix appended (e.g. `photo-800px.jpg`) so different sizes of the same source can coexist.

---

## Supported formats

### Output

| Format | Kind | Codec | Notes |
|---|---|---|---|
| MP4 | video | H.264 + AAC | Remuxes if source is already H.264. Universal browser support. |
| WebM | video | VP9 + Opus | Open standard, smaller files. Slower to encode. |
| MOV | video | H.264 | QuickTime container. |
| MKV | video | source | Pure container change (`-c copy`). |
| GIF | video | — | 12 fps, 480 px wide, palette-optimized. |
| MP3 | audio | LAME | 192 kbps, strips video. |
| M4A | audio | AAC | 192 kbps, strips video. |
| WAV | audio | PCM 16-bit | Lossless, large files. |
| FLAC | audio | FLAC | Lossless, compressed. |
| JPG | image | mjpeg | High quality (q:v 2). |
| PNG | image | png | Lossless. |
| WebP | image | webp | Quality 80, compression 6. |
| AVIF | image | libaom-av1 | Newest format, best compression. Requires ffmpeg built with libaom. |
| BMP | image | bmp | Uncompressed. |
| TIFF | image | tiff | Archival quality. |

### Input

Accepts everything ffmpeg can read, including:

- **Video:** `.mp4 .mov .webm .mkv .avi .m4v .flv .wmv .3gp .ts`
- **Audio:** `.mp3 .m4a .wav .aac .flac .ogg .opus .wma`
- **Image:** `.jpg .jpeg .png .webp .avif .gif .bmp .tif .tiff .heic .heif`

---

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port the server listens on |
| `DATA_DIR` | `./data` | Root of all input/output/log files |

---

## Limitations

- **WebM and AVIF encoding are slow.** VP9 and AV1 produce smaller, higher-quality output but take much longer than H.264. Use MP4 / WebP / JPG if speed matters more than file size.
- **HEVC video sources** require transcoding (not remuxing) to MP4/MOV because Chrome and Firefox don't decode HEVC. Transcoding is significantly slower than remuxing — expect minutes per minute of source.
- **One conversion at a time.** Jobs run serially. Multiple uploads queue up; large queues take a while.
- **Browser uploads land on disk first** at `data/uploads/<format>/`, then convert. For multi-GB videos the folder workflow avoids the upload-then-convert round-trip.
- **No authentication.** The server binds to `localhost` by default. If you change `PORT` to expose it on a LAN, anyone on the network can upload and convert.

---

## License

MIT — see [LICENSE](LICENSE). © 2026 [Code Crunch Labs](https://codecrunchlabs.vercel.app).

ffmpeg is a separate project licensed under LGPL / GPL (depending on how it's built). This project never bundles ffmpeg — users install their own — so this project itself stays MIT.

---

Made by **[Code Crunch Labs](https://codecrunchlabs.vercel.app)**. Fork it and make it yours.
