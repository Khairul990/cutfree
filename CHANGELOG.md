# Changelog

All notable changes to CutFree are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/).

## [2.2.0] — 2026-09-17

**Story Mode** — write the story, hand over the voice, get a staged video. Still zero-cost,
still entirely client-side: the voice alignment is a plain VAD + weighted assignment in the
browser, no API, no upload.

### Added — voice alignment (`js/studio/align.js`)
- `CFX.align.analyse(audio)` — 30 ms RMS windows / 10 ms hop, percentile noise floor,
  hysteresis → `{phrases, gaps, envelope, noiseFloor, threshold, speechRatio, speechTime, usable}`.
  Silence grading: `usable` needs ≥2 phrases and >0.8 s of speech.
- `words(text, para)` — Bengali matra/weight aware (`দণ্ড` 0.34 s, comma 0.17 s), then
  `assignWords` / `groupParagraphs` / `chooseRuns` (DP) place every word inside the phrase
  that actually speaks it, anchored to the phrase's spoken end — **silence is never filled
  with text** (verified against a 1.7 s pause).
- `track(audio, script, opts)` → `{words, paragraphs, cues, phrases, analysis, estimated}`;
  graceful fallbacks `{estimated: true, reason: 'empty-script' | 'no-phrases' | 'too-little-speech'}`.
  Also `proportional()` (text-paced), `shiftFrom`, `retime`, `toMono`, `percentile`.
- `CFX.captions.clampTo(cues, duration)` — trims cues to the video length without rescaling
  (voice-tracked cues must never be re-fitted).

### Added — story planner (`js/studio/story.js`)
- `CFX.story.plan({title, script, track|timings, kicker, subtitle, endCard, cta, style, …})` →
  a normal CutFree spec: `storyTitle` (2.4–4.6 s) → one scene per paragraph
  (`reveal` / `typewriter` / `board` / `stack`, ≤11 BN / 12 EN words or 5.2 s, scene-relative
  word times + `emphasis`) → `storyBeat` cards on real pauses → `storyEnd` + CTA.
- **Continuous timeline:** scenes are back-to-back (`lead .20`, `trail .30`, bodies absorb a
  short breath, a pause ≥ `beatPauseSeconds` becomes a beat card `min(gap, 3.2 s)`) — no black
  gaps, and `meta.drift` reports how far any line sits from the voice.
- `meta.voiceStart` shifts every body word and every caption by the title card's length;
  `metadata()` writes a story description with chapters + tags; `sentences`, `labelOf`,
  `emphasisFor`, `resolution`, `seedOf` helpers.
- Story text scenes carry `caption: false` — the line on screen *is* the caption (no duplicate
  bar); imported/edited cues keep their bar.

### Added — renderer (`js/studio/engine.js`)
- `storyTitle` / `story` / `storyQuote` / `storyList` / `storyBeat` / `storyEnd` scene types:
  word-by-word rise, typewriter caret, storybook panel with progress rule, teleprompter stack,
  beat dots, end-card CTA — all painted from `ctx.__cfxTheme` with accent gradients.
- `drawKinetic` now takes `{times, time, activeIdx, activeStyle, hard, emphasis}` for exact sync.

### Added — workbench (`studio.html`, `js/studio/ui.js`, `css/studio.css`)
- Panel ২ · স্টোরি: story toggle, typography style, kicker, end card, voice drop-zone,
  auto-track after a voice file (or a TTS capture), and an **align timeline**: waveform
  envelope, caption bars, paragraph ticks, playhead, line chips with start times —
  click anywhere on it to jump the audio there (`seekAudio`).
- `#fStory` forces karaoke captions, auto-tracks the dropped voice and toasts when there is
  none; story fields + the track are part of project save/load; a typed title wins over the
  auto title; the story description/timeline feed the YouTube kit.

### Tests
- `tests/studio.e2e.js`: **107 checks** — new §4i (voice tracking: phrase onsets, silence
  untouched, determinism, silent-audio fallback), §4j (story plan: scene types, beat card,
  frame-changing reveal, cue shift, 9:16 safe zone, caption rule, text-paced fallback),
  §4k (mixer `voiceStart` offset) and §4l (full UI flow: WAV drop → auto-track → plan →
  preview play → SRT export → back to classic mode).

