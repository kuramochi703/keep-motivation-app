import { useState } from 'react'


export type Screen = 'top' | 'setup' | 'main'

/** 画面遷移だけを担当する。読み込み後の初期画面はuseAppで決める。 */
export function useScreen() {
  const [screen, setScreen] = useState<Screen>('top')
  return { screen, setScreen }
}
