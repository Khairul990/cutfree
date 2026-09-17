# Changelog

All notable changes to CutFree are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/).

## [1.0.0] — 2026-09-17

### Added
- **Trim:** drag either handle on a timeline clip to set in/out points, with live preview.
- **Split:** split the clip at the playhead with the button or the `S` key.
- **Join:** add several videos and export them as a single video, audio included.
- **Per-clip mute** plus reorder and delete controls on every timeline card.
- **Canvas + MediaRecorder export pipeline** drawn frame by frame at 30 fps, with a real
  progress bar, per-clip status, cancel, and an auto-download when finished.
- **Export presets:** 480p / 720p / 1080p / source resolution (never upscaled),
  three quality levels (small / balanced / high) and MP4 / WebM / auto format selection.
- **Bilingual UI** (বাংলা + English) with the choice remembered in `localStorage`.
- **Sample clip generator** so the editor can be tried without any local video file.
- **Single-file build** (`npm run build` → `cutfree.html`) with CSS, JS and logo inlined.
- **25-check Playwright end-to-end test suite** (`npm test`, `PAGE=cutfree.html npm test`).
- Docker + GitHub Pages deployment, MIT license, contributing guide.

### Notes
- Export runs in real time (a 3-minute video takes about 3 minutes); that is the trade-off
  that removes the need for a server or a subscription.
- MP4 output depends on the browser: Chrome/Edge record MP4 (H.264/AAC), Firefox usually WebM.
