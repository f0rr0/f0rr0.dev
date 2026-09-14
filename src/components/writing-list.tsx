import Image from "next/image";
import type { StaticImageData } from "next/image";
import Link from "next/link";

import { LocalDateTime } from "@/components/local-date-time";
import {
  HoverCardGroup,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  findMetadataImageAsset,
  importMetadataImageModule,
} from "@/lib/blog-utils";
import type { BlogPost } from "@/lib/blog-utils";

export async function WritingList({ posts }: Readonly<{ posts: BlogPost[] }>) {
  const entries = await Promise.all(
    posts.map(async (post) => {
      const asset = await findMetadataImageAsset(post.importPath, "opengraph");
      let preview: StaticImageData | string | null = null;
      if (asset?.type === "file") {
        const image = await importMetadataImageModule<{
          default: StaticImageData;
        }>(asset.importPath);
        preview = image.default;
      } else if (asset !== null) {
        preview = `/writing/${post.slug}/share-image`;
      }
      return { ...post, preview };
    })
  );
  return entries.length === 0 ? (
    <p className="text-muted-foreground">No published writing yet.</p>
  ) : (
    <HoverCardGroup>
      <ol className="site-list divide-y divide-border">
        {entries.map((post) => (
          <li key={post.slug}>
            <HoverCardTrigger
              payload={
                <HoverCardContent>
                  {post.preview === null ? null : (
                    <Image
                      alt=""
                      className="aspect-[1200/630] w-full border-b object-cover"
                      height={168}
                      placeholder={
                        typeof post.preview !== "string" &&
                        post.preview.blurDataURL !== undefined &&
                        post.preview.blurDataURL !== ""
                          ? "blur"
                          : "empty"
                      }
                      sizes="320px"
                      src={post.preview}
                      unoptimized={typeof post.preview === "string"}
                      width={320}
                    />
                  )}
                  <div className="space-y-2 p-4">
                    <p className="font-medium">{post.metadata.title}</p>
                    <p className="text-muted-foreground">
                      {post.metadata.summary}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <LocalDateTime dateTime={post.date.toISOString()} /> ·{" "}
                      {post.readingTime}
                      {post.metadata.draft === true ? " · Draft preview" : ""}
                    </p>
                  </div>
                </HoverCardContent>
              }
              className="site-row grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 rounded-sm py-2.5 text-start text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring group"
              render={<Link href={`/writing/${post.slug}`} prefetch={false} />}
            >
              <span className="site-row-title min-w-0 truncate font-light [.site-row[aria-expanded]_&]:[interpolate-size:allow-keywords] [.site-row[aria-expanded='false']_&]:[block-size:1lh] [.site-row[aria-expanded]_&]:[transition:block-size_240ms_var(--ease-settle)] [.site-row[aria-expanded='true']_&]:wrap-anywhere [.site-row[aria-expanded='true']_&]:whitespace-normal [.site-row[aria-expanded='true']_&]:[block-size:auto] motion-reduce:[.site-row[aria-expanded]_&]:transition-none group-hover:underline">
                {post.metadata.title}
              </span>
              <LocalDateTime
                className="site-row-meta min-h-6 shrink-0 items-center justify-end gap-2 text-xs text-muted-foreground tabular-nums hidden sm:flex"
                dateTime={post.date.toISOString()}
              />
            </HoverCardTrigger>
          </li>
        ))}
      </ol>
    </HoverCardGroup>
  );
}
