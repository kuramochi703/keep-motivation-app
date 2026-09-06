import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ContactShadows, Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import type { EyeShape, Look } from './look'

type Props = {
  look: Look
  /** false なら揺れも跳ねもさせない（prefers-reduced-motion 対応） */
  animate: boolean
}

/** ふわっとした質感。全パーツで共通に使う */
const SKIN = { roughness: 0.72, metalness: 0 } as const

/**
 * ひよこ本体。球とカプセルだけで組んでいる。
 *
 * 位置と大きさはすべて `look.bodyRadius`（= r）を基準にした相対値で書く。
 * ステージが上がって r が変わっても、全体の比率が崩れないようにするため。
 */
export default function Chick({ look, animate }: Props) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const wingL = useRef<THREE.Group>(null)
  const wingR = useRef<THREE.Group>(null)

  // 進化した瞬間だけ「ぽん」と跳ねさせるための状態。
  // 初回マウントでは鳴らさない（前のステージが分からないため）。
  const prevStage = useRef<number | null>(null)
  const pop = useRef(0)
  if (prevStage.current !== null && look.stage > prevStage.current) pop.current = 1
  prevStage.current = look.stage

  const r = look.bodyRadius
  const hr = r * look.headRatio
  const headY = r * 1.58

  // 顔のパーツは「頭の球のどこに貼るか」で決める。
  // z を目分量で決めると球に飲み込まれて消えるので、x・y から表面の z を出す。
  const faceZ = (x: number, y: number) => Math.sqrt(Math.max(hr * hr - x * x - y * y, 0)) * 0.96
  const eyeX = hr * 0.36
  const eyeY = hr * 0.1
  const cheekX = hr * 0.6
  const cheekY = -hr * 0.12

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    const amp = animate ? look.liveliness : 0

    // 進化の跳ねを減衰させる
    pop.current = THREE.MathUtils.damp(pop.current, 0, 4, delta)
    const popScale = 1 + Math.sin(pop.current * Math.PI) * 0.22

    if (root.current) {
      root.current.position.y = Math.sin(t * 2.1) * 0.035 * amp
      root.current.scale.setScalar(popScale)
      // やつれると前かがみになる
      root.current.rotation.x = THREE.MathUtils.damp(
        root.current.rotation.x,
        look.droop * 0.12,
        6,
        delta
      )
    }
    if (body.current) {
      // 呼吸。横に膨らんだぶん縦を縮めて体積を保つ
      const b = 1 + Math.sin(t * 2.1) * 0.03 * amp
      body.current.scale.set(b, 1 / b, b)
    }
    if (head.current) {
      head.current.rotation.z = Math.sin(t * 0.9) * 0.07 * amp
      head.current.position.y = THREE.MathUtils.damp(
        head.current.position.y,
        headY - look.droop * r * 0.2,
        6,
        delta
      )
    }
    const flap = Math.sin(t * 3.4) * 0.35 * amp
    if (wingL.current) wingL.current.rotation.z = 0.25 + flap
    if (wingR.current) wingR.current.rotation.z = -0.25 - flap
  })

  if (look.isEgg) return <Egg look={look} animate={animate} />

  return (
    <>
      <group ref={root}>
        {/* からだ */}
        <group ref={body} position={[0, r * 0.98, 0]}>
          <mesh scale={[1, 0.88, 1]}>
            <sphereGeometry args={[r, 48, 32]} />
            <meshStandardMaterial color={look.bodyColor} {...SKIN} />
          </mesh>
          {/* おなかの白い部分。手前に薄く重ねる */}
          <mesh position={[0, -r * 0.22, r * 0.34]} scale={[0.68, 0.7, 0.68]}>
            <sphereGeometry args={[r, 32, 24]} />
            <meshStandardMaterial color={look.bellyColor} {...SKIN} />
          </mesh>
        </group>

        {look.wings && (
          <>
            <group ref={wingL} position={[-r * 0.9, r * 0.86, 0]}>
              <Wing color={look.bodyColor} r={r} side={-1} />
            </group>
            <group ref={wingR} position={[r * 0.9, r * 0.86, 0]}>
              <Wing color={look.bodyColor} r={r} side={1} />
            </group>
          </>
        )}

        {look.tail && (
          <mesh position={[0, r * 1.25, -r * 0.86]} rotation={[0.7, 0, 0]} scale={[1, 1, 1.5]}>
            <sphereGeometry args={[r * 0.3, 20, 16]} />
            <meshStandardMaterial color={look.bodyColor} {...SKIN} />
          </mesh>
        )}

        {/* 頭 */}
        <group ref={head} position={[0, headY, 0]}>
          <mesh>
            <sphereGeometry args={[hr, 48, 32]} />
            <meshStandardMaterial color={look.bodyColor} {...SKIN} />
          </mesh>

          <Eye shape={look.eye} x={-eyeX} y={eyeY} z={faceZ(eyeX, eyeY)} scale={hr} />
          <Eye shape={look.eye} x={eyeX} y={eyeY} z={faceZ(eyeX, eyeY)} scale={hr} />

          {/* くちばし。上下に割れているように2枚重ねる */}
          <mesh position={[0, -hr * 0.12, faceZ(0, hr * 0.12) + hr * 0.12]} rotation={[Math.PI / 2 - 0.72, Math.PI / 4, 0]}>
            <coneGeometry args={[hr * 0.3, hr * 0.9, 4]} />
            <meshStandardMaterial color={look.beakColor} roughness={0.5} />
          </mesh>

          {look.cheekOpacity > 0.01 && (
            <>
              <Cheek x={-cheekX} y={cheekY} z={faceZ(cheekX, cheekY)} r={hr * 0.2} o={look.cheekOpacity} />
              <Cheek x={cheekX} y={cheekY} z={faceZ(cheekX, cheekY)} r={hr * 0.2} o={look.cheekOpacity} />
            </>
          )}

          {look.crest && <Crest hr={hr} color={look.beakColor} />}
          {look.crown && <Crown hr={hr} />}
          {look.sweat && <Sweat hr={hr} />}
        </group>

        {look.scarf && (
          <mesh position={[0, r * 1.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[r * 0.97, r * 0.14, 12, 36]} />
            <meshStandardMaterial color="#D9534F" roughness={0.9} />
          </mesh>
        )}

        {/* あし */}
        <Foot x={-r * 0.34} color={look.beakColor} r={r} />
        <Foot x={r * 0.34} color={look.beakColor} r={r} />
      </group>

      {look.sparkles && (
        <Sparkles count={24} scale={[2.4, 2.4, 1.6]} position={[0, 1.2, 0]} size={5} speed={0.4} color="#FFD66B" />
      )}
      <ContactShadows position={[0, 0, 0]} opacity={0.32} scale={5} blur={2.6} far={2} resolution={512} />
    </>
  )
}

