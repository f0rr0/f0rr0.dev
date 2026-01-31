'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useScrollRig } from '@14islands/r3f-scroll-rig'
import { MeshDistortMaterial, Sphere } from '@react-three/drei'
import * as THREE from 'three'

export default function Hero3D({ scrollState }: { scrollState?: any }) {
    const mesh = useRef<THREE.Mesh>(null)
    const { requestRender } = useScrollRig()

    useFrame((state, delta) => {
        if (mesh.current) {
            // Basic rotation
            mesh.current.rotation.x += delta * 0.2
            mesh.current.rotation.y += delta * 0.3

            // If we had scrollState passed down or available via context, we could use it here
            // For now, just a continuous animation to prove 3D works
            requestRender()
        }
    })

    return (
        <Sphere args={[1, 32, 32]} ref={mesh} scale={1.5}>
            <MeshDistortMaterial
                color="#4a90e2"
                attach="material"
                distort={0.5}
                speed={2}
                roughness={0.2}
                metalness={0.8}
            />
        </Sphere>
    )
}
