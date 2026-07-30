import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { BlogPost } from "@/lib/blog-utils";
import { formatDate } from "@/lib/date";
import { siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";

interface PostCardProps {
  post: BlogPost;
  variant?: "featured" | "list";
}

export default function PostCard({ post, variant = "list" }: PostCardProps) {
  const isFeatured = variant === "featured";

  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      <Card
        className={cn(
          "h-full transition-colors duration-200 group-hover:border-primary/40 group-hover:bg-accent/20",
          isFeatured && "border-primary/20"
        )}
      >
        <CardHeader>
          <CardTitle
            className={cn(
              "text-balance font-serif text-lg font-bold tracking-tight transition-colors group-hover:text-brand-hover",
              isFeatured && "text-2xl"
            )}
          >
            {post.metadata.title}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {post.metadata.summary}
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(post.metadata.tags ?? []).slice(0, 3).map((tag) => (
            <Badge key={tag} variant="tag">
              {tag}
            </Badge>
          ))}
        </CardContent>
        <CardFooter className="text-xs text-muted-foreground">
          <time dateTime={post.date.toISOString()}>
            {formatDate(post.date, siteConfig.language)}
          </time>
          <span className="mx-2">·</span>
          <span>{post.readingTime}</span>
        </CardFooter>
      </Card>
    </Link>
  );
}
