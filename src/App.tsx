import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { instruments } from './instruments'
import type { InstrumentDefinition, InstrumentId, InstrumentState, LightPoint } from './types'
import { getAudioFile, saveAudioFile } from './audioStore'

type BufferMap = Record<string, AudioBuffer>

const SMOOTHING_FACTOR_PREV = 0.8
const SMOOTHING_FACTOR_CURR = 0.2

function nearestNote(instrument: InstrumentDefinition, frequency: number) {
  return [...instrument.notes].sort((a, b) => Math.abs(a.frequency - frequency) - Math.abs(b.frequency - frequency))[0]
}

function mapXToFrequency(x: number): number {
  return 220 + x * 660
}

function mapYToVolume(y: number): number {
  return Math.max(0.05, Math.min(1, 1 - y))
}

async function fetchAndDecodeAudio(
  audioContext: AudioContext,
  url: string,
): Promise<AudioBuffer> {
  const cachedBuffer = await getAudioFile(url)
  let arrayBuffer: ArrayBuffer
  if (cachedBuffer) {
    arrayBuffer = cachedBuffer
  } else {
    const fetched = await fetch(url)
    arrayBuffer = await fetched.arrayBuffer()
    await saveAudioFile(url, arrayBuffer)
  }

  return audioContext.decodeAudioData(arrayBuffer.slice(0))
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)
  const mixDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const smoothedYRef = useRef(0.5)
  const lastPlayAtRef = useRef(0)

  const [selectedInstrument, setSelectedInstrument] = useState<InstrumentId>('piano')
  const [instrumentStates, setInstrumentStates] = useState<Record<InstrumentId, InstrumentState>>({
    piano: 'idle',
    synth: 'idle',
  })
  const [buffers, setBuffers] = useState<Record<InstrumentId, BufferMap>>({ piano: {}, synth: {} })
  const [permissionState, setPermissionState] = useState<string>('idle')
  const [lightPoint, setLightPoint] = useState<LightPoint | null>(null)
  const [smoothedY, setSmoothedY] = useState(0.5)
  const [status, setStatus] = useState('Ready')
  const [isRecording, setIsRecording] = useState(false)
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null)
  const [cameraFacingMode, setCameraFacingMode] = useState<'user' | 'environment'>('environment')
  const [audioEnabled, setAudioEnabled] = useState(false)

  const instrument = useMemo(
    () => instruments.find((it) => it.id === selectedInstrument) ?? instruments[0],
    [selectedInstrument],
  )

  const ensureAudioContext = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext()
      mixDestinationRef.current = audioCtxRef.current.createMediaStreamDestination()
    }
    return audioCtxRef.current
  }

  const enableAudio = async () => {
    try {
      const ctx = ensureAudioContext()
      if (ctx.state !== 'running') {
        await ctx.resume()
      }
      setAudioEnabled(true)
      setStatus('Audio enabled')
      await preloadInstrument(selectedInstrument)
    } catch (error) {
      console.error(error)
      setStatus('Failed to enable audio')
    }
  }

  const preloadInstrument = async (instrumentId: InstrumentId) => {
    const def = instruments.find((item) => item.id === instrumentId)
    if (!def) return

    if (instrumentStates[instrumentId] === 'ready') return

    setInstrumentStates((prev) => ({ ...prev, [instrumentId]: 'loading' }))

    try {
      const ctx = ensureAudioContext()
      const decodedEntries = await Promise.all(
        def.notes.map(async (note) => ({
          key: note.key,
          buffer: await fetchAndDecodeAudio(ctx, note.file),
        })),
      )

      setBuffers((prev) => ({
        ...prev,
        [instrumentId]: decodedEntries.reduce<BufferMap>((acc, item) => {
          acc[item.key] = item.buffer
          return acc
        }, {}),
      }))

      setInstrumentStates((prev) => ({ ...prev, [instrumentId]: 'ready' }))
    } catch (error) {
      console.error(error)
      setInstrumentStates((prev) => ({ ...prev, [instrumentId]: 'error' }))
    }
  }

  const playSound = (frequency: number, volume: number) => {
    const ctx = ensureAudioContext()
    if (ctx.state === 'suspended') {
      void ctx.resume()
    }

    const bufferMap = buffers[selectedInstrument]
    const note = nearestNote(instrument, frequency)
    const buffer = bufferMap[note.key]
    if (!buffer) return

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = frequency / note.frequency

    const gainNode = ctx.createGain()
    gainNode.gain.setValueAtTime(volume, ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18)

    source.connect(gainNode)
    gainNode.connect(ctx.destination)

    if (mixDestinationRef.current) {
      gainNode.connect(mixDestinationRef.current)
    }

    source.start()
    source.stop(ctx.currentTime + 0.2)
  }

  const startCamera = async (facingMode: 'user' | 'environment' = cameraFacingMode) => {
    try {
      setPermissionState('requesting')
      stopCamera()
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      mediaStreamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setPermissionState('granted')
      setStatus(`Camera active (${facingMode === 'user' ? 'front' : 'back'})`)
    } catch (error) {
      console.error(error)
      setPermissionState('denied')
      setStatus('Camera access denied')
    }
  }

  const switchCamera = async () => {
    const nextMode = cameraFacingMode === 'environment' ? 'user' : 'environment'
    setCameraFacingMode(nextMode)
    await startCamera(nextMode)
  }

  const stopCamera = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    mediaStreamRef.current = null
  }

  useEffect(() => {
    if (!audioEnabled) return
    void preloadInstrument(selectedInstrument)
  }, [selectedInstrument, audioEnabled])

  useEffect(() => {
    const video = videoRef.current
    const outputCanvas = canvasRef.current
    const hiddenCanvas = hiddenCanvasRef.current

    if (!video || !outputCanvas || !hiddenCanvas) return

    const outputCtx = outputCanvas.getContext('2d', { willReadFrequently: false })
    const hiddenCtx = hiddenCanvas.getContext('2d', { willReadFrequently: true })

    if (!outputCtx || !hiddenCtx) return

    const tick = () => {
      if (video.readyState >= 2) {
        outputCanvas.width = video.videoWidth || 1280
        outputCanvas.height = video.videoHeight || 720
        hiddenCanvas.width = 160
        hiddenCanvas.height = 90

        outputCtx.drawImage(video, 0, 0, outputCanvas.width, outputCanvas.height)
        hiddenCtx.drawImage(video, 0, 0, hiddenCanvas.width, hiddenCanvas.height)

        const frame = hiddenCtx.getImageData(0, 0, hiddenCanvas.width, hiddenCanvas.height)
        const { data, width, height } = frame

        let maxLuma = -1
        let bestX = 0
        let bestY = 0

        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const idx = (y * width + x) * 4
            const r = data[idx]
            const g = data[idx + 1]
            const b = data[idx + 2]
            const luma = 0.299 * r + 0.587 * g + 0.114 * b
            if (luma > maxLuma) {
              maxLuma = luma
              bestX = x
              bestY = y
            }
          }
        }

        const normX = bestX / width
        const normY = bestY / height
        const nextSmoothedY = smoothedYRef.current * SMOOTHING_FACTOR_PREV + normY * SMOOTHING_FACTOR_CURR

        smoothedYRef.current = nextSmoothedY
        setSmoothedY(nextSmoothedY)

        const nextPoint = {
          x: normX,
          y: nextSmoothedY,
          intensity: Math.max(0, Math.min(1, maxLuma / 255)),
        }

        setLightPoint(nextPoint)

        const markerX = nextPoint.x * outputCanvas.width
        const markerY = nextPoint.y * outputCanvas.height

        outputCtx.strokeStyle = '#00f0ff'
        outputCtx.lineWidth = 4
        outputCtx.beginPath()
        outputCtx.arc(markerX, markerY, 16, 0, Math.PI * 2)
        outputCtx.stroke()

        const frequency = mapXToFrequency(nextPoint.x)
        const volume = mapYToVolume(nextPoint.y)

        outputCtx.fillStyle = 'rgba(0, 0, 0, 0.45)'
        outputCtx.fillRect(16, 16, 340, 120)
        outputCtx.fillStyle = '#f4f6ff'
        outputCtx.font = '20px sans-serif'
        outputCtx.fillText(`Instrument: ${instrument.label}`, 24, 42)
        outputCtx.fillText(`Pitch: ${Math.round(frequency)} Hz`, 24, 72)
        outputCtx.fillText(`Volume: ${volume.toFixed(2)}`, 24, 102)

        if (
          audioEnabled &&
          instrumentStates[selectedInstrument] === 'ready' &&
          nextPoint.intensity > 0.12
        ) {
          const now = performance.now()
          if (now - lastPlayAtRef.current > 90) {
            playSound(frequency, volume * nextPoint.intensity)
            lastPlayAtRef.current = now
          }
        }
      }
      animationFrameRef.current = window.requestAnimationFrame(tick)
    }

    animationFrameRef.current = window.requestAnimationFrame(tick)
    return () => {
      if (animationFrameRef.current) window.cancelAnimationFrame(animationFrameRef.current)
    }
  }, [instrument.label, instrumentStates, selectedInstrument, buffers, audioEnabled])

  const startRecording = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!('MediaRecorder' in window)) {
      setStatus('MediaRecorder is not supported on this browser')
      return
    }

    try {
      const fps = 30
      const canvasStream = canvas.captureStream(fps)
      const tracks = [...canvasStream.getVideoTracks()]
      if (mixDestinationRef.current) {
        tracks.push(...mixDestinationRef.current.stream.getAudioTracks())
      }
      const mergedStream = new MediaStream(tracks)

      const mimeTypes = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      const selectedMimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type))
      if (!selectedMimeType) {
        setStatus('No supported recording format found on this browser')
        return
      }

      const recorder = new MediaRecorder(mergedStream, { mimeType: selectedMimeType })
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' })
        const url = URL.createObjectURL(blob)
        setRecordingUrl(url)
        setStatus('Recording ready for download')
      }

      recorderRef.current = recorder
      recorder.start(250)
      setIsRecording(true)
      setStatus('Recording...')
    } catch (error) {
      console.error(error)
      setStatus('Unable to start recording')
    }
  }

  const stopRecording = () => {
    recorderRef.current?.stop()
    recorderRef.current = null
    setIsRecording(false)
  }

  useEffect(() => {
    return () => {
      stopCamera()
      if (recordingUrl) URL.revokeObjectURL(recordingUrl)
    }
  }, [recordingUrl])

  return (
    <main className="app-shell">
      <h1>Light Sound PWA</h1>
      <p className="subtitle">Move a bright light in front of camera to control pitch and volume.</p>

      <section className="controls">
        <button onClick={() => void startCamera()} disabled={permissionState === 'requesting'}>
          {permissionState === 'granted' ? 'Restart Camera' : 'Start Camera'}
        </button>
        <button onClick={() => void switchCamera()} disabled={permissionState !== 'granted'}>
          Switch to {cameraFacingMode === 'environment' ? 'Front' : 'Back'} Camera
        </button>
        <button onClick={() => void enableAudio()} disabled={audioEnabled}>
          {audioEnabled ? 'Audio Enabled' : 'Enable Audio'}
        </button>

        <label>
          Instrument
          <select
            value={selectedInstrument}
            onChange={(event) => setSelectedInstrument(event.target.value as InstrumentId)}
          >
            {instruments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <div className="instrument-status">
          {instruments.map((item) => (
            <span key={item.id} className={`pill ${instrumentStates[item.id]}`}>
              {item.label}: {instrumentStates[item.id]}
            </span>
          ))}
        </div>
      </section>

      <section className="recording-controls">
        <button onClick={startRecording} disabled={isRecording || permissionState !== 'granted'}>
          Record
        </button>
        <button onClick={stopRecording} disabled={!isRecording}>
          Stop Recording
        </button>
        {recordingUrl && (
          <a href={recordingUrl} download="light-sound-performance.webm">
            Download Recording
          </a>
        )}
      </section>

      <p className="status">Status: {status}</p>

      <video ref={videoRef} className="hidden" playsInline muted />
      <canvas ref={canvasRef} className="performance-canvas" />
      <canvas ref={hiddenCanvasRef} className="hidden" />

      <section className="telemetry">
        <p>Smoothed Y: {smoothedY.toFixed(3)}</p>
        <p>Light: {lightPoint ? `x=${lightPoint.x.toFixed(2)}, y=${lightPoint.y.toFixed(2)}` : 'No frame yet'}</p>
      </section>
    </main>
  )
}
