import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'

/**
 * 気分に連動するまわりのエフェクト。**どれも three.js のシェーダーで描く。**
 *
 * Blender のパーティクルや発光は glTF に載らないので、モデル側には置けない。
 * 形（どこに・どう動くか）は全部ここで持ち、出すかどうかは気分の表（MOODS）が決める。
 *
 * | 部品 | 中身 | いつ（logic.ts の `MOODS`） |
 * | --- | --- | --- |
 * | `Glow` | 背中の後光（放射状の光の筋）と、ぱっと光って消える星 ✦ | かがやき |
 * | `Motes` | 足元から立ちのぼって消える光の粒 | いきいき・かがやき |
 * | `Gloom` | 頭の上の雨雲と雨粒、背中に垂れる縦線（ずーん） | ぐったり・しずみこみ |
 *
 * **虫っぽく見せないための約束。** 以前の drei `Sparkles` は丸い点が
 * てんでばらばらに漂っていて、コバエに見えた。ここでは
 *
 * - 粒は**全部同じ向き**（下から上へ、同じ向きにゆっくり回りながら）に動かす
 * - 生まれるときと消えるときは**必ずフェード**する。ふっと湧いてふっと消える
 * - 光の芯を白く、ふちを金色にして「光」に見せる。大きい粒には十字の光芒を付ける
 *
 * 色はアバターの色相ではなく**金色に固定**する。背景のアクセント色がアバターの
 * 色相に連動している（ui/useAccent.ts）ので、同じ色相で塗ると背景に溶けて消える。
 *
 * 時間は `animate` が false（視差効果を減らす）のとき止める。止めた絵でも
 * それらしく見える時刻（`STILL`）で固める。
 */

/** 止めたときに見せる時刻。粒がほどよく散らばっている瞬間 */
const STILL = 1.7

/**
 * 光の色。にじみの金色と、芯の白。
 *
 * **「光って見える」かどうかは色そのものより塗り分けで決まる。** 本物の光は
 * 明るいところほど白く飛び、色は外側の淡いにじみにしか残らない。全体を金色で
 * 塗ると、明るくしても「色の付いた絵の具」に見える。だからシェーダーでは
 * **明るさに応じて金色 → 白へ寄せる**（`glowColor`）。
 *
 * **にじみの色は淡いクリーム色に抑える。** 濃い山吹色にすると、芯を白く
 * 飛ばしても外側がオレンジの輪として残り、光ではなく色に見える
 */
const GOLD = new THREE.Color('hsl(46, 85%, 74%)')
const CORE = new THREE.Color('hsl(50, 100%, 98%)')

/** 明るさ（0〜1）から色を決める。明るいほど白く飛ぶ */
const GLOW_COLOR = /* glsl */ `
  vec3 glowColor(vec3 gold, vec3 core, float intensity) {
    return mix(gold, core, smoothstep(0.45, 0.95, intensity));
  }
`

type Common = {
  /** ひよこの背の高さ（ワールド単位）。エフェクトの大きさはこれに合わせる */
  height: number
  animate: boolean
}

/** 経過時間の uniform を進める。止めているときは STILL で固める */
function useClock(uniforms: { uTime: { value: number } }, animate: boolean) {
  useFrame((_, delta) => {
    if (animate) uniforms.uTime.value += delta
    else uniforms.uTime.value = STILL
  })
}

/** 粒の大きさを画素に直す係数。**枠の高さと画素比で変わる**ので、毎フレーム入れる */
function usePointScale(uniforms: { uScale: { value: number } }) {
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const camera = useThree((s) => s.camera)
  useFrame(() => {
    uniforms.uScale.value = size.height * dpr * 0.5 * camera.projectionMatrix.elements[5]
  })
}

/**
 * シェーダーのマテリアルを1つ作る。**JSX の `<shaderMaterial uniforms={...}>` は
 * 使わない。** そちらだと渡した uniforms が複製されて、毎フレーム書き換えた値
 * （時間・粒の大きさ）がシェーダーに届かない。自分で作って参照を握っておく
 */
function useShader(uniforms: Record<string, THREE.IUniform>, vertexShader: string, fragmentShader: string) {
  const material = useMemo(
    () => new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false }),
    [uniforms, vertexShader, fragmentShader]
  )
  useEffect(() => () => material.dispose(), [material])
  return material
}

