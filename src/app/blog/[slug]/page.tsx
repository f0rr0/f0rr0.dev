import type { ComponentType } from "react"
import { notFound } from "next/navigation"
import {
    getBlogPosts,
    importBlogPostModule,
    parseBlogPostMetadata,
    resolveImportPathForSlug,
} from "@/lib/blog-utils"

type PageParams = Promise<{ slug: string; importPath?: string }>

type BlogPostModule = {
    default: ComponentType
    metadata: unknown
}

export async function generateStaticParams() {
    const posts = await getBlogPosts()
    return posts.map(({ slug, importPath }) => ({ slug, importPath }))
}

export default async function BlogPostPage({ params }: { params: PageParams }) {
    const { slug, importPath } = await params

    const resolvedImportPath = importPath ?? (await resolveImportPathForSlug(slug))
    if (!resolvedImportPath) notFound()

    const module = (await importBlogPostModule<BlogPostModule>(resolvedImportPath).catch(
        () => null,
    )) as BlogPostModule | null

    if (!module?.default) notFound()

    const Content = module.default
    const metadata = parseBlogPostMetadata(module.metadata)

    return (
        <article className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
            <header className="flex flex-col gap-2">
                <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                    {metadata.title}
                </h1>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {metadata.date} · {metadata.author}
                </p>
            </header>
            <div className="prose prose-zinc dark:prose-invert">
                <Content />
            </div>
        </article>
    )
}
