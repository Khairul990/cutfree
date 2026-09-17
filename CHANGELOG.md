# Changelog

All notable changes to CutFree are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/).

## [2.0.0] — 2026-09-17

The release that turned CutFree into a **video factory**: a script goes in, a
finished, music-scored, YouTube-ready video comes out — still with zero servers.

### Added — CutFree Studio (`studio.html`)
- **Auto-director:** reads a plain-text script, splits it into beats, classifies
  them (kinetic text / bullet list / stat / quote / b-roll / outro), times every
  scene to narration pace and picks theme + music mood deterministically.
- **Deterministic motion-graphics renderer** (`renderAt(t)`): preview and export
  are pixel-identical, and any frame can be re-rendered for thumbnails.
- **Colour-blended grade:** layered aurora blobs, ribbons, particles, shine,
  vignette and animated film grain composited with screen / lighter / overlay /
  color-dodge, plus 8 curated themes and per-scene camera push.
- **Kinetic typography** with word-by-word reveals, gradient fills, shimmer
  sweeps and an auto-fit engine (long Bengali or English copy is measured and
  scaled until it fits the safe area — never clips).
- **Procedural music engine:** pads, bass, arpeggio, drums, reverb and impacts
  synthesised in `OfflineAudioContext` (100% copyright-free), driving the visuals
  through a normalised energy profile; optional voice-over with auto-ducking.
- **Own WebM/EBML muxer** (~300 lines) so the WebCodecs VP9 + Opus chunks become a
  real file with no dependency, CDN or wasm.
- **Two encode engines behind one API:** WebCodecs fast path (GPU, non-real-time)
  and a `captureStream(0)` + `requestFrame()` paced MediaRecorder compat path that
  can also emit MP4.
- **Publish kit:** thumbnail renderer (from the same frames), `metadata.json`,
  `chapters.txt`, `descriptions.txt`, a `player.html`, and a **living HTML** export
  that animates with no video file at all.
- **Batch mode:** `---`-separated scripts render the whole queue one after another,
  each with its own scheduled `publishAt` date.
- **YouTube tooling:** in-browser resumable upload (user's own OAuth client) plus
  `tools/yt-upload.mjs` — a zero-dependency CLI using device-flow OAuth, chunked
  resumable upload, thumbnail set, upload memory, and quota-aware stopping (6 free
  uploads/day).

### Changed
- Single-file build now covers both pages (`cutfree.html`, `cutfree-studio.html`).
- Editor header links to the studio; `package.json` grew studio scripts and the
  multi-suite test runner.

### Performance
- Blended background layers render at 30–38% of the output resolution and are
  upscaled; glow sprites are baked once; the vignette moved onto the small canvas;
  the layer round-trip is skipped outside transitions.
- Per-frame cost dropped from ~20.3 ms to ~12.4 ms at 720p (high) and ~26.7 ms at
  1080p, with a Balanced/Fast dial for phones and long renders.

### Tests
- New `tests/studio.e2e.js` (43 checks): director, music audibility + energy
  normalisation, renderer determinism, a real WebCodecs→muxer→playable-file
  round-trip (VP9 + Opus, duration and resolution verified), the compat path, the
  publish kit and the two-video batch UI.

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
