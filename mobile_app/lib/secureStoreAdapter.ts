import * as SecureStore from 'expo-secure-store'

// Adaptateur de stockage pour Supabase auth : SecureStore plafonne une valeur à
// ~2048 bytes, or un JWT dépasse. On fragmente en chunks `${key}.${i}` de 1800 bytes.
//
// ORA-060 — purge des chunks orphelins : si une valeur précédente s'étalait sur
// plus de chunks que la nouvelle (ex. JWT plus court après refresh), les anciens
// `${key}.${n}` restaient. `getItem` relisant jusqu'au premier `null`, il
// re-concaténait ces fragments périmés → token corrompu. `setItem` efface
// désormais tout chunk au-delà de la nouvelle longueur.

const CHUNK_SIZE = 1800

// Efface les chunks `${key}.${from}`, `${key}.${from + 1}`, … jusqu'au premier absent.
async function deleteChunksFrom(key: string, from: number): Promise<void> {
  let i = from
  let chunk = await SecureStore.getItemAsync(`${key}.${i}`)
  while (chunk !== null) {
    await SecureStore.deleteItemAsync(`${key}.${i}`)
    i++
    chunk = await SecureStore.getItemAsync(`${key}.${i}`)
  }
}

export const ExpoSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    const chunks: string[] = []
    let i = 0
    let chunk = await SecureStore.getItemAsync(`${key}.${i}`)
    while (chunk !== null) {
      chunks.push(chunk)
      i++
      chunk = await SecureStore.getItemAsync(`${key}.${i}`)
    }
    return chunks.length > 0 ? chunks.join('') : null
  },
  setItem: async (key: string, value: string): Promise<void> => {
    const chunks = value.match(new RegExp(`.{1,${CHUNK_SIZE}}`, 'g')) || []
    await Promise.all(chunks.map((chunk, i) => SecureStore.setItemAsync(`${key}.${i}`, chunk)))
    // Purge des chunks d'une valeur antérieure plus longue (ORA-060).
    await deleteChunksFrom(key, chunks.length)
  },
  removeItem: async (key: string): Promise<void> => {
    await deleteChunksFrom(key, 0)
  },
}
