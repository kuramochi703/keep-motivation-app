import { Canvas } from '@react-three/fiber'
import Chick from './Chick'
import type { Look } from './look'

type Props = {
  look: Look
  animate: boolean
}

/**
 * 3D の置き場。カメラと照明はここで決め、キャラの中身は Chick.tsx に任せる。
 *
 * 背景は透明にしてある（`gl.alpha`）。カードの背景色や、活力に連動する
 * アクセント色（ui/useAccent.ts）がそのまま透けるようにするため。
 */
export default function AvatarCanvas({ look, animate }: Props) {
  return (
    <Canvas
      className="avatar avatar-3d"
      role="img"
      aria-label={`アバターの状態: ${look.stage}段階目、活力${look.vitality}`}
      // 高 DPI 端末で 2 倍までに抑える。3 倍以上にすると発熱が目に見えて増える
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true }}
      camera={{ position: [0, 0.45, 4.6], fov: 32 }}
      // 見えていない間は回さない
      frameloop="always"
    >
      <ambientLight intensity={0.65} />
      {/* 主光源。右斜め上から当てて、丸みを出す */}
      <directionalLight position={[2.6, 4.2, 3.2]} intensity={1.15} />
      {/* 逆光。輪郭をふちどって、背景から浮かせる */}
      <directionalLight position={[-3, 2, -2.5]} intensity={0.45} color="#BBD9FF" />
      <group position={[0, -0.85, 0]}>
        <Chick look={look} animate={animate} />
      </group>
    </Canvas>
  )
}