/** ステージ0。殻のまま、ゆっくり傾くだけ */
function Egg({ look, animate }: Props) {
  const egg = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (!egg.current) return
    const t = state.clock.elapsedTime
    const amp = animate ? look.liveliness : 0
    egg.current.rotation.z = Math.sin(t * 1.3) * 0.12 * amp
    egg.current.position.y = Math.abs(Math.sin(t * 1.3)) * 0.04 * amp
  })

  return (
    <>
      {/* 揺れの支点を底にしたいので、殻は group の中で上にずらしておく */}
      <group ref={egg}>
        <mesh position={[0, 0.78, 0]} scale={[1, 1.3, 1]}>
          <sphereGeometry args={[0.6, 48, 32]} />
          <meshStandardMaterial color={look.bellyColor} roughness={0.7} />
        </mesh>
        {/* ひび。殻の表面（半径 0.6 の楕円体）ぎりぎりに薄い板を置く。
            少しでも内側に入れると殻に飲み込まれて見えなくなる */}
        {[
          { y: 1.02, rot: 0.6 },
          { y: 0.93, rot: -0.6 },
          { y: 0.84, rot: 0.6 },
        ].map((c) => (
          <mesh key={c.y} position={[0, c.y, 0.575]} rotation={[0, 0, c.rot]}>
            <boxGeometry args={[0.02, 0.13, 0.05]} />
            <meshStandardMaterial color="#9AA3AC" roughness={0.9} />
          </mesh>
        ))}
      </group>
      <ContactShadows position={[0, 0, 0]} opacity={0.32} scale={5} blur={2.6} far={2} resolution={512} />
    </>
  )
}

