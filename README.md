# Light Sound PWA

A mobile-friendly PWA that turns bright light movement in camera view into playable instrument sound.

## Features

- Camera light tracking with smoothing:
  - `smoothedY = previousY * 0.8 + currentY * 0.2`
- Pitch from light X position and volume from Y position
- Instrument selector (`Piano`, `Synth`)
- Offline-first audio engine:
  - Preloads and decodes note samples to `AudioBuffer`
  - Stores fetched samples in IndexedDB
  - Service worker caches sample files
  - Prevents playback before selected instrument is fully loaded
- Local recording (no server upload):
  - Renders camera + overlays to a single canvas
  - Records canvas stream via `MediaRecorder`
  - Includes audio output when browser supports audio track merge
  - Record / Stop / Download controls
- Cloud Run-ready Docker deployment

## Project Structure

- `src/App.tsx` - camera processing, light detection, playback mapping, recording
- `src/instruments.ts` - instrument/sample metadata
- `src/audioStore.ts` - IndexedDB caching helpers
- `src/types.ts` - app types
- `public/samples/*` - local `.wav` note samples
- `vite.config.ts` - PWA and Workbox runtime caching configuration
- `server.mjs` - production static server for Cloud Run
- `Dockerfile` - multi-stage build for Cloud Run

## Local Setup

```bash
npm install
npm run dev
```

Open the shown URL (usually `http://localhost:5173`) on desktop/mobile browser.

### Camera Permission

Tap **Start Camera** and allow camera access.
Use a flashlight/bright point in front of camera.

### Build Test

```bash
npm run build
npm run start
```

Then open `http://localhost:8080`.

## Offline Behavior

- On first load of an instrument, note files are fetched and decoded.
- Audio files are persisted in IndexedDB (`light-sound-db`) for reuse.
- Service worker caches sample files with CacheFirst strategy.
- Previously loaded instruments continue working offline.

## Recording

- Press **Record** to start capturing performance canvas.
- Press **Stop Recording** to finalize.
- Press **Download Recording** to save WebM file.

If browser does not support a recording MIME type, app shows a graceful status message.

## Deploy to Google Cloud Run

Prerequisites:

- Authenticated gcloud CLI
- Project selected
- Cloud Run API enabled

Deploy:

```bash
gcloud config set project netzam-wifi
gcloud run deploy light-sound-pwa \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated
```

After deployment, Cloud Run prints the service URL endpoint.

## Notes

- Best on HTTPS contexts (required for camera on most mobile browsers).
- Audio autoplay restrictions apply until user interaction.