/** 粒1つずつの乱数。x: 角度、y: 半径、z: 位相、w: 大きさ */
function useSeeds(count: number) {
  return useMemo(() => {
    const seeds = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) {
      // 位相は等間隔にずらす。乱数だけだと同じ瞬間に固まって湧く
      seeds.set([Math.random(), Math.random(), i / count + Math.random() * 0.1, Math.random()], i * 4)
    }
    const geo = new THREE.BufferGeometry()
    // 位置はシェーダーが作る。three.js が要求するので場所だけ取っておく
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
    // 位置を GPU で作るので、境界は大きめに取って視錐台カリングで消えないようにする
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10)
    return geo
  }, [count])
}

/**
 * 光の粒の見た目（Motes と Glow の星で共通）。
 * 芯が白く、ふちが金色のにじみ。`vStar` が立っている粒だけ十字の光芒を足す
 */
const SPARK_FRAGMENT = /* glsl */ `
  uniform vec3 uGold;
  uniform vec3 uCore;
  varying float vAlpha;
  varying float vStar;
  ${GLOW_COLOR}
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = length(p);
    // 2段重ね。小さく強い芯と、広く淡いにじみ（ブルームの代わり）
    float core = exp(-r * r * 16.0);
    float bloom = exp(-r * r * 2.6) * 0.8;
    // 十字の光芒。縦横に細く伸びて、先ほど細くなる
    float ray = max(0.0, 1.0 - abs(p.x) * 9.0) * max(0.0, 1.0 - abs(p.y))
              + max(0.0, 1.0 - abs(p.y) * 9.0) * max(0.0, 1.0 - abs(p.x));
    float intensity = clamp(core + bloom + ray * vStar * 0.9, 0.0, 1.0);
    float a = intensity * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(glowColor(uGold, uCore, intensity), a);
    #include <colorspace_fragment>
  }
`

/* ------------------------------------------------------------------
 * 光の粒
 * ------------------------------------------------------------------ */

const MOTES_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uHeight;
  uniform float uRadius;
  uniform float uSize;
  uniform float uScale;
  attribute vec4 aSeed;
  varying float vAlpha;
  varying float vStar;
  void main() {
    // 一生（0→1）。下から上へのぼりきったら、また足元から
    float life = fract(aSeed.z + uTime * 0.16 * (0.75 + 0.5 * aSeed.w));
    // **全員同じ向きに回る。** ばらばらに動かすと虫に見える
    float angle = aSeed.x * 6.2832 + uTime * 0.35 + life * 1.4;
    // のぼるほど少し内側へ寄せる。炎のように上がすぼまる
    float radius = uRadius * (0.6 + 0.4 * aSeed.y) * (1.0 - 0.35 * life);
    vec3 pos = vec3(cos(angle) * radius, life * uHeight, sin(angle) * radius);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    float size = uSize * (0.55 + 0.9 * aSeed.w);
    gl_PointSize = size * uScale / -mv.z;

    // 生まれるときと消えるときはフェード。ゆっくりまたたかせる
    vAlpha = smoothstep(0.0, 0.18, life) * (1.0 - smoothstep(0.55, 1.0, life));
    vAlpha *= 0.7 + 0.3 * sin(uTime * 3.0 + aSeed.x * 40.0);
    // 大きい粒だけ光芒を付ける。全部に付けるとうるさい
    vStar = step(0.72, aSeed.w);
  }
