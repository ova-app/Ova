import { useEffect } from 'react'
import { useRouter } from 'expo-router'

export default function StartTab() {
  const router = useRouter()
  useEffect(() => { router.replace('/workout/session') }, [])
  return null
}
