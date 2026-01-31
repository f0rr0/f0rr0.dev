'use client'

import dynamic from 'next/dynamic'
import { UseCanvas } from '@14islands/r3f-scroll-rig'

const ScrollScene = dynamic(
    () => import('@14islands/r3f-scroll-rig').then((mod) => mod.ScrollScene),
    { ssr: false }
)

export default function ScrollSceneWrapper(props: any) {
    return (
        <UseCanvas>
            <ScrollScene {...props} />
        </UseCanvas>
    )
}