`

/** 足元から立ちのぼって消える光の粒 */
export function Motes({ height, animate, count = 10 }: Common & { count?: number }) {
  const geo = useSeeds(count)
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uHeight: { value: height * 1.35 },
      uRadius: { value: height * 0.62 },
      uSize: { value: 0.16 },
      uScale: { value: 1 },
      uGold: { value: GOLD },
      uCore: { value: CORE },
    }),
    // 高さが変わっても作り直さない（→ 下で入れ直す）
    []
  )
  uniforms.uHeight.value = height * 1.35
  uniforms.uRadius.value = height * 0.62
  useClock(uniforms, animate)
  usePointScale(uniforms)
  const material = useShader(uniforms, MOTES_VERTEX, SPARK_FRAGMENT)

  return (
    <points geometry={geo} frustumCulled={false}>
      <primitive object={material} attach="material" />
    </points>
  )
}

/* ------------------------------------------------------------------
 * 輝き
 * ------------------------------------------------------------------ */

const HALO_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/** 後光。やわらかい光の球に、ゆっくり回る光の筋を2枚重ねる */
const HALO_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uGold;
  uniform vec3 uCore;
  varying vec2 vUv;
  ${GLOW_COLOR}
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    // 中心ほど明るい光の球
    float glow = pow(max(0.0, 1.0 - r), 2.4);
    // 光の筋。本数と回る向きを変えた2枚を重ねて、規則的すぎないようにする
    float fade = smoothstep(1.0, 0.3, r) * smoothstep(0.08, 0.35, r);
    float rays = pow(0.5 + 0.5 * sin(a * 9.0 + uTime * 0.25), 5.0)
               + 0.7 * pow(0.5 + 0.5 * sin(a * 14.0 - uTime * 0.18), 8.0);
    // ゆっくり息をするように明るさを揺らす
    float pulse = 0.85 + 0.15 * sin(uTime * 1.6);
    float alpha = (glow * 0.7 + rays * fade * 0.2) * pulse;
    if (alpha < 0.004) discard;
    // ひよこのすぐ後ろは白く飛ばし、外へ行くほど金色のにじみに。逆光で
    // 輪郭が光っているように見える
    gl_FragColor = vec4(glowColor(uGold, uCore, glow * 1.3), min(alpha, 0.92));
    #include <colorspace_fragment>
  }
`

const TWINKLE_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uHeight;
  uniform float uSize;
  uniform float uScale;
  attribute vec4 aSeed;
  varying float vAlpha;
  varying float vStar;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    // 1つの星は「ぱっと光って消える」を繰り返し、**光るたびに場所を変える**
    float t = uTime * 0.55 + aSeed.z;
    float cycle = floor(t);
    float life = fract(t);
    float angle = hash(cycle * 12.9 + aSeed.x * 78.2) * 6.2832;
    float y = mix(0.25, 1.05, hash(cycle * 4.1 + aSeed.y * 31.7)) * uHeight;
    // ひよこの輪郭のすぐ外側。頭の上へ行くほど内へ寄せる
    float radius = uHeight * mix(0.55, 0.38, y / uHeight);
    vec3 pos = vec3(cos(angle) * radius, y, sin(angle) * radius * 0.4 + uHeight * 0.3);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    // 大きさで光らせる。ふくらんでしぼむ
    float pop = pow(sin(life * 3.1416), 2.0);
    gl_PointSize = uSize * (0.7 + 0.6 * aSeed.w) * pop * uScale / -mv.z;
    vAlpha = pop;
    vStar = 1.0;
  }
`

/** 輝き。後光と、まわりでぱっと光る星 ✦ */
export function Glow({ height, animate }: Common) {
  const halo = useMemo(
    () => ({ uTime: { value: 0 }, uGold: { value: GOLD }, uCore: { value: CORE } }),
    []
  )
  useClock(halo, animate)
  const haloMaterial = useShader(halo, HALO_VERTEX, HALO_FRAGMENT)

  const geo = useSeeds(3)
  const twinkle = useMemo(
    () => ({
      uTime: { value: 0 },
      uHeight: { value: height },
      uSize: { value: 0.24 },
      uScale: { value: 1 },
      uGold: { value: GOLD },
      uCore: { value: CORE },
    }),
    []
  )
  twinkle.uHeight.value = height
  useClock(twinkle, animate)
  usePointScale(twinkle)
  const twinkleMaterial = useShader(twinkle, TWINKLE_VERTEX, SPARK_FRAGMENT)

  const size = height * 2.2
  return (
    <>
      {/* **ひよこの少し後ろに立てる。** 奥行きの判定でひよこの手前側に
          隠れるので、光は輪郭のまわりにだけ見える */}
      <Billboard position={[0, height * 0.5, 0]}>
        <mesh position={[0, 0, -0.35]} renderOrder={-1}>
          <planeGeometry args={[size, size]} />
          <primitive object={haloMaterial} attach="material" />
        </mesh>
      </Billboard>
      <points geometry={geo} frustumCulled={false}>
        <primitive object={twinkleMaterial} attach="material" />
      </points>
    </>
  )
}

/* ------------------------------------------------------------------
 * どんより
 * ------------------------------------------------------------------ */

/**
 * 背中に垂れる縦線（漫画の「ずーん」）。上から下へ伸びて、下ほど薄くなる。
 * 線の長さは1本ずつ変え、ゆっくり伸び縮みさせる
 */
const LINES_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vUv;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    float columns = 11.0;
    float x = vUv.x * columns;
    float id = floor(x);
    float line = smoothstep(0.09, 0.02, abs(fract(x) - 0.5));
    // 線の長さ。上端（vUv.y = 1）から、この長さぶん下へ伸びる
    float len = 0.45 + 0.4 * hash(id * 7.3) + 0.08 * sin(uTime * 0.8 + id * 1.7);
    float fromTop = 1.0 - vUv.y;
    float body = smoothstep(len, len - 0.3, fromTop);
    // 左右の端は薄く。四角い板の形が見えないように
    float edge = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
    // うすい影のもや。線だけだと軽く見える
    float haze = smoothstep(0.9, 0.0, fromTop) * 0.18;
    float alpha = (line * 0.4 + haze) * body * edge;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(uColor, alpha);
    #include <colorspace_fragment>
  }
`

