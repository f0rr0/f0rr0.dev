import Image from "next/image";
import type { StaticImageData } from "next/image";
import type { ImgHTMLAttributes } from "react";

const isRemoteSrc = (src: string) => /^https?:\/\//i.test(src);

type MDXImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "width" | "height"
> & {
  src?: string | StaticImageData;
  width?: number | string;
  height?: number | string;
};

const parseDimension = (value?: number | string) => {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const isClientResolvableStringSrc = (src: string) =>
  src.startsWith("/") ||
  isRemoteSrc(src) ||
  src.startsWith("data:") ||
  src.startsWith("blob:");

const isStaticImageData = (value: unknown): value is StaticImageData =>
  typeof value === "object" &&
  value !== null &&
  "src" in value &&
  typeof (value as { src?: unknown }).src === "string";

const isSvg = (src: string) =>
  src.split("?")[0]?.split("#")[0]?.toLowerCase().endsWith(".svg");

export default function MDXImage({
  src,
  alt,
  width,
  height,
  className,
  ...rest
}: MDXImageProps) {
  if (src === undefined || src === "") {
    return null;
  }

  if (typeof src === "string" && !isClientResolvableStringSrc(src)) {
    throw new Error(
      `MDXImage received a relative src ("${src}"). Import the image or use a Markdown image so it can be statically imported.`
    );
  }

  const staticImage = isStaticImageData(src) ? src : null;
  const resolvedSrc = typeof src === "string" ? src : src.src;

  const parsedWidth = parseDimension(width) ?? staticImage?.width;
  const parsedHeight = parseDimension(height) ?? staticImage?.height;
  const canUseNextImage =
    parsedWidth !== undefined &&
    parsedHeight !== undefined &&
    !isRemoteSrc(resolvedSrc) &&
    !isSvg(resolvedSrc);

  if (!canUseNextImage) {
    return (
      <img
        src={resolvedSrc}
        alt={alt ?? ""}
        loading="lazy"
        decoding="async"
        className={className}
        {...rest}
      />
    );
  }

  return (
    <Image
      src={staticImage ?? resolvedSrc}
      alt={alt ?? ""}
      width={parsedWidth}
      height={parsedHeight}
      sizes="(min-width: 1024px) 768px, 100vw"
      className={className}
    />
  );
}
