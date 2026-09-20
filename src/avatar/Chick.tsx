import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ContactShadows, Sparkles, useAnimations, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { Look } from './look'
import chickUrl from './models/chick.glb?url'

type Props = {
  look: Look
  /** false なら揺れも跳ねもさせない（prefers-reduced-motion 対応） */
  animate: boolean
}

/**
 * ひよこ本体。Blender で作ったモデル（models/chick.blend）を読んで動かす。
 *
 * .blend そのものは three.js では読めないので、`models/export_glb.py` で
 * chick.glb に書き出したものを使う。**形を直したら書き出し直すこと。**
 *
 * 色・表情・姿勢は look.ts が決める。モデルは「形」だけを持っていて、
 * 色はここでマテリアルに流し込む。だからステージや活力の対応表を変えるときに
 * Blender を開く必要はない。
 */
export default function Chick({ look, animate }: Props) {
  if (look.isEgg) return <Egg look={look} animate={animate} />
  return <ChickModel look={look} animate={animate} />
}

// three.js に入った後のモデルの寸法（Y 上）。値は chick.glb の実測。
/** 足の裏。これを打ち消すと足が y=0 に乗る */
const FOOT_Y = -0.634
/** 頭のてっぺん。冠を乗せる高さの目安 */
const HEAD_TOP = 0.798
/** 一番太いところの半径。マフラーの大きさの目安 */
const BODY_R = 0.549

/** モデルの高さ（約1.6）を look.bodyRadius 基準の大きさに直す倍率 */
const SIZE = 1.42

/**
 * 歩く速さ（モデル空間の単位/秒）。Walk のクリップは1秒で2歩なので、
 * これを上げすぎると足が地面を滑って見える。
 */
const WALK_SPEED = 0.45
/** うろつく範囲。カメラの画角から出ない大きさにしてある */
const WANDER_R = 0.5

const AXIS_Z = new THREE.Vector3(0, 0, 1)

/** 目の縦の潰し具合。look.eye の4つの形に対応する */
const EYE_SQUASH: Record<Look['eye'], number> = {
  happy: 0.7,
  open: 1,
  half: 0.5,
  closed: 0.12,
}

