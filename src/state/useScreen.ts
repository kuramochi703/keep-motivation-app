import { useCallback, useEffect, useState } from 'react'


export type Screen = 'top' | 'setup' | 'main' | 'debug'

export const isDebugPath = () =>
  import.meta.env.DEV && /^\/debugPage\/?$/.test(window.location.pathname)

/** デバッグ画面のURLと、ブラウザの戻る・進むを画面状態に反映する。 */
export function useScreen() {
  const [screen, updateScreen] = useState<Screen>(() => isDebugPath() ? 'debug' : 'top')

  const setScreen = useCallback((next: Screen) => {
    const url = new URL(window.location.href)
    if (next === 'debug' && import.meta.env.DEV) {
      url.pathname = '/debugPage'
    } else if (isDebugPath()) {
      url.pathname = '/'
    }
    const historyState = { ...window.history.state, screen: next }
    if (url.href !== window.location.href) {
      window.history.pushState(historyState, '', url)
    } else {
      window.history.replaceState(historyState, '', url)
    }
    updateScreen(next)
  }, [])

  useEffect(() => {
    window.history.replaceState({ ...window.history.state, screen: isDebugPath() ? 'debug' : 'top' }, '')
    const onPopState = () => {
      const saved = window.history.state?.screen
      updateScreen(isDebugPath() ? 'debug'
        : saved === 'main' || saved === 'setup' ? saved : 'top')
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  return { screen, setScreen }
}
