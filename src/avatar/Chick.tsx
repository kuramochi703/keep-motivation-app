import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { ContactShadows, Sparkles, useAnimations, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { Look } from './look'
import chickUrl from './models/chick.glb?url'
import eggUrl from './models/egg.glb?url'

type Props = {
  look: Look
  /** false ならクリップを止めて立ち姿のままにする（prefers-reduced-motion 対応） */
  animate: boolean
  /** 歩き回れる範囲。枠の大きさで変わるので、外（AvatarCanvas）が決める */
  roam?: Roam
  /** たまごを割る（孵化の演出）。false → true になった瞬間に1回だけ流す */
  hatching?: boolean
  /** 触れるようにする。ひよこを叩くと光の粒が弾ける（ダッシュボード用） */
  interactive?: boolean
}

/** 歩き回れる範囲（ワールド座標。定位置を中心にした半径） */
export type Roam = { x: number; z: number }

/**
 * ひよこ本体。Blender で作ったモデル（models/chick.blend）を読んで動かす。
 *
 * .blend そのものは three.js では読めないので、`models/export_glb.py` で
 * chick.glb に書き出したものを使う。**形を直したら書き出し直すこと。**
 *
 * **姿勢の動きは全部モデルの中のクリップ**（Idle / Walk / TurnL / TurnR /
 * Rest / Slump / Sink / Jump / Blink）で、
 * ここがやるのは「どれを流すか」と「歩いた結果どこへ行くか」だけ。
 * 時刻から角度や大きさを作るような動きはここには置かない。
 * 足の運びや揺れを直したいときは Blender を開く。
 *
 * 色・表情・姿勢は look.ts が決める。モデルは色を持っていないので、
 * ここでマテリアルに流し込む。だからステージや活力の対応表を変えるときに
 * Blender を開く必要はない。
 */
export default function Chick({ look, animate, roam, hatching, interactive }: Props) {
  if (look.isEgg) return <Egg look={look} animate={animate} hatching={hatching} />
  return <ChickModel look={look} animate={animate} roam={roam} interactive={interactive} />
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

// 歩き回れる範囲の既定値（ワールド座標、中心が定位置）。カードの中に
// 収まる小さな枠（onboarding など）向けの値。ダッシュボードのように枠が
// 広い場面では、AvatarCanvas が枠の大きさから測った値を渡してくる。
/** 左右。これ以上行くと画面の外にはみ出す */
const ROAM_X = 0.5
/** 奥行き。遠近で大きさが変わって見えるので、左右より狭くしてある */
const ROAM_Z = 0.4
/** 範囲の指定がないときに使う、既定の狭い範囲 */
export const DEFAULT_ROAM: Roam = { x: ROAM_X, z: ROAM_Z }
/** 歩く速さ（毎秒）。Walk クリップの歩幅（1秒で2歩）に合う速さ */
const WALK_SPEED = 0.42
/** 向きを変える速さ。急に振り向くと滑って見える */
const TURN_RATE = 4.5
/** 向きがこれ以上ずれていたら、その場で向き直る（TurnL / TurnR を流す） */
const TURN_START = 0.5
/** 向き直りを終える残り角度。0 まで待つといつまでも足踏みする */
const TURN_DONE = 0.12
/** 立ち止まったあと、休憩に入る確率 */
const REST_CHANCE = 0.3

/**
 * 目（EyeL / EyeR）のトラックを持たせるクリップ。
 *
 * 目は姿勢とは別に動く（歩きながらまばたきする）ので、**目のトラックだけを
 * ここに挙げたクリップへ、残りを姿勢のクリップへ**振り分けて重ねて流す。
 * まばたき（Blink）と、**目を閉じたまま座る3本**（Rest / Slump / Sink）が
 * 目を書くので、**これらは重みを取り合わせる**（→ useFrame）。両方を重み1で
 * 流すと平均されて半目になる。
 */
const EYE_CLIPS = ['Blink', 'Rest', 'Slump', 'Sink']

/**
 * 叩かれたときに流すクリップ。**1タップにつき1本**を引く（→ `poke`）。
 * どれも1回きりで、終わったら立ち姿へ戻る。
 *
 * | クリップ | 長さ | 中身 |
 * | --- | --- | --- |
 * | `Poke` | 0.7秒 | びくっと仰け反って、揺り戻す |
 * | `Cheer` | 1.25秒 | 翼をぱたぱたさせながら小さく2回跳ねる |
 * | `Wave` | 1.08秒 | 片翼を上げて2往復振る |
 */
const REACTIONS = ['Poke', 'Cheer', 'Wave'] as const
type Reaction = (typeof REACTIONS)[number]

/** 重みを取り合う姿勢クリップ。ここに無い Idle が、余ったぶんを受け持つ */
const POSTURE = ['Walk', 'TurnL', 'TurnR', 'Rest', 'Slump', 'Sink', 'Jump', ...REACTIONS] as const
type Posture = (typeof POSTURE)[number]

/** 1回きりで流すクリップ。`reset().play()` で頭から鳴らし、**終わったら必ず止める** */
const ONE_SHOT = ['Jump', ...REACTIONS] as const

/**
 * 重みの寄せ方の速さ。休憩は遅くして「座り込む」間合いを作り、跳躍は即座に。
 * **落ち込みは休憩よりさらに遅い。** 崩れ落ちるところを見せたいので、
 * 沈むほど時間をかける
 */
const RATE: Record<Posture, number> = {
  Walk: 9, TurnL: 9, TurnR: 9, Rest: 3.5, Slump: 2.4, Sink: 1.6, Jump: 20,
  // 叩かれた反応は**跳躍と同じで即座に。** 寄せるのに時間をかけると、
  // 叩いてから動き出すまでが遅れて、自分の操作の結果に見えなくなる
  Poke: 20, Cheer: 20, Wave: 20,
}

/** 目を閉じたまま座るクリップ。まばたきと重みを取り合う */
const SHUT_EYES = ['Rest', 'Slump', 'Sink'] as const

/** 目の縦の潰し具合。look.eye の4つの形に対応する */
const EYE_SQUASH: Record<Look['eye'], number> = {
  happy: 0.7,
  open: 1,
  half: 0.5,
  closed: 0.12,
}

/** 揺れから割れへ重みを寄せる速さ。割れは待たせるものではないので速い */
const CRACK_RATE = 14

function ChickModel({ look, animate, roam: area = DEFAULT_ROAM, interactive = false }: Props) {
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
  // まばたきが歩きを素の姿勢へ引き戻してしまう。目のトラックを持つのは
  // EYE_CLIPS だけ、他は目のトラックを落とす、と振り分けて同時に流せるようにする。
  // 読み込んだクリップは three.js が使い回すので、複製してから削る。
  const clips = useMemo(
    () =>
      animations.map((source) => {
        const clip = source.clone()
        clip.tracks = clip.tracks.filter((track) =>
          // 目のトラックは EYE_CLIPS だけが持つ。
          // 逆に Blink は目だけのクリップなので、姿勢のトラックを全部落とす
          track.name.startsWith('Eye') ? EYE_CLIPS.includes(clip.name) : clip.name !== 'Blink'
        )
        return clip
      }),
    [animations]
  )
  const { actions, mixer } = useAnimations(clips, rig)

  const parts = useMemo(() => {
    const feather = model.getObjectByName('HeadFeather')
    return {
      wingL: model.getObjectByName('Wing_L'),
      wingR: model.getObjectByName('Wing_R'),
      feather,
      // とさかは大きさを変えるので、モデルが元々持っている倍率を控えておく。
      // これを無視して直に入れると、Blender 側で大きさを調整した分が消える
      featherScale: feather?.scale.clone() ?? new THREE.Vector3(1, 1, 1),
      eyes: [model.getObjectByName('Eye_L'), model.getObjectByName('Eye_R')],
    }
  }, [model])

  // 色は毎フレームではなく、look が変わったときだけ流し込む
  useEffect(() => {
    tone.uTop.value.set(look.bodyColor)
    tone.uBib.value.set(look.bellyColor)
    // 翼と頭の羽は「胴体よりやや暗いみどり」（設計図）。
    // 胴体の色から作るので、アバターの種類が増えても勝手に付いてくる。
    // 暗くしすぎると翼だけ沈んで見える。胴体がパステルなので、差は控えめでいい
    const accent = new THREE.Color(look.bodyColor).offsetHSL(0, 0.04, -0.12)
    model.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
      if (!mat) return
      if (mat.name === 'Beak_Orange' || mat.name === 'Foot_Orange') mat.color.set(look.beakColor)
      if (mat.name === 'Wing_Green' || mat.name === 'HeadFeather_Green') mat.color.copy(accent)
    })
  }, [model, tone, look.bodyColor, look.bellyColor, look.beakColor])

  // 成長で増える部位は、モデルのパーツを出し入れして表す。
  // とさか（HeadFeather）だけは例外で、**常に出したまま大きさだけ変える。**
  // 隠すとひよこに見えなくなるので、消さないこと。
  useEffect(() => {
    if (parts.wingL) parts.wingL.visible = look.wings
    if (parts.wingR) parts.wingR.visible = look.wings
    if (parts.feather) {
      parts.feather.visible = look.crest
      parts.feather.scale.copy(parts.featherScale).multiplyScalar(look.crestScale)
    }
  }, [parts, look.wings, look.crest, look.crestScale])

  // 表情。モデルの目は丸い玉ひとつなので、潰して目つきを作る。
  // モーフを持たせれば本当に形を変えられるが、玉を潰すだけでも
  // 「にっこり／半目／閉じ」は十分読める。
  useEffect(() => {
    const squash = EYE_SQUASH[look.eye]
    for (const eye of parts.eyes) eye?.scale.set(1, squash, 1)
  }, [parts, look.eye])

  // まばたきと姿勢のクリップは流しっぱなしにして、**重み**で出し入れする。
  // 毎回 play/stop すると歩き出しと止まりが瞬間的になって見える。
  // ジャンプだけは1回きりなので、跳ぶときに rewind して鳴らす。
  useEffect(() => {
    actions.Blink?.play()
    // 姿勢のクリップは全部流しっぱなしにして、重みだけで出し入れする。
    // Idle が既定で、他がゼロのぶんを受け持つ（→ useFrame）
    for (const name of POSTURE) actions[name]?.play().setEffectiveWeight(0)
    actions.Idle?.play().setEffectiveWeight(1)
    for (const name of ONE_SHOT) {
      const action = actions[name]
      if (!action) continue
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
    }
    return () => {
      mixer.stopAllAction()
    }
  }, [actions, mixer])

  const s = look.bodyRadius * SIZE

  // 叩かれたときに、反応のクリップを1本流す。
  // **再描画は起こさない。** 流すクリップは毎フレーム見る側（useFrame）の
  // 持ち物なので、ref に書いて状態機械へ渡すだけでいい
  const poke = useCallback((e: ThreeEvent<PointerEvent>) => {
    // 3D の当たり判定は奥のものまで一度に拾う。手前の1つで止める
    e.stopPropagation()
    // 「視差効果を減らす」設定のときは動かさない。跳ねる・仰け反るは
    // まさにその設定が避けたい動きなので、姿勢と同じ扱いにする
    if (!animate) return

    // **直前と違うものを引く。** 同じ動きが2回続くと、反応しているのではなく
    // 決まった演出が再生されているように見える
    const m = playing.current
    const choices = REACTIONS.filter((name) => name !== m.reaction)
    const next = choices[Math.floor(Math.random() * choices.length)]
    const action = actions[next]
    if (!action) return

    // 連打されたときに前の1本を残さない。**止めないと最終フレームの姿勢を
    // 重み1で押さえ続けて、次の動きと半々に混ざる**（Jump と同じ落とし穴）
    if (m.reaction && m.reaction !== next) actions[m.reaction]?.stop()
    actions.Jump?.stop()
    action.reset().play()
    m.reaction = next
    m.mode = 'react'
    // 念のための上限。終わりは再生側（isRunning）で見る
    m.timer = action.getClip().duration * 3
  }, [animate, actions])

  // 触れると分かるように、ひよこの上ではカーソルを指に変える。
  // **キャンバスは枠いっぱいなので、body に当てないと元に戻せない**
  const hover = useCallback((on: boolean) => {
    document.body.style.cursor = on ? 'pointer' : ''
  }, [])
  useEffect(() => () => { document.body.style.cursor = '' }, [])

  // いま流しているクリップと、どこに立っているか。
  // 毎フレーム変わるので、再描画を起こさない ref に持つ
  const walker = useRef<THREE.Group>(null)
  const playing = useRef<Walker>({
    mode: 'idle',
    next: 'idle',
    turningLeft: true,
    timer: 1.4,
    weight: { Walk: 0, TurnL: 0, TurnR: 0, Rest: 0, Slump: 0, Sink: 0, Jump: 0, Poke: 0, Cheer: 0, Wave: 0 },
    reaction: null,
    x: 0,
    z: 0,
    heading: 0,
    facing: 0,
  })

  useFrame((_, delta) => {
    // **足の運びも胴の揺れもここでは作らない。** 見えている動きはモデルの
    // クリップが持っている。ここが決めるのは「どれを流すか」「どれくらいの
    // 重みで混ぜるか」、そして「歩いた結果どこへ行くか」の3つだけ。
    mixer.timeScale = animate ? 1 : 0
    // 止めているときは状態機械ごと凍らせる（prefers-reduced-motion）。
    // 重みを寄せ続けると、クリップが止まっていても姿勢が動いてしまう
    if (!animate) {
      actions.Blink?.setEffectiveWeight(0)
      return
    }

    const m = playing.current
    pick(m, look.liveliness, delta, actions)

    // **重みの合計は1。** 余りは Idle（立ち止まりの呼吸）が受け持つ。
    // 0/1 を直に入れると切り替わりが瞬間的になるので、寄せていく。
    // 休憩だけは遅くして「座り込む・立ち上がる」の間合いを作る
    const now = clipOf(m, look.sit)
    let idle = 1
    for (const name of POSTURE) {
      m.weight[name] = THREE.MathUtils.damp(m.weight[name], name === now ? 1 : 0, RATE[name], delta)
      actions[name]?.setEffectiveWeight(m.weight[name])
      idle -= m.weight[name]
    }
    actions.Idle?.setEffectiveWeight(Math.max(0, idle))
    // **目は姿勢とは別の取り合い。** 目を書くのは Blink と、座り込む3本
    // （Rest / Slump / Sink）。座り込む側は目を閉じたまま固定なので、
    // 入ってきたぶんだけ Blink を下げる。両方を重み1で流すと、開いた目と
    // 閉じた目が平均されて半目のまま止まる
    const shut = SHUT_EYES.reduce((sum, name) => sum + m.weight[name], 0)
    actions.Blink?.setEffectiveWeight(Math.max(0, 1 - shut))

    roam(m, delta, area)
    const g = walker.current
    if (g) {
      g.position.set(m.x, 0, m.z)
      g.rotation.y = m.facing
    }
  })

  return (
    <>
      {/* 歩いて動くのはこの入れ物ごと。中の姿勢はクリップが作る */}
      <group ref={walker}>
        {/* やつれると前かがみになる。これは姿勢であって動きではないので、
            毎フレーム寄せるのではなく look が変わったときにそのまま入れる */}
        <group rotation={[look.droop * 0.12, 0, 0]}>
          <group ref={rig} position={[0, -FOOT_Y * s, 0]} scale={s}>
            <primitive object={model} />
            {/* 叩かれたことに気づくための当たり判定。**モデルそのものは使わない。**
                スキンメッシュの当たり判定は素の姿勢の大きさで測られるので、
                歩いている途中や座り込んでいる間にずれる。ひよこを包む箱を
                別に置いて、こちらで受ける。
                `visible={false}` にすると当たり判定からも外れてしまうので、
                「見えているが何も描かない」材質にしてある */}
            {interactive && (
              <mesh
                position={[0, (FOOT_Y + HEAD_TOP) / 2, 0]}
                onPointerDown={poke}
                onPointerOver={() => hover(true)}
                onPointerOut={() => hover(false)}
              >
                <boxGeometry args={[BODY_R * 2.4, HEAD_TOP - FOOT_Y, BODY_R * 2.4]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            )}
            {look.scarf && <Scarf />}
            {look.crown && <Crown />}
            {look.sweat && <Sweat />}
            {/* かがやき（7サイクル連続）だけの豪華なエフェクト。
                まわりを舞う光の粒。**色はアバターの色相に合わせる** */}
            {look.sparkle && (
              <Sparkles
                count={26}
                scale={[2.2, 2.4, 2.2]}
                size={5}
                speed={0.35}
                opacity={0.9}
                color={look.bellyColor}
              />
            )}
          </group>
        </group>
      </group>
      {/* 影の板は歩き回る範囲ぜんぶを覆う。狭いと端で影が切れる */}
      <ContactShadows
        position={[0, 0, 0]}
        opacity={0.32}
        scale={[Math.max(5, area.x * 2 + 2.4), Math.max(5, area.z * 2 + 2.4)]}
        blur={2.6}
        far={2}
        resolution={512}
      />
    </>
  )
}

type Mode = 'idle' | 'walk' | 'turn' | 'jump' | 'rest' | 'react'

type Walker = {
  mode: Mode
  /** 向き直りが終わったら入るモード。歩く前の向き直りか、ただ正面に戻るだけか */
  next: 'idle' | 'walk'
  /** 向き直りで回る向き。TurnL / TurnR のどちらを流すか */
  turningLeft: boolean
  /** 次に切り替えるまでの残り秒 */
  timer: number
  /** 姿勢クリップそれぞれの重み 0〜1 */
  weight: Record<Posture, number>
  /** 叩かれて流している最中のクリップ。**次に引くときの「直前」でもある** */
  reaction: Reaction | null
  /** 定位置からのずれ */
  x: number
  z: number
  /** 行きたい方向（Y 回転。0 がカメラ向き） */
  heading: number
  /** いま向いている方向。heading へ少しずつ寄せる */
  facing: number
}

/** 行きたい方向まであと何ラジアン。左回りが正（three.js の Y 回転と同じ向き） */
const turnLeft = (m: Walker) => ((m.heading - m.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI

/**
 * いまのモードで流すクリップ。`null`（＝ idle）のときは、
 * どれも重み0になって Idle が余りを全部受け持つ。
 *
 * 向き直りだけは**左右で別のクリップ**。傾ける向きが逆なので1本にできない。
 *
 * 座り込みは気分で3本に分かれる（`sit`）。休憩・うずくまり・伏せ。
 * どれを使うかは look.ts が決めるので、ここは受け取って流すだけ。
 */
function clipOf(m: Walker, sit: Look['sit']): Posture | null {
  if (m.mode === 'react') return m.reaction
  if (m.mode === 'walk') return 'Walk'
  if (m.mode === 'rest') return sit
  if (m.mode === 'jump') return 'Jump'
  if (m.mode === 'turn') return m.turningLeft ? 'TurnL' : 'TurnR'
  return null
}

/** その場で向き直りに入る。終わったら `next` のモードへ移る */
function startTurn(m: Walker, next: 'idle' | 'walk') {
  m.mode = 'turn'
  m.next = next
  // 左右どちらへ回るかは**入るときに決めて固定する。** 毎フレーム見ると、
  // 回り終わりぎわに残り角度が符号をまたいでクリップが入れ替わる
  m.turningLeft = turnLeft(m) > 0
  m.timer = 2.5   // 念のための上限。回り切れないまま足踏みし続けるのを防ぐ
}

/**
 * 次にどのクリップを流すかを決めるだけの状態機械。
 * 「立ち止まる → 向き直る → 歩く／跳ぶ／座って休む」を繰り返す。
 * 見せる動きそのものは全部 Blender のクリップが持っている。
 *
 * **向きが大きくずれたら必ず向き直りを挟む。** 立ったままぬるっと回ると
 * 足が地面を滑って見えるので、足踏みするクリップを出してから回す。
 *
 * `amp`（気分の `liveliness`）が低いときは歩かず、座り込んで休む。
 * **閾値はうつむき（0.2）より下に置く。** ここを 0.25 のままにすると、
 * 「2サイクル放置」でいきなり座り込んでしまい、ぐったり（0.0）と区別が
 * つかなくなる（README 2章）。
 */
function pick(m: Walker, amp: number, delta: number, actions: Record<string, THREE.AnimationAction | null>) {
  const lively = amp > 0.15
  const jump = actions.Jump
  m.timer -= delta

  // 叩かれた反応。**気分や時間の都合より優先する。** ここを待たせると、
  // 叩いたのに歩き続ける、という一番がっかりする見え方になる
  if (m.mode === 'react') {
    const action = m.reaction ? actions[m.reaction] : null
    if (!action?.isRunning() || m.timer <= 0) {
      action?.stop()
      m.mode = 'idle'
      // 反応の直後は間を置く。すぐ歩き出すと、叩かれたことを忘れたように見える
      m.timer = 0.8 + Math.random() * 1.2
    }
    return
  }

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

  if (m.mode === 'turn') {
    // 回り切ったら次へ。timer 切れは保険（回り込めないまま足踏みし続けない）
    if (Math.abs(turnLeft(m)) < TURN_DONE || m.timer <= 0) {
      m.mode = m.next
      m.timer = m.next === 'walk' ? 2 + Math.random() * 2.5 : 1.2 + Math.random() * 2.4
    }
    return
  }

  if (m.mode === 'walk' && !lively) {
    m.mode = 'idle'
    m.timer = 1
    return
  }

  // 立ち止まっている／休んでいるのに向きがずれている（歩き終わって正面に
  // 戻るときなど）。時間が来るのを待たずに向き直る
  if ((m.mode === 'idle' || m.mode === 'rest') && Math.abs(turnLeft(m)) > TURN_START) {
    startTurn(m, 'idle')
    return
  }
  if (m.timer > 0) return

  if (m.mode === 'walk' || m.mode === 'rest') {
    m.mode = 'idle'
    m.timer = 1.2 + Math.random() * 2.4
  } else if (!lively || Math.random() < REST_CHANCE) {
    // やつれているときは立ったままにせず座り込ませる。休むほど絵が持つ
    m.mode = 'rest'
    m.timer = lively ? 4 + Math.random() * 4 : 6 + Math.random() * 4
  } else if (jump && Math.random() < 0.4) {
    jump.reset().play()
    m.mode = 'jump'
    m.timer = jump.getClip().duration * 3
  } else {
    // 行き先を決めてから、その方へ向き直って歩き出す。
    // カメラに尻を向けたままにならないよう、正面から左右 100 度までで選ぶ
    m.heading = (Math.random() * 2 - 1) * 1.75
    startTurn(m, 'walk')
  }
}

/**
 * 歩いた結果どこへ行くかだけを進める。**姿勢は一切触らない。**
 * 足を運ぶ・胴が揺れるといった見た目は Walk クリップが作っていて、
 * ここは「その場足踏み」を実際の移動に変えているだけ。
 *
 * 位置と向きだけは Blender に置けない。クリップに移動を焼くと毎回同じ道順に
 * なり、画面からもはみ出す。どこへ行くかはコードが決めるしかない。
 */
function roam(m: Walker, delta: number, area: Roam) {
  if (m.mode === 'walk') {
    // 端まで来たら向き直す。壁で止まるのではなく、ぐるっと回って戻る
    if (Math.abs(m.x) > area.x || Math.abs(m.z) > area.z) {
      m.heading = Math.atan2(-m.x, -m.z)
    }
    // クリップの重みぶんだけ、**いま向いている方向へ**進む。
    // 行きたい方向（heading）へ直に進めると、振り向く途中で横滑りして見える
    const step = WALK_SPEED * m.weight.Walk * delta
    m.x += Math.sin(m.facing) * step
    m.z += Math.cos(m.facing) * step
  } else if (m.mode === 'idle' || m.mode === 'rest') {
    // 立ち止まったらカメラの方に向き直る。顔が見えないままだと寂しい。
    // ずれが大きければ pick が向き直りのクリップを出す
    m.heading = 0
  }

  // 向きは寄せる。ここは「向き」であって動きの作り込みではない。
  // 歩きと向き直りのとき以外は回さない（座ったまま回ると足が滑って見える）
  if (m.mode === 'walk' || m.mode === 'turn') {
    m.facing += turnLeft(m) * Math.min(1, delta * TURN_RATE)
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
 * ステージ0のたまご。**ひよこと同じで、形も動きも Blender のモデルが持っている**
 * （models/egg.blend → egg.glb）。ここがやるのは色を入れることと、
 * 「いつ割るか」を決めることだけ。
 *
 * クリップは2本。
 *
 * | クリップ | 長さ | 中身 |
 * | --- | --- | --- |
 * | `EggIdle` | 2.5秒 | ゆっくり左右に揺れる。ループ |
 * | `EggCrack` | 3.0秒 | ひびが入り、上半分が飛んで横に転がる。**1回きり** |
 *
 * `hatching` が true になった瞬間に `EggCrack` を頭から流し、そのぶん
 * `EggIdle` の重みを下げる（**合計1**。ひよこの姿勢クリップと同じ約束）。
 * 割れ終わりは `clampWhenFinished` で最後の姿のまま止まる。
 */
function Egg({ look, animate, hatching = false }: { look: Look; animate: boolean; hatching?: boolean }) {
  const rig = useRef<THREE.Group>(null)
  const { scene, animations } = useGLTF(eggUrl)

  // ひよこと同じ理由で複製してから触る。読み込んだモデルは three.js が
  // 使い回すので、そのまま塗るとすべてのたまごが同じ色になる
  const model = useMemo(() => {
    const copy = scene.clone(true)
    copy.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone()
      mesh.material = mat
      mat.roughness = 0.65
      mat.metalness = 0
    })
    return copy
  }, [scene])

  const { actions, mixer } = useAnimations(animations, rig)

  // 殻の色。**たまごは気分を持たないので、look.ts で色相以外を固定した
  // 淡い色**（彩度24 / 明度88）が来る。割れ口（Egg_Inner）だけ一段濃くする。
  // 同じ色にすると、割れても切り口が平らな面に見えて「割れた」と読めない
  useEffect(() => {
    const inner = new THREE.Color(look.bellyColor).offsetHSL(0, 0.10, -0.18)
    model.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
      if (!mat) return
      if (mat.name === 'Egg_Shell') mat.color.set(look.bellyColor)
      if (mat.name === 'Egg_Inner') mat.color.copy(inner)
    })
  }, [model, look.bellyColor])

  useEffect(() => {
    actions.EggIdle?.play().setEffectiveWeight(1)
    return () => {
      mixer.stopAllAction()
    }
  }, [actions, mixer])

  // 割れ始めたか。**再生側（isRunning）では見分けられない。**
  // 割れ終わると一時停止になって false に戻るが、そのときも殻は割れたまま
  const cracked = useRef(false)
  const weight = useRef(0)

  useEffect(() => {
    if (!hatching || cracked.current) return
    cracked.current = true
    const crack = actions.EggCrack
    if (!crack) return
    // ジャンプと同じ扱い。1回きりで、終わったら最後の姿のまま止める
    crack.setLoop(THREE.LoopOnce, 1)
    crack.clampWhenFinished = true
    crack.reset().play()
  }, [hatching, actions])

  useFrame((_, delta) => {
    mixer.timeScale = animate ? 1 : 0
    if (!animate) {
      // 動きを止めている人（prefers-reduced-motion）には、割れる過程ではなく
      // **割れた姿だけ**を渡す。ひよこと同じに「止めたら何もしない」にすると、
      // たまごが永久に割れないままになる
      const crack = actions.EggCrack
      if (cracked.current && crack) {
        crack.time = crack.getClip().duration
        crack.setEffectiveWeight(1)
        actions.EggIdle?.setEffectiveWeight(0)
      }
      return
    }
    // 揺れている途中で割れ始めるので、重みは寄せる。0/1 を直に入れると
    // 傾いた姿から素の姿へ飛ぶ
    weight.current = THREE.MathUtils.damp(weight.current, cracked.current ? 1 : 0, CRACK_RATE, delta)
    actions.EggCrack?.setEffectiveWeight(weight.current)
    actions.EggIdle?.setEffectiveWeight(1 - weight.current)
  })

  return (
    <>
      <group ref={rig}>
        <primitive object={model} />
      </group>
      <ContactShadows position={[0, 0, 0]} opacity={0.32} scale={5} blur={2.6} far={2} resolution={512} />
    </>
  )
}

// 先に読み込んでおく。ステージ1に上がった瞬間にひよこが出ないと間が抜ける
useGLTF.preload(chickUrl)
useGLTF.preload(eggUrl)
