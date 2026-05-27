import type { InstrumentDefinition } from './types'

export const instruments: InstrumentDefinition[] = [
  {
    id: 'piano',
    label: 'Piano',
    notes: [
      { key: 'C4', frequency: 261.63, file: '/samples/piano/C4.wav' },
      { key: 'E4', frequency: 329.63, file: '/samples/piano/E4.wav' },
      { key: 'G4', frequency: 392.0, file: '/samples/piano/G4.wav' },
      { key: 'C5', frequency: 523.25, file: '/samples/piano/C5.wav' },
    ],
  },
  {
    id: 'synth',
    label: 'Synth',
    notes: [
      { key: 'C4', frequency: 261.63, file: '/samples/synth/C4.wav' },
      { key: 'E4', frequency: 329.63, file: '/samples/synth/E4.wav' },
      { key: 'G4', frequency: 392.0, file: '/samples/synth/G4.wav' },
      { key: 'C5', frequency: 523.25, file: '/samples/synth/C5.wav' },
    ],
  },
]
