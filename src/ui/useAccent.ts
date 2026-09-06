import { useEffect } from 'react'
import { type Level } from '../logic'

export function useAccent(L: Level) {
  useEffect(() => {
    const r = document.documentElement.style
    r.setProperty('--h', String(L.h))
    r.setProperty('--s', String(L.s))
  }, [L])
}