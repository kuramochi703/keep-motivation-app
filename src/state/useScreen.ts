import { useState } from 'react'
import { STORAGE_KEY } from './logic'

export type Screen = 'top' | 'setup' | 'main'

/** 画面遷移だけを担当する。保存データがあれば最初からダッシュボードを出す */
export function useScreen() {
  const [screen, setScreen] = useState<Screen>(() =>
    localStorage.getItem(STORAGE_KEY) ? 'main' : 'top'
  )
  return { screen, setScreen }
}
