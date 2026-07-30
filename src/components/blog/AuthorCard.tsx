import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
    <Card>
      <CardHeader className="gap-4">
        <p className="site-kicker">About Sid</p>
        <div className="flex items-center gap-3">
          <Avatar size="lg">
            {image === undefined ? null : (
              <AvatarImage src={image} alt={author.name} />
            )}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-serif text-lg font-bold">{author.name}</h3>
            <p className="text-xs font-semibold text-primary">{author.role}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{author.bio}</p>
      </CardContent>
    </Card>
  );
}
