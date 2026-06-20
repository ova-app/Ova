// ─── lib/profilePhotos.ts — photos de profil (vitrine, hors séance) ───────────
// L'utilisateur peut ajouter des photos directement à sa vitrine depuis le profil
// (pas seulement les photos prises pendant une séance). Source : table profile_photos.
//
// Best-effort isolé : la table n'existe qu'après la migration profile_photos.sql →
// un échec (table absente) est silencieux (no-op pré-migration, même pattern que
// getManualFeaturedPr). Storage : bucket public `workout-photos` réutilisé.

import { log } from '@/lib/logger'
import { supabase } from '@/lib/supabase'

export interface ProfilePhoto {
  id: string
  photoUrl: string
  date: number // UNIX ms
  isPublic: boolean
}

const BUCKET = 'workout-photos'
const photoPath = (uid: string, id: string): string => `${uid}/profile-${id}.jpg`

// Lecture isolée + best-effort → [] pré-migration (n'altère pas le reste du profil).
export async function getProfilePhotos(userId: string): Promise<ProfilePhoto[]> {
  try {
    const { data, error } = await supabase
      .from('profile_photos')
      .select('id, photo_url, is_public, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error || !data) return []
    return (
      data as Array<{ id: string; photo_url: string; is_public: boolean; created_at: string }>
    ).map((r) => ({
      id: r.id,
      photoUrl: r.photo_url,
      date: new Date(r.created_at).getTime(),
      isPublic: r.is_public,
    }))
  } catch (e) {
    log.error('[profilePhotos] getProfilePhotos', e)
    return []
  }
}

// Upload local uri → storage → insert profile_photos. Renvoie la photo créée, ou null
// (échec / pré-migration → l'UI n'ajoute rien à la grille).
export async function uploadProfilePhoto(uri: string): Promise<ProfilePhoto | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const id = crypto.randomUUID()
    const path = photoPath(user.id, id)

    const response = await fetch(uri)
    const blob = await response.blob()
    const arrayBuffer = await blob.arrayBuffer()
    const uint8 = new Uint8Array(arrayBuffer)

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, uint8, { contentType: 'image/jpeg', upsert: true })
    if (upErr) {
      log.error('[profilePhotos] upload storage', upErr)
      return null
    }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
    const photoUrl = pub?.publicUrl
    if (!photoUrl) return null

    const { error: insErr } = await supabase
      .from('profile_photos')
      .insert({ id, user_id: user.id, photo_url: photoUrl, is_public: true })
    if (insErr) {
      log.error('[profilePhotos] insert row', insErr)
      return null
    }

    return { id, photoUrl, date: Date.now(), isPublic: true }
  } catch (e) {
    log.error('[profilePhotos] uploadProfilePhoto', e)
    return null
  }
}

// Supprime une photo de profil (ligne = source de vérité, puis cleanup storage best-effort).
export async function deleteProfilePhoto(id: string): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return false

    const { error } = await supabase.from('profile_photos').delete().eq('id', id)
    if (error) {
      log.error('[profilePhotos] delete row', error)
      return false
    }
    // La ligne supprimée suffit ; le fichier orphelin n'est jamais lu (best-effort).
    await supabase.storage.from(BUCKET).remove([photoPath(user.id, id)])
    return true
  } catch (e) {
    log.error('[profilePhotos] deleteProfilePhoto', e)
    return false
  }
}