function Wing({ color, r, side }: { color: string; r: number; side: 1 | -1 }) {
  return (
    <mesh position={[side * r * 0.12, -r * 0.1, 0]} scale={[0.18, 0.52, 0.66]}>
      <sphereGeometry args={[r, 24, 20]} />
      <meshStandardMaterial color={color} {...SKIN} />
    </mesh>
  )
}

function Foot({ x, color, r }: { x: number; color: string; r: number }) {
  return (
    <mesh position={[x, r * 0.1, r * 0.18]} rotation={[-Math.PI / 2, 0, 0]}>
      <coneGeometry args={[r * 0.17, r * 0.3, 3]} />
      <meshStandardMaterial color={color} roughness={0.6} />
    </mesh>
  )
}

function Cheek({ x, y, z, r, o }: { x: number; y: number; z: number; r: number; o: number }) {
  return (
    <mesh position={[x, y, z]} scale={[1, 0.7, 0.4]}>
      <sphereGeometry args={[r, 16, 12]} />
      <meshStandardMaterial color="#F58A8A" transparent opacity={o} roughness={1} />
    </mesh>
  )
}

function Crest({ hr, color }: { hr: number; color: string }) {
  return (
    <group position={[0, hr * 0.92, 0]}>
      {[-1, 0, 1].map((i) => (
        <mesh key={i} position={[i * hr * 0.22, i === 0 ? hr * 0.08 : 0, 0]} rotation={[0, 0, i * -0.3]}>
          <coneGeometry args={[hr * 0.11, hr * 0.36, 8]} />
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
      ))}
    </group>
  )
}

function Crown({ hr }: { hr: number }) {
  const gold = useMemo(() => ({ color: '#F0B429', roughness: 0.28, metalness: 0.85 }), [])
  return (
    <group position={[0, hr * 1.02, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[hr * 0.44, hr * 0.06, 10, 28]} />
        <meshStandardMaterial {...gold} />
      </mesh>
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(a) * hr * 0.44, hr * 0.12, Math.sin(a) * hr * 0.44]}>
            <coneGeometry args={[hr * 0.08, hr * 0.22, 8]} />
            <meshStandardMaterial {...gold} />
          </mesh>
        )
      })}
    </group>
  )
}

/** しょんぼりのときの汗。SVG 版にもあった記号なので残している */
function Sweat({ hr }: { hr: number }) {
  return (
    <mesh position={[hr * 0.86, hr * 0.34, hr * 0.4]} scale={[0.8, 1.3, 0.8]}>
      <sphereGeometry args={[hr * 0.11, 16, 12]} />
      <meshStandardMaterial color="#5FA8D3" roughness={0.2} transparent opacity={0.85} />
    </mesh>
  )
}

/**
 * 目。活力レベルで形が変わる。
 * 曲線は「半分だけのトーラス」で作っている。向きを 180 度回すと
 * ∩（笑い）と ∪（しょんぼり）が同じ部品で作れる。
 */
function Eye({ shape, x, y, z, scale }: { shape: EyeShape; x: number; y: number; z: number; scale: number }) {
  const s = scale * 0.17
  const dark = '#1A2028'

  if (shape === 'open') {
    return (
      <group position={[x, y, z]}>
        <mesh>
          <sphereGeometry args={[s, 20, 16]} />
          <meshStandardMaterial color={dark} roughness={0.35} />
        </mesh>
        <mesh position={[s * 0.32, s * 0.34, s * 0.6]}>
          <sphereGeometry args={[s * 0.32, 12, 10]} />
          <meshStandardMaterial color="#fff" roughness={0.3} />
        </mesh>
      </group>
    )
  }

  if (shape === 'closed') {
    return (
      <mesh position={[x, y, z]}>
        <boxGeometry args={[s * 2, s * 0.36, s * 1.4]} />
        <meshStandardMaterial color={dark} roughness={0.5} />
      </mesh>
    )
  }

  // happy は ∩、half は ∪
  return (
    <mesh position={[x, y, z]} rotation={[0, 0, shape === 'happy' ? 0 : Math.PI]}>
      <torusGeometry args={[s, s * 0.3, 10, 20, Math.PI]} />
      <meshStandardMaterial color={dark} roughness={0.5} />
    </mesh>
  )
}
