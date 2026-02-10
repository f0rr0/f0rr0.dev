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
import { cn } from "@/lib/utils";

type PostCardProps = {
  post: BlogPost;
  variant?: "featured" | "list";
};

export default function PostCard({ post, variant = "list" }: PostCardProps) {
  const isFeatured = variant === "featured";

  return (
    <Link href={`/blog/${post.slug}`} className="group block">
      <Card
        className={cn(
          "transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-md",
          isFeatured &&
            "border-transparent bg-gradient-to-br from-muted/70 via-background to-muted/40",
        )}
      >
        <CardHeader>
          <CardTitle
            className={cn(
              "text-balance text-lg font-semibold tracking-tight",
              isFeatured && "text-2xl",
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
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </CardContent>
        <CardFooter className="text-xs text-muted-foreground">
          <time dateTime={post.date.toISOString()}>
            {formatDate(post.date)}
          </time>
          <span className="mx-2">·</span>
          <span>{post.readingTime}</span>
        </CardFooter>
      </Card>
    </Link>
  );
}
