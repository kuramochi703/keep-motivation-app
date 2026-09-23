import { useLayoutEffect, useMemo, type ReactNode } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import type * as THREE from 'three'
import Chick, { DEFAULT_ROAM, type Roam } from './Chick'
import type { Look } from './look'
import { MOODS } from '../state/logic'

type Props = {
  look: Look
  animate: boolean
  /** 枠いっぱいに広げる（ダッシュボードの背景ステージ用）。
      枠の大きさに合わせてカメラを引き、歩き回れる範囲もそのぶん広がる */
  fill?: boolean
  /** たまごを割る。ステージ0のときだけ効く（→ Chick.tsx の Egg） */
  hatching?: boolean
  /** ひよこを叩けるようにする（→ Chick.tsx の TapSparkle） */
  interactive?: boolean
}

/**
 * 1ワールド単位あたりの画素数。300px 幅の枠（カメラ距離 4.6・fov 32）での
 * 見え方をそのまま数にしたもの。枠を広げてもこの比率を保つようにカメラを
 * 引くので、**枠の大きさが変わってもひよこの大きさは変わらない。**
 */
const PX_PER_UNIT = 118
/** 枠に収める高さの下限（ワールド単位）。300px 幅の枠での見え方と同じ。
    これより枠が低いときは、大きさを保つのをあきらめて全身が入るのを優先する */
const MIN_UNITS_TALL = 2.64
/** 足元から枠の下端までの余白（ワールド単位）。影と地面のぶん */
const FLOOR_PAD = 0.9
/** 歩き回れる範囲の、枠の端からの余白。はみ出さないための取りしろ */
const EDGE_PAD = 0.9

/**
 * 3D の置き場。カメラと照明はここで決め、キャラの中身は Chick.tsx に任せる。
 *
 * 背景は透明にしてある（`gl.alpha`）。カードの背景色や、気分に連動する
 * アクセント色（ui/useAccent.ts）がそのまま透けるようにするため。
 */
export default function AvatarCanvas({ look, animate, fill = false, hatching, interactive }: Props) {
  return (
    <Canvas
      // **枠いっぱいのときは CSS が pointer-events を切っている**（avatar.css）。
      // 触れるようにするなら戻さないと、クリックがキャンバスに届かない
      className={`avatar avatar-3d${fill ? ' avatar-fill' : ''}${interactive ? ' avatar-interactive' : ''}`}
      // 枠いっぱいのときだけ絶対位置に。three.js の入れ物は height:100% の
      // インライン指定で来るので、CSS からは position を上書きできない。
      // 絶対位置にしておかないと高さが伝わらず、既定の 150px に潰れる
      style={fill ? { position: 'absolute', inset: 0 } : undefined}
      role="img"
      aria-label={
        look.isEgg
          ? 'アバターの状態: たまご'
          : `アバターの状態: ${look.stage}段階目、${MOODS.find((m) => m.id === look.mood)?.name ?? ''}`
      }
      // 高 DPI 端末で 2 倍までに抑える。3 倍以上にすると発熱が目に見えて増える。
      // 枠いっぱいに広げるときは画素数がそもそも多いので、さらに抑える
      dpr={fill ? [1, 1.5] : [1, 2]}
      gl={{ alpha: true, antialias: true }}
      // トーンマッピングを切る（既定は ACES フィルミック）。映画向けの曲線で、
      // 明るい色ほど灰色へ寄せる。look.ts のパステルがくすんで見えるので、
      // 指定した色をそのまま出す
      flat
      camera={{ position: [0, 0.45, 4.6], fov: 32 }}
      // 見えていない間は回さない
      frameloop="always"
    >
      {/* **光の強さは「指定した色がそのまま出る」ところに合わせてある。**
          three.js の拡散反射は明るさを π で割る（物理的な単位）ので、
          強さ1の光では色の 1/3 ほどの明るさにしかならない。素直に 1.0 前後で
          組むと、look.ts で明るい色を指定しても画面では灰色っぽく沈む。
          いちばん明るい所で 1 を少し超えるくらい（＝指定した色とほぼ同じ）に
          なるよう、環境光と主光源を合わせて π 倍ぶんまで上げている */}
      <ambientLight intensity={1.7} />
      {/* 主光源。右斜め上から当てて、丸みを出す */}
      <directionalLight position={[2.6, 4.2, 3.2]} intensity={2.0} />
      {/* 逆光。輪郭をふちどって、背景から浮かせる */}
      <directionalLight position={[-3, 2, -2.5]} intensity={0.8} color="#BBD9FF" />
      {fill ? (
        <StageFit>
          {(roam) => (
            <Chick look={look} animate={animate} roam={roam} hatching={hatching} interactive={interactive} />
          )}
        </StageFit>
      ) : (
        <group position={[0, -0.85, 0]}>
          <Chick look={look} animate={animate} roam={DEFAULT_ROAM} hatching={hatching} interactive={interactive} />
        </group>
      )}
    </Canvas>
  )
}

/**
 * 枠の大きさに合わせて、カメラの引きと地面の高さ、歩き回れる範囲を決める。
 *
 * ここを CSS では書けない。3D の「どこまで見えるか」は画素ではなく画角と
 * 距離で決まるので、枠が広くなったぶんカメラを引かないと、ひよこだけが
 * 大きくなってしまう。逆に引きさえすれば、見える床がそのまま広がる。
 */
function StageFit({ children }: { children: (roam: Roam) => ReactNode }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)

  // 枠に収まるワールドの大きさ。px を 1単位=PX_PER_UNIT で読み替えただけ。
  // ただし低い枠では全身が入らなくなるので、そこだけ下限で止める
  const unitsTall = Math.max(height / PX_PER_UNIT, MIN_UNITS_TALL)
  const unitsWide = (unitsTall * width) / height

  useLayoutEffect(() => {
    // 縦の画角（fov）は固定なので、見たい高さぶんだけ後ろへ下がる
    camera.position.z = unitsTall / 2 / Math.tan((camera.fov * Math.PI) / 360)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera, unitsTall])

  // 床は枠の下端近く。手前（+z）に来ると画面では下がるので、奥行きは
  // 足元の余白より狭くしておく
  const floorY = -unitsTall / 2 + FLOOR_PAD
  const roam = useMemo<Roam>(
    () => ({
      x: Math.max(DEFAULT_ROAM.x, unitsWide / 2 - EDGE_PAD),
      z: Math.max(DEFAULT_ROAM.z, Math.min(1.2, unitsTall / 2 - FLOOR_PAD - 0.6)),
    }),
    [unitsWide, unitsTall]
  )

  return <group position={[0, floorY, 0]}>{children(roam)}</group>
}
