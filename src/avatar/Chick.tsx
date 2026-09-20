import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ContactShadows, useAnimations, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { Look } from './look'
import chickUrl from './models/chick.glb?url'

type Props = {
  look: Look
  /** false ならクリップを止めて立ち姿のままにする（prefers-reduced-motion 対応） */
  animate: boolean
}

/**
 * ひよこ本体。Blender で作ったモデル（models/chick.blend）を読んで動かす。
 *
 * .blend そのものは three.js では読めないので、`models/export_glb.py` で
 * chick.glb に書き出したものを使う。**形を直したら書き出し直すこと。**
 *
 * **動いて見えるものは全部モデルの中のクリップ**（Walk / Blink / Jump）で、
 * ここがやるのは「どれを流すか」を決めることだけ。時刻から角度や大きさを
 * 作るような動きはここには置かない。直したいときは Blender を開く。
 *
 * 色・表情・姿勢は look.ts が決める。モデルは色を持っていないので、
 * ここでマテリアルに流し込む。だからステージや活力の対応表を変えるときに
 * Blender を開く必要はない。
 */
export default function Chick({ look, animate }: Props) {
  if (look.isEgg) return <Egg look={look} />
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

/** 目の縦の潰し具合。look.eye の4つの形に対応する */
const EYE_SQUASH: Record<Look['eye'], number> = {
  happy: 0.7,
  open: 1,
  half: 0.5,
  closed: 0.12,
}

function ChickModel({ look, animate }: Props) {
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

  // いま流しているクリップ。毎フレーム変わるので、再描画を起こさない ref に持つ
  const playing = useRef({ mode: 'idle' as Mode, timer: 1.4, weight: 0 })

  useFrame((_, delta) => {
    // **ここでは何も動かさない。** 見えている動きはモデルのクリップが作る。
    // 決めるのは「どれを流すか」と「どれくらいの重みで混ぜるか」だけ。
    mixer.timeScale = animate ? 1 : 0
    actions.Blink?.setEffectiveWeight(animate ? 1 : 0)

    const m = playing.current
    pick(m, animate ? look.liveliness : 0, delta, actions.Jump)
    // 歩きは重みで出し入れする。0/1 を直に入れると歩き出しと止まりが瞬間的になる
    m.weight = THREE.MathUtils.damp(m.weight, m.mode === 'walk' ? 1 : 0, 9, delta)
    actions.Walk?.setEffectiveWeight(m.weight)
  })

  return (
    <>
      {/* やつれると前かがみになる。これは姿勢であって動きではないので、
          毎フレーム寄せるのではなく look が変わったときにそのまま入れる */}
      <group rotation={[look.droop * 0.12, 0, 0]}>
        <group ref={rig} position={[0, -FOOT_Y * s, 0]} scale={s}>
          <primitive object={model} />
          {look.scarf && <Scarf />}
          {look.crown && <Crown />}
          {look.sweat && <Sweat />}
        </group>
      </group>
      <ContactShadows position={[0, 0, 0]} opacity={0.32} scale={5} blur={2.6} far={2} resolution={512} />
    </>
  )
}

type Mode = 'idle' | 'walk' | 'jump'

/**
 * 次にどのクリップを流すかを決めるだけの状態機械。
 * 「しばらく立ち止まる → 歩く / ちょっと跳ぶ」を繰り返す。
 * 見せる動きそのものは全部 Blender のクリップが持っている。
 *
 * `amp`（活力）が低いときは立ち止まったまま。やつれたひよこは歩き出さない。
 */
function pick(
  m: { mode: Mode; timer: number; weight: number },
  amp: number,
  delta: number,
  jump?: THREE.AnimationAction | null
) {
  const lively = amp > 0.25
  m.timer -= delta

  if (m.mode === 'jump') {
    // 終わりは再生側（isRunning）で見る。timer は念のための上限。
    // **止めないと最終フレームの姿勢を重み1で押さえ続け、次の歩きと半々に混ざる。**
    if (!jump?.isRunning() || m.timer <= 0) {
      jump?.stop()
      m.mode = 'idle'
      m.timer = 1.2 + Math.random() * 2.4
    }
    return
  }

  if (m.mode === 'walk' && !lively) {
    m.mode = 'idle'
    m.timer = 1
    return
  }
  if (m.timer > 0) return

  if (m.mode === 'walk' || !lively) {
    m.mode = 'idle'
    m.timer = lively ? 1.2 + Math.random() * 2.4 : 1
  } else if (jump && Math.random() < 0.4) {
    jump.reset().play()
    m.mode = 'jump'
    m.timer = jump.getClip().duration * 3
  } else {
    m.mode = 'walk'
    m.timer = 2 + Math.random() * 2.5
  }
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

/**
 * ステージ0。殻のまま止まっている。
 * たまごには Blender のモデルが無く、ここで球を置いているだけなので、
 * 動かすと「コードで作った動き」になってしまう（→ 上の方針）。
 */
function Egg({ look }: { look: Look }) {
  return (
    <>
      <group>
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
