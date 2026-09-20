/**
 * Blender では glTF 2.0 の「glTF Binary (.glb)」で書き出し、
 * public/avatars/ に置いてください（テクスチャも含めた GLB 推奨）。
 * default: '/avatars/character.glb' と指定すれば 3D 表示になります。
 * .gltf も対応。外部の .bin・テクスチャは相対パスを保って配置します。
 * PNG / WebP などの画像パスも引き続き指定できます。
 * default だけ指定すれば全枠に反映されます。枠ごとの指定は任意です。
 * 例: default: '/avatars/character.png'
 */
export const onboardingAvatarImages = {
  default: '',
  goal: '',
  encouragement: '',
  start: '',
  growth: ['', '', ''], // はじめ → がんばり中 → 成長！
}

/** 3D 共通設定。モデルの大きさ・中心は自動調整します。 */
export const onboardingAvatarModel = {
  // 向き（度数法）。後ろを向く場合は [0, 180, 0] に変更。
  rotationDegrees: [0, 0, 0] as [number, number, number],
  // 周囲の余白。大きくするとモデルが小さく表示されます（1 以上推奨）。
  margin: 1.2,
}