function ChickModel({ look, animate }: Props) {
  const root = useRef<THREE.Group>(null)
  const rig = useRef<THREE.Group>(null)

  const { scene, animations } = useGLTF(chickUrl)

  // 胴体の塗り分け。Blender では「Bib マスク → 2色を Mix」で塗っているが、
  // glTF はノードの Mix を運べないので、マスクだけが頂点カラー（COLOR_0）で
  // 来ている。2色は look.ts が決めるので、ここで混ぜ直す。
  const tone = useMemo(
    () => ({ uTop: { value: new THREE.Color() }, uBib: { value: new THREE.Color() } }),
    []
  )

  // アバターは画面に複数出ることがある。読み込んだモデルは three.js が使い回すので、
  // そのまま色を塗ると全部のアバターが同じ色になる。複製してから触る。
  const model = useMemo(() => {
    const copy = scene.clone(true)
    copy.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone()
      mesh.material = mat
      if (mat.name === 'Body') {
        mat.onBeforeCompile = (shader) => {
          shader.uniforms.uTop = tone.uTop
          shader.uniforms.uBib = tone.uBib
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', 'uniform vec3 uTop;\nuniform vec3 uBib;\n#include <common>')
            // 既定の頂点カラーは「掛ける」処理。マスクの黒い側が潰れるので置き換える
            .replace('#include <color_fragment>', 'diffuseColor.rgb = mix(uTop, uBib, vColor.r);')
        }
      }
      // 目は白ハイライトごと頂点カラーに焼いてある。白で掛けてそのまま出す
      if (mat.name === 'Eye_Black') mat.color.setRGB(1, 1, 1)
      mat.roughness = mat.name === 'Eye_Black' ? 0.25 : 0.6
      mat.metalness = 0
    })
    return copy
  }, [scene, tone])

  // Blender の書き出しは**どのアクションにも全ボーンのキーを焼く**ので、
  // Blink にも脚や胴のトラック（素の姿勢）が入っている。そのまま重ねて流すと
  // まばたきが歩きを素の姿勢へ引き戻してしまう。目のトラックだけを Blink に、
  // それ以外を Walk / Jump に振り分けて、同時に流せるようにする。
  // 読み込んだクリップは three.js が使い回すので、複製してから削る。
  const clips = useMemo(
    () =>
      animations.map((source) => {
        const clip = source.clone()
        const eyesOnly = clip.name === 'Blink'
        clip.tracks = clip.tracks.filter((track) => track.name.startsWith('Eye') === eyesOnly)
        return clip
      }),
    [animations]
  )
  const { actions, mixer } = useAnimations(clips, rig)

  const parts = useMemo(
    () => ({
      wingL: model.getObjectByName('Wing_L'),
      wingR: model.getObjectByName('Wing_R'),
      feather: model.getObjectByName('HeadFeather'),
      eyes: [model.getObjectByName('Eye_L'), model.getObjectByName('Eye_R')],
    }),
    [model]
  )

  // 翼を羽ばたかせるとき、モデルが元々持っている傾きに足し込みたいので控えておく
  const rest = useMemo(
    () => ({
      wingL: parts.wingL?.quaternion.clone() ?? new THREE.Quaternion(),
      wingR: parts.wingR?.quaternion.clone() ?? new THREE.Quaternion(),
    }),
    [parts]
  )

  // 色は毎フレームではなく、look が変わったときだけ流し込む
  useEffect(() => {
    tone.uTop.value.set(look.bodyColor)
    tone.uBib.value.set(look.bellyColor)
    // 翼と頭の羽は「胴体よりやや暗いみどり」（設計図）。
    // 胴体の色から作るので、アバターの種類が増えても勝手に付いてくる。
    const accent = new THREE.Color(look.bodyColor).offsetHSL(0, 0.05, -0.16)
    model.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
      if (!mat) return
      if (mat.name === 'Beak_Orange' || mat.name === 'Foot_Orange') mat.color.set(look.beakColor)
      if (mat.name === 'Wing_Green' || mat.name === 'HeadFeather_Green') mat.color.copy(accent)
    })
  }, [model, tone, look.bodyColor, look.bellyColor, look.beakColor])

  // 成長で増える部位は、モデルのパーツを出し入れして表す
  useEffect(() => {
    if (parts.wingL) parts.wingL.visible = look.wings
    if (parts.wingR) parts.wingR.visible = look.wings
    if (parts.feather) parts.feather.visible = look.crest
  }, [parts, look.wings, look.crest])

  // 表情。モデルの目は丸い玉ひとつなので、潰して目つきを作る。
  // モーフを持たせれば本当に形を変えられるが、玉を潰すだけでも
  // 「にっこり／半目／閉じ」は十分読める。
  useEffect(() => {
    const squash = EYE_SQUASH[look.eye]
    for (const eye of parts.eyes) eye?.scale.set(1, squash, 1)
  }, [parts, look.eye])

  // まばたきと歩きは流しっぱなしにして、**重み**で出し入れする。
  // 毎回 play/stop すると歩き出しと止まりが瞬間的になって見える。
  // ジャンプだけは1回きりなので、跳ぶときに rewind して鳴らす。
  useEffect(() => {
    actions.Blink?.play()
    actions.Walk?.play().setEffectiveWeight(0)
    if (actions.Jump) {
      actions.Jump.setLoop(THREE.LoopOnce, 1)
      actions.Jump.clampWhenFinished = true
    }
    return () => {
      mixer.stopAllAction()
    }
  }, [actions, mixer])

  const s = look.bodyRadius * SIZE

  // 進化した瞬間だけ「ぽん」と跳ねさせるための状態。
  // 初回マウントでは鳴らさない（前のステージが分からないため）。
  const prevStage = useRef<number | null>(null)
  const pop = useRef(0)
  if (prevStage.current !== null && look.stage > prevStage.current) pop.current = 1
  prevStage.current = look.stage

  const flapQ = useMemo(() => new THREE.Quaternion(), [])

  // うろつきの状態。毎フレーム変わるので、再描画を起こさない ref に持つ。
  // 行き先は**原点まわりの絶対位置**で決める。「今の位置から前へ」にすると
  // 少しずつ流れていって、いつか画角から出る。
  const walk = useRef({
    mode: 'idle' as 'idle' | 'walk' | 'jump',
    /** この時間が尽きたら次の行動を選ぶ（秒） */
    timer: 1.4,
    /** Walk クリップの重み。0〜1 へなめらかに寄せる */
    weight: 0,
    target: new THREE.Vector2(),
    /** 向きたい方角（y 軸まわり） */
    heading: 0,
  })

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    const amp = animate ? look.liveliness : 0

    // 進化の跳ねを減衰させる
    pop.current = THREE.MathUtils.damp(pop.current, 0, 4, delta)
    const popScale = 1 + Math.sin(pop.current * Math.PI) * 0.22

    // クリップの進み方も活力で変える。止まる（amp=0）ときは時間ごと止める
    mixer.timeScale = amp > 0 ? 0.8 + 0.4 * amp : 0
    actions.Blink?.setEffectiveWeight(amp > 0 ? 1 : 0)
    const m = walk.current
    // 歩く速さは**見た目の大きさとクリップの再生速度に比例させる**。
    // どちらかだけ変えると歩幅と進む距離がずれて、足が地面を滑る
    const speed = WALK_SPEED * s * mixer.timeScale
    if (root.current) step(m, root.current, amp, delta, speed, actions.Jump)
    m.weight = THREE.MathUtils.damp(m.weight, m.mode === 'walk' ? 1 : 0, 9, delta)
    actions.Walk?.setEffectiveWeight(m.weight)

    if (root.current) {
      // 歩いている間は上下動を歩きのクリップに任せる（二重に弾んで見えるため）
      root.current.position.y = Math.sin(t * 2.1) * 0.035 * amp * (1 - m.weight)
      root.current.scale.setScalar(popScale)
      // やつれると前かがみになる
      root.current.rotation.x = THREE.MathUtils.damp(
        root.current.rotation.x,
        look.droop * 0.12,
        6,
        delta
      )
      // 進みたい方角へ向き直る。角度は最短まわりで寄せないと一周してしまう
      const turn = ((m.heading - root.current.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI
      root.current.rotation.y += turn * (1 - Math.exp(-7 * delta))
    }
    if (rig.current) {
      // 呼吸。横に膨らんだぶん縦を縮めて体積を保つ
      const b = 1 + Math.sin(t * 2.1) * 0.03 * amp
      rig.current.scale.set(s * b, s / b, s * b)
      // 縦に縮めたぶん足が浮くので、足の裏が y=0 に残るように押し下げる
      rig.current.position.y = -FOOT_Y * (s / b)
    }
    const flap = Math.sin(t * 3.4) * 0.3 * amp
    // 羽ばたきは親の座標系で足す。モデルが持っている傾きを壊さないため
    if (parts.wingL) {
      parts.wingL.quaternion.copy(flapQ.setFromAxisAngle(AXIS_Z, flap)).multiply(rest.wingL)
    }
    if (parts.wingR) {
      parts.wingR.quaternion.copy(flapQ.setFromAxisAngle(AXIS_Z, -flap)).multiply(rest.wingR)
    }
  })

  return (
    <>
      <group ref={root}>
        <group ref={rig} position={[0, -FOOT_Y * s, 0]} scale={s}>
          <primitive object={model} />
          {look.scarf && <Scarf />}
          {look.crown && <Crown />}
          {look.sweat && <Sweat />}
        </group>
        {/* キラキラは root の中に置く。外に出すと、歩いて離れたときに
            その場へ取り残される */}
        {look.sparkles && (
          <Sparkles count={24} scale={[2.4, 2.4, 1.6]} position={[0, 1.2, 0]} size={5} speed={0.4} color="#FFD66B" />
        )}
      </group>
      <ContactShadows position={[0, 0, 0]} opacity={0.32} scale={5} blur={2.6} far={2} resolution={512} />
    </>
  )
}

