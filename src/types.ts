export type InstrumentId = 'piano' | 'synth'

export type InstrumentState = 'idle' | 'loading' | 'ready' | 'error'

export interface InstrumentDefinition {
  id: InstrumentId
  label: string
  notes: Array<{ key: string; frequency: number; file: string }>
}

export interface LightPoint {
  x: number
  y: number
  intensity: number
}