/** 雨粒の数 */
const DROPS = 5

/** どんより。頭の上の雨雲と雨粒、背中に垂れる縦線 */
export function Gloom({ height, animate }: Common) {
  const lines = useMemo(
    () => ({ uTime: { value: 0 }, uColor: { value: new THREE.Color('hsl(235, 22%, 30%)') } }),
    []
  )
  useClock(lines, animate)
  const linesMaterial = useShader(lines, HALO_VERTEX, LINES_FRAGMENT)

  const cloud = useRef<THREE.Group>(null)
  const drops = useRef<(THREE.Mesh | null)[]>([])
  const time = useRef(0)
  // 雨粒の横位置と、落ち始めのずれ
  const dropSeeds = useMemo(
    () => Array.from({ length: DROPS }, (_, i) => ({ x: (i / (DROPS - 1) - 0.5) * 0.5, phase: Math.random() })),
    []
  )

  // 頭のすぐ上。高く置くと小さな枠では上で切れる
  const top = height + 0.2
  // 真上だととさかに隠れるので、少し横へずらす
  const side = height * 0.2
  const fall = 0.3

  useFrame((_, delta) => {
    time.current = animate ? time.current + delta : STILL
    const t = time.current
    // 雲はゆっくり上下するだけ。速く動くと元気に見える
    if (cloud.current) cloud.current.position.y = top + Math.sin(t * 1.1) * 0.03
    drops.current.forEach((drop, i) => {
      if (!drop) return
      const life = (t * 0.9 + dropSeeds[i].phase) % 1
      drop.position.y = top - 0.1 - life * fall
      const mat = drop.material as THREE.MeshBasicMaterial
      // 落ちきる前に消す。頭に刺さって見えないように
      mat.opacity = 0.8 * Math.min(1, life * 6) * (1 - Math.max(0, life - 0.6) / 0.4)
    })
  })

  return (
    <>
      <Billboard position={[0, height * 0.72, 0]}>
        <mesh position={[0, 0, -0.4]} renderOrder={-1}>
          <planeGeometry args={[height * 1.9, height * 1.35]} />
          <primitive object={linesMaterial} attach="material" />
        </mesh>
      </Billboard>

      {/* 雨雲。つぶした球を並べて、もこもこの形にする */}
      <group ref={cloud} position={[side, top, 0]}>
        {CLOUD.map(([x, y, r], i) => (
          <mesh key={i} position={[x, y, 0]} scale={[1, 0.78, 0.8]}>
            <sphereGeometry args={[r, 18, 14]} />
            <meshStandardMaterial color="#8C93A6" roughness={0.95} />
          </mesh>
        ))}
      </group>
      {dropSeeds.map((seed, i) => (
        <mesh
          key={i}
          ref={(m) => { drops.current[i] = m }}
          position={[side + seed.x, top, 0.05]}
          scale={[0.7, 2, 0.7]}
        >
          <sphereGeometry args={[0.028, 10, 8]} />
          <meshBasicMaterial color="#4F86C0" transparent depthWrite={false} />
        </mesh>
      ))}
    </>
  )
}

/** 雨雲の球。[x, y, 半径] */
const CLOUD: [number, number, number][] = [
  [-0.24, -0.02, 0.15],
  [-0.08, 0.05, 0.2],
  [0.12, 0.04, 0.18],
  [0.28, -0.03, 0.13],
  [0.02, -0.06, 0.16],
]
