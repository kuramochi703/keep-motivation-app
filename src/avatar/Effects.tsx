import { useEffect, useMemo } from 'react'
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
 * | `Glow` | 背中の後光（放射状の光の筋）。粒は出さない | かがやき |
 * | `Motes` | 足元から立ちのぼって消える光の粒 | いきいき・かがやき |
 * | `Gloom` | 背中に垂れ込める暗いもやと、ゆっくり沈む暗い粒 | ぐったり（しずみこみは停止中） |
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
 * 光の粒の見た目（Motes）。
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

/**
 * 輝き。後光だけ（からだの発光は Chick.tsx）。
 * **粒や星はここに入れない。** 粒は「光の粒」（Motes）の受け持ちで、
 * 輝きにも出すと2つのエフェクトの区別がつかなくなる
 */
export function Glow({ height, animate }: Common) {
  const halo = useMemo(
    () => ({ uTime: { value: 0 }, uGold: { value: GOLD }, uCore: { value: CORE } }),
    []
  )
  useClock(halo, animate)
  const haloMaterial = useShader(halo, HALO_VERTEX, HALO_FRAGMENT)

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
    </>
  )
}

/* ------------------------------------------------------------------
 * どんより
 *
 * **光の粒の裏返しとして作る。** 元気なときは光が立ちのぼるので、落ち込むと
 * 暗いものが垂れ込めて沈んでいく。雲や縦線のような「記号」は置かない。
 * 記号は貼り付けた絵に見えて安っぽい
 * ------------------------------------------------------------------ */

/** 値のノイズと、それを重ねた fbm。煙のゆらぎに使う */
/**
 * 煙のゆらぎに使うノイズ。
 *
 * **値ノイズ（格子点に乱数を置いて補間）は使わない。** 格子の形が残って、
 * 低い解像度の画像を引き伸ばしたようなぼやけたまだらになる。ここは格子点に
 * 「向き」を置く勾配ノイズで、6段重ねて細かい筋まで出す
 */
const NOISE = /* glsl */ `
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    // 5次のなめらかな補間。3次だと格子の境目で折れて見える
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float ga = hash2(i) * 6.2832;
    float gb = hash2(i + vec2(1.0, 0.0)) * 6.2832;
    float gc = hash2(i + vec2(0.0, 1.0)) * 6.2832;
    float gd = hash2(i + vec2(1.0, 1.0)) * 6.2832;
    float a = dot(vec2(cos(ga), sin(ga)), f);
    float b = dot(vec2(cos(gb), sin(gb)), f - vec2(1.0, 0.0));
    float c = dot(vec2(cos(gc), sin(gc)), f - vec2(0.0, 1.0));
    float d = dot(vec2(cos(gd), sin(gd)), f - vec2(1.0, 1.0));
    return 0.5 + 0.7 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    // 重ねるたびに少し回す。回さないとノイズの格子が揃って、四角いむらが透ける
    mat2 turn = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 6; i++) {
      v += a * noise(p);
      p = turn * p * 2.03 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }
  // 薄い暗色を白に重ねると、濃さが 1/255 刻みの段になって見える。
  // 画素ごとに 1段ぶんだけ揺らして、段の境目を散らす
  float dither() { return (hash2(gl_FragCoord.xy) - 0.5) / 255.0; }
`

/**
 * 暗いもや。ひよこの後ろで、ゆっくり渦を巻きながら下へ流れる煙。
 * **ノイズでゆがめた上でさらにノイズを引く**（domain warping）と、
 * 板のむらではなく煙のうねりに見える
 */
const HAZE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uDeep;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    // 楕円のふち。**四角い板の形が絶対に見えないよう**、端のずっと手前で消す
    float shape = smoothstep(1.0, 0.25, length(p * vec2(1.05, 0.9)));
    // 上のほうが濃い。頭の上に垂れ込める
    shape *= 0.55 + 0.45 * smoothstep(-0.6, 0.5, p.y);
    // uv を上へずらすと、模様は下へ流れて見える
    vec2 q = vUv * vec2(2.2, 2.6) + vec2(0.0, uTime * 0.07);
    vec2 warp = vec2(fbm(q + vec2(0.0, uTime * 0.03)), fbm(q + vec2(5.2, 1.3)));
    float n = fbm(q + warp * 1.4);
    // 幅を狭めて煙のふちを締める。広いとふちがどこまでもぼやける
    float smoke = smoothstep(0.42, 0.72, n);
    float alpha = shape * smoke * 0.55 + dither();
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(mix(uColor, uDeep, smoothstep(0.5, 0.9, n)), alpha);
    #include <colorspace_fragment>
  }
