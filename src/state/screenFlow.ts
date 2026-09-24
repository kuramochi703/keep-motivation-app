export type Screen = 'top' | 'setup' | 'main' | 'debug'

/** 認証と目標の読み込みが終わってから、ログイン直後の画面を決める。 */
export function entryScreen(tutorialCompleted: boolean, hasCurrentGoal: boolean): Screen {
  if (!tutorialCompleted) return 'top'
  return hasCurrentGoal ? 'main' : 'setup'
}

/** サイドバーや戻る操作でも、未完了の手順を飛ばしたり案内を再表示したりしない。 */
export function allowedScreen(
  requested: Screen,
  tutorialCompleted: boolean,
  hasCurrentGoal: boolean,
): Screen {
  if (requested === 'debug') return 'debug'
  if (!tutorialCompleted || requested === 'top') {
    return entryScreen(tutorialCompleted, hasCurrentGoal)
  }
  if (requested === 'main' && !hasCurrentGoal) return 'setup'
  return requested
}