type Walk = {
  mode: 'idle' | 'walk' | 'jump'
  timer: number
  weight: number
  target: THREE.Vector2
  heading: number
}

/**
 * うろつきの進行。「しばらく立ち止まる → 歩いて移動する / ちょっと跳ぶ」を
 * 繰り返すだけの状態機械で、**位置と向きだけ**を決める。
 * 足の運びそのものは Blender の Walk / Jump クリップが持っている。
 *
 * `amp`（活力）が低いときは動き出さない。やつれたひよこは歩き回らない。
 */
function step(
  m: Walk,
  root: THREE.Group,
  amp: number,
  delta: number,
  speed: number,
  jump?: THREE.AnimationAction | null
) {
  const lively = amp > 0.25
  m.timer -= delta

  if (m.mode === 'idle') {
    m.heading = 0 // 立ち止まっているときは正面（カメラ）を向く
    if (m.timer <= 0) {
      if (!lively) {
        m.timer = 1
      } else if (jump && Math.random() < 0.35) {
        jump.reset().play()
        m.mode = 'jump'
        // 終わりは再生側（isRunning）で見る。こちらは念のための上限。
        // 活力が下がって mixer.timeScale が落ちると実時間では伸びるため
        m.timer = jump.getClip().duration * 3
      } else {
        // 行き先は原点まわりの円。奥行きは画角が狭いので浅くする
        const a = Math.random() * Math.PI * 2
        const r = 0.22 + Math.random() * (WANDER_R - 0.22)
        m.target.set(Math.cos(a) * r, Math.sin(a) * r * 0.55)
        m.mode = 'walk'
        m.timer = 6 // 保険。たどり着けなくてもいつかは止まる
      }
    }
    return
  }

  if (m.mode === 'jump') {
    if (!jump?.isRunning() || m.timer <= 0) {
      // 止めないと最終フレームの姿勢を重み1で押さえ続け、次の歩きと半々に混ざる
      jump?.stop()
      m.mode = 'idle'
      m.timer = 1.2 + Math.random() * 2.4
    }
    return
  }

  const dx = m.target.x - root.position.x
  const dz = m.target.y - root.position.z
  const dist = Math.hypot(dx, dz)
  if (dist < 0.04 || m.timer <= 0 || !lively) {
    m.mode = 'idle'
    m.timer = 1.2 + Math.random() * 2.4
    return
  }
  m.heading = Math.atan2(dx, dz) // モデルの正面は +Z（Blender の -Y）
  // 目標へ寄せるので「今の値に足す」で構わない（sin と違って位相がずれない）
  const d = Math.min(dist, speed * delta)
  root.position.x += (dx / dist) * d
  root.position.z += (dz / dist) * d
}

