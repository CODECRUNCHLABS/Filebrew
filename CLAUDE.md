# Filebrew — Claude Code instructions

Claude Code auto-loads this file at session start. Anything `@`-imported
below is pulled into context alongside it.

## Stack

Vanilla Node.js HTTP server + plain HTML/CSS/JS. **No build step. No
dependencies.** Server is `server.js`; pages are `landing.html`,
`video.html`, `image.html`. Media work is done by `ffmpeg` / `ffprobe`
shelled out via `child_process.spawn` (always with an arg array, never
through a shell).

## Product positioning

Filebrew is a **local** converter. The pitch is *"no upload to the cloud,
no quotas, no watermarks — runs on your machine."* Do not suggest moving
processing to serverless / cloud functions; that breaks the product. The
docs site on Vercel is the marketing page only.

## Design conventions

@UX-GUIDE.md

## Development guide

The deeper development, deployment, and configuration guide is private and
lives in [`ba-00001/projectguidefordev`](https://github.com/ba-00001/projectguidefordev)
under the `filebrew/` folder. See `DEVELOPER.md`.
