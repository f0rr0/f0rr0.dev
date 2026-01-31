'use client'

import dynamic from 'next/dynamic'

import { SmoothScrollbar } from '@14islands/r3f-scroll-rig'

import ErrorBoundary from '@/components/ErrorBoundary'

const Scene = dynamic(() => import('@/components/canvas/Scene'), { ssr: false })

export default function SceneWrapper(props: any) {
    return (
        <ErrorBoundary>
            <SmoothScrollbar />
            <Scene {...props} />
        </ErrorBoundary>
    )
}
