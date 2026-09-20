import type { ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { Bounds, Center, Clone, useGLTF } from '@react-three/drei'
import { onboardingAvatarModel } from './onboarding-avatar'

function Model({ src }: { src: string }) {
  const { scene } = useGLTF(src)
  const rotation = onboardingAvatarModel.rotationDegrees.map(
    (degrees) => degrees * Math.PI / 180,
  ) as [number, number, number]

  return (
    <Bounds fit clip observe margin={onboardingAvatarModel.margin} maxDuration={0}>
      <Center>
        {/* 同じモデルを複数の枠で安全に表示するため、シーンを複製する。 */}
        <Clone object={scene} rotation={rotation} />
      </Center>
    </Bounds>
  )
}

/** 現時点ではモデルの静止表示。Blender のアニメーションは再生しない。 */
export default function OnboardingAvatarModel({ src, fallback }: { src: string; fallback: ReactNode }) {
  return (
    <Canvas
      fallback={fallback}
      dpr={[1, 2]}
      frameloop="demand"
      camera={{ position: [0, 0, 5], fov: 35 }}
      gl={{ alpha: true, antialias: true }}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={1.2} />
      <directionalLight position={[3, 4, 5]} intensity={2} />
      <directionalLight position={[-3, 1, -2]} intensity={0.8} />
      <Model src={src} />
    </Canvas>
  )
}