## [2.1.0] — 2026-09-17

Voice-over, burned-in subtitles, Shorts, projects and offline — all still zero-cost
and client-side. Everything below runs in the browser: no API keys, no uploads, no server.

### Added — voice-over (`js/studio/voice.js`, panel ৩)
- **TTS voice picker** (system `speechSynthesis`, language-aware, Bengali voices flagged),
  rate 0.6–1.6× and a one-line voice test.
- **Word-accurate timing** from `SpeechSynthesisUtterance.onboundary`; `measure()`
  returns `{segments, duration, estimated}`. No voices / blocked synthesis falls back to
  `estimatedTimings()` — the UI says “টাইমিং অনুমান করা হয়েছে” and carries on.
- **In-browser voice-over capture:** `getDisplayMedia({audio})` + `MediaRecorder` records
  the tab (i.e. the TTS narration) into one buffer, trimmed to the real start offset and
  mixed with the soundtrack using the existing automatic ducking.
- **`director.fitToNarration(spec, timings)`** — scene lengths follow the measured
  narration (pad 0.35 s, floor 1.4 s) with an opt-out checkbox.

### Added — subtitles (`js/studio/captions.js`)
- `parse()` for **SRT/WebVTT** (tags stripped, multi-line cues, comma or dot ms),
  `build()` for **SRT export** (42-char wrap, sane timestamps), `fromWords()`,
  `estimateWords()`, `shift()`, `fitTo()`, `cueAt()`, `plainText()`.
- **Burn-in renderer** in `engine.js`: dark plate + gradient border, **karaoke**
  word-by-word highlight or a simple bar, placed above the safe-area bottom.
- UI: **SRT/VTT import**, **SRT export** (imported cues win), caption style select
  (`karaoke | bar | none`); captions are auto-derived from TTS timings when present.

### Added — Shorts (`9:16`)
- `director.shortsPreset()` + `meta.shorts/safe`: 9:16 aspect, duration ≤ 58 s,
  karaoke captions, `#Shorts` in title/description, title trimmed to 90 chars.
- **Safe-zone layout:** the engine keeps scene content inside `WIN_TOP…WIN_BOTTOM`
  (11% top / 19% bottom cleared in Shorts, 5% / 8% otherwise) and captions sit above it.
- One checkbox in the UI: `#fShorts` flips aspect, duration cap and caption style.

### Added — transitions (5 → 11)
- `maskCircle`, `maskBox`, `pageTurn`, `blurZoom`, `whipPan`, `bars` on top of
  `fade/slide/zoom/wipe/glitch`. All exit-only, so no two scenes ever bleed together.

### Added — projects & PWA
- **Project save/load**: `*.cutfree.json` (`cutfree-studio-project` v2) with the whole
  form, caption cues and measured timings; loading restores the workbench.
- **Offline/PWA:** `sw.js` (cache-first shell, stale-replaced in the background) and
  `manifest.webmanifest` — the studio installs and runs with the network off.

### Changed
- `fitText()` made width-aware (unbreakable words, 40 iterations) — long Bengali or
  English copy shrinks instead of clipping.
- File pickers in the brief card now use the same styled button as the new panels.
- Test suites print a tally; the studio suite grew from 43 to **74 checks** and the
  cutter suite from 25 to **30** (30/30 + 74/74 green, also against the single-file build).

### Fixed
- **SRT export could emit `NaN:NaN:NaN`** — a word starting at `0` was dropped by a
  truthiness check in `captionsFromTimings()`, then `fitTo()` propagated NaN. Word times
  are now coerced through `captions.num()` everywhere (`fromWords`, `build`, `fitTo`).
- **Switching language wiped `#voiceRateVal`** (the rate label was inside a
  `data-i18n` node), throwing on the next slider move — the live value now sits outside
  the translated node and every access is guarded.
- **Shorts toggle left the caption style on “bar”** and, on a fresh page, never rebuilt
  the preview; the toggle now sets karaoke, caps the duration and rebuilds the plan.
- Imported SRT cues were shadowed by the previously built plan on export.

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
