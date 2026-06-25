import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { siteConfig } from "@/lib/site";

const initialsFromName = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export default function AuthorCard() {
  const { author } = siteConfig;
  const initials = initialsFromName(author.name);
  const image = author.image.trim() === "" ? undefined : author.image;

  return (
    <Card className="bg-gradient-to-br from-muted/60 via-background to-muted/40">
      <CardHeader className="flex flex-row items-center gap-4">
        <Avatar size="lg">
          {image === undefined ? null : (
            <AvatarImage src={image} alt={author.name} />
          )}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            About the author
          </p>
          <div>
            <h3 className="text-lg font-semibold">{author.name}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{author.role}</Badge>
              <span className="text-xs text-muted-foreground">
                Building thoughtful web experiences.
              </span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{author.bio}</p>
      </CardContent>
    </Card>
  );
}
