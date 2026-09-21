import { useEffect } from 'react'

/**
 * 画面のアクセント色（CSS 変数 `--h` / `--s`）を更新する。
 *
 * **色相はユーザーが選んだ `hue` に固定し、彩度だけ気分で動かす。**
 * 色相まで気分で動かすと、選んだ色が画面から消えてしまう。
 *
 * @param hue 色相 0〜359
 * @param s 彩度。気分の表（logic.ts の `MOODS`）が持っている値
 */
export function useAccent(hue: number, s: number) {
  useEffect(() => {
    const r = document.documentElement.style
    r.setProperty('--h', String(hue))
    r.setProperty('--s', String(s))
  }, [hue, s])
}