`

/**
 * 沈むもや。頭の上から、揺れながらゆっくり足元へ落ちて消える。
 * **小さな暗い点にはしない。** 暗い点は虫やごみに見える。大きく淡い
 * 煙のかたまりにして、もやの一部がちぎれて落ちていくように見せる
 */
const SINK_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uHeight;
  uniform float uRadius;
  uniform float uSize;
  uniform float uScale;
  attribute vec4 aSeed;
  varying float vAlpha;
  varying float vSeed;
  void main() {
    vSeed = aSeed.x;
    // 光の粒より**ずっと遅い。** 速いと雨や雪に見える
    float life = fract(aSeed.z + uTime * 0.07 * (0.8 + 0.4 * aSeed.w));
    float angle = aSeed.x * 6.2832;
    float radius = uRadius * (0.5 + 0.5 * aSeed.y);
    // 左右にふらふら揺れながら落ちる
    float sway = sin(uTime * 0.9 + aSeed.x * 20.0) * 0.08;
    vec3 pos = vec3(cos(angle) * radius + sway, (1.0 - life) * uHeight * 1.2, sin(angle) * radius);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (0.6 + 0.8 * aSeed.w) * uScale / -mv.z;
    vAlpha = smoothstep(0.0, 0.2, life) * (1.0 - smoothstep(0.65, 1.0, life));
  }
`

/** 沈むもやの見た目。**芯を白くしない、光芒も付けない。** ふちまでぼかした煙 */
const SINK_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  varying float vAlpha;
  varying float vSeed;
  ${NOISE}
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    // 丸いぼかしだけだと、引き伸ばした画像のように見える。
    // もやと同じノイズで中に筋を入れ、ふちもちぎれさせる
    float n = fbm(gl_PointCoord * 2.4 + vSeed * 17.0 + vec2(0.0, uTime * 0.05));
    float puff = exp(-dot(p, p) * 2.2) * smoothstep(0.38, 0.7, n);
    float a = puff * vAlpha * 0.4 + dither();
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`

/** どんより。背中に垂れ込める暗いもやと、ちぎれてゆっくり沈んでいくもや */
export function Gloom({ height, animate }: Common) {
  const haze = useMemo(
    () => ({
      uTime: { value: 0 },
      // 真っ黒にはしない。青みのある鈍い灰色で、沈んだ空気に見せる
      uColor: { value: new THREE.Color('hsl(232, 18%, 46%)') },
      uDeep: { value: new THREE.Color('hsl(238, 24%, 24%)') },
    }),
    []
  )
  useClock(haze, animate)
  const hazeMaterial = useShader(haze, HALO_VERTEX, HAZE_FRAGMENT)

  const geo = useSeeds(6)
  const sink = useMemo(
    () => ({
      uTime: { value: 0 },
      uHeight: { value: height },
      uRadius: { value: height * 0.6 },
      uSize: { value: 0.55 },
      uScale: { value: 1 },
      uColor: { value: new THREE.Color('hsl(236, 18%, 38%)') },
    }),
    []
  )
  sink.uHeight.value = height
  sink.uRadius.value = height * 0.6
  useClock(sink, animate)
  usePointScale(sink)
  const sinkMaterial = useShader(sink, SINK_VERTEX, SINK_FRAGMENT)

  const size = height * 2.1
  return (
    <>
      {/* 後光と同じく、ひよこの少し後ろに立てる。輪郭のまわりにだけ見える */}
      <Billboard position={[0, height * 0.6, 0]}>
        <mesh position={[0, 0, -0.4]} renderOrder={-1}>
          <planeGeometry args={[size, size]} />
          <primitive object={hazeMaterial} attach="material" />
        </mesh>
      </Billboard>
      <points geometry={geo} frustumCulled={false}>
        <primitive object={sinkMaterial} attach="material" />
      </points>
    </>
  )
}
