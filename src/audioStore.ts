import { openDB } from 'idb'

const DB_NAME = 'light-sound-db'
const STORE_NAME = 'audio-files'

const dbPromise = openDB(DB_NAME, 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME)
    }
  },
})

export async function saveAudioFile(url: string, data: ArrayBuffer): Promise<void> {
  const db = await dbPromise
  await db.put(STORE_NAME, data, url)
}

export async function getAudioFile(url: string): Promise<ArrayBuffer | undefined> {
  const db = await dbPromise
  return db.get(STORE_NAME, url)
}