/**
 * ステージ5のマフラー。モデルには無いので、ここで巻く。
 * 頭と胴が一つの塊なので「首」が無い。くちばしの下端（y=0.17）より
 * 上に置くと顔を覆ってしまうので、一番太いあたりに巻く。
 */
function Scarf() {
  return (
    <mesh position={[0, 0.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[BODY_R * 1.04, 0.07, 12, 36]} />
      <meshStandardMaterial color="#D9534F" roughness={0.9} />
    </mesh>
  )
}

/** ステージ6の冠。頭の羽より下、頭が細くなり始める高さに嵌める */
function Crown() {
  const gold = useMemo(() => ({ color: '#F0B429', roughness: 0.28, metalness: 0.85 }), [])
  const r = 0.33
  return (
    <group position={[0, HEAD_TOP - 0.1, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[r, 0.045, 10, 28]} />
        <meshStandardMaterial {...gold} />
      </mesh>
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(a) * r, 0.09, Math.sin(a) * r]}>
            <coneGeometry args={[0.06, 0.17, 8]} />
            <meshStandardMaterial {...gold} />
          </mesh>
        )
      })}
    </group>
  )
}

/** しょんぼりのときの汗。顔の横に浮かべる */
function Sweat() {
  return (
    <mesh position={[0.5, 0.55, 0.28]} scale={[0.8, 1.3, 0.8]}>
      <sphereGeometry args={[0.085, 16, 12]} />
      <meshStandardMaterial color="#5FA8D3" roughness={0.2} transparent opacity={0.85} />
    </mesh>
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

// 先に読み込んでおく。ステージ1に上がった瞬間にひよこが出ないと間が抜ける
useGLTF.preload(chickUrl)
