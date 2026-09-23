import { useLayoutEffect, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import stageUrl from './models/stage/stage.glb?url'

/** 床に置いた飾り（Blender のオブジェクト名そのまま）。足元の影の板は子なので一緒に動く。
    **Blender で改名すると、狭い画面で端へ寄せられなくなる** */
const PROPS = ['Books', 'Plant']
/** 飾りの中心から、見えている端までの取りしろ。いちばん幅のある本（半幅約0.7）が収まる量 */
const PROP_PAD = 0.85

/**
 * 部屋を載せるレイヤー。**ひよこの落ち影（ContactShadows）から部屋を隠すため。**
 * 落ち影は毎フレーム、床の下から見上げたシーン全体を撮って作る。部屋が写ると
 * 床一面が影になる。撮影用のカメラはレイヤー0しか見ないので、ここへ移せば写らない。
 * 画面のカメラは StageFit がこのレイヤーも見るようにしている
 */
export const STAGE_LAYER = 1

type Props = {
  /** 原点の奥行き（z=0）で見えている横幅。AvatarCanvas の StageFit が測ったもの */
  unitsWide: number
  /** カメラから原点までの距離。奥の飾りほど広く見えるぶんの補正に使う */
  cameraZ: number
}

/**
 * ダッシュボードの背景の部屋（床・壁・窓・本・植木鉢）。
 *
 * 形も色も光も Blender のモデル（models/stage/build.py → stage.glb）がそのまま持つ。
 * **光と影はテクスチャに焼き込んである**ので、ここでは照明を当てずにそのまま貼る
 * （MeshBasicMaterial）。照明を当てると、焼いた陰影にさらに陰影が重なって暗くなる。
 * ひよこと違って気分や色相では何も変えない。
 * **原点がひよこの定位置・床が y=0** になるように作ってあるので、
 * ひよこと同じ group に入れれば足元が床に揃う。
 *
 * コードがやるのは、狭い枠で本と植木鉢を内側へ寄せることだけ。モデルでは
 * 1400px 幅の枠の端近くに置いてあるので、スマホ幅だと枠の外へ出てしまう。
 */
export default function Stage({ unitsWide, cameraZ }: Props) {
  const { scene } = useGLTF(stageUrl)
  // 同じ glb を複数の画面で使っても取り合わないよう複製する
  const room = useMemo(() => {
    const r = scene.clone(true)
    r.traverse((o) => {
      o.layers.set(STAGE_LAYER)
      if (o instanceof THREE.Mesh) {
        const m = o.material as THREE.MeshStandardMaterial
        o.material = new THREE.MeshBasicMaterial({
          map: m.map,
          color: m.color,
          transparent: m.transparent,
          // Blender の面の向きはまちまち（窓ガラスは奥を向いている）。両面を引き継がないと消える
          side: m.side,
          // 影の板は床の上に重ねるだけ。奥行きを書くと、後ろのひよこの落ち影を消してしまう
          depthWrite: !m.transparent,
        })
      }
    })
    return r
  }, [scene])
  // 寄せる前の位置。枠が広がったら元へ戻すので覚えておく
  const props = useMemo(
    () =>
      room.children
        .filter((o) => PROPS.some((p) => o.name.startsWith(p)))
        .map((o) => ({ node: o, x: o.position.x })),
    [room]
  )

  useLayoutEffect(() => {
    for (const { node, x } of props) {
      // 奥（-z）にあるものほど、同じ画角でも広い範囲が見えている
      const half = ((unitsWide / 2) * (cameraZ - node.position.z)) / cameraZ
      node.position.x = Math.sign(x) * Math.min(Math.abs(x), half - PROP_PAD)
    }
  }, [props, unitsWide, cameraZ])

  // ひよこの落ち影（ContactShadows）も y=0 に敷かれる。床と同じ高さだと
  // ちらつくので、部屋ごとほんの少し沈める
  return <primitive object={room} position={[0, -0.005, 0]} />
}

// 先に読み込んでおく。ひよこ（Chick.tsx）と同じく、出てから待たせない
useGLTF.preload(stageUrl)
