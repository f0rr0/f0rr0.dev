import fs from "node:fs/promises"
import path from "node:path"
import { cache } from "react"
import { z } from "zod"

const BLOG_DIR = path.join(process.cwd(), "src", "content", "blog")
const MDX_EXT = "mdx"
const FOLDER_ENTRY = `page.${MDX_EXT}`
const IMPORT_PREFIX = "@/content/blog/"

const metadataSchema = z.object({
    title: z.string(),
    date: z.string(),
    author: z.string(),
})

type BlogPostEntry = {
    slug: string
    importPath: string
}

export type BlogPostMetadata = z.infer<typeof metadataSchema>

export type BlogPost = BlogPostEntry & {
    metadata: BlogPostMetadata
}

const hasFile = async (relativePath: string) => {
    try {
        await fs.access(path.join(BLOG_DIR, relativePath))
        return true
    } catch {
        return false
    }
}

const slugFromFilename = (filename: string) => filename.replace(/\.mdx$/, "")

const importCandidates = (slug: string) => [`${slug}.${MDX_EXT}`, `${slug}/${FOLDER_ENTRY}`]

export const resolveImportPathForSlug = async (slug: string) => {
    for (const candidate of importCandidates(slug)) {
        if (await hasFile(candidate)) {
            return candidate
        }
    }

    return null
}

const collectEntries = async () => {
    const dirents = await fs.readdir(BLOG_DIR, { withFileTypes: true })
    const slugs = new Set<string>()

    for (const entry of dirents) {
        if (entry.isFile() && entry.name.endsWith(`.${MDX_EXT}`)) {
            slugs.add(slugFromFilename(entry.name))
        } else if (entry.isDirectory()) {
            slugs.add(entry.name)
        }
    }

    const entries: BlogPostEntry[] = []

    for (const slug of slugs) {
        const importPath = await resolveImportPathForSlug(slug)
        if (importPath) {
            entries.push({ slug, importPath })
        }
    }

    return entries
}

export const importBlogPostModule = async <Module = unknown>(importPath: string) =>
    import(`${IMPORT_PREFIX}${importPath}`) as Promise<Module>

export const parseBlogPostMetadata = (metadata: unknown) => metadataSchema.parse(metadata)

export const getBlogPosts = cache(async (): Promise<BlogPost[]> => {
    const entries = await collectEntries()

    return Promise.all(
        entries.map(async ({ slug, importPath }) => {
            const mod = await importBlogPostModule<{ metadata: unknown }>(importPath)
            return {
                slug,
                importPath,
                metadata: parseBlogPostMetadata(mod.metadata),
            }
        }),
    )
})
