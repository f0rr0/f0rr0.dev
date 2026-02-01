import Image from "next/image";
import type { ImgHTMLAttributes } from "react";

const isRemoteSrc = (src: string) => /^https?:\/\//i.test(src);

type MDXImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  width?: number | string;
  height?: number | string;
  assetBasePath?: string;
};

const parseDimension = (value?: number | string) => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
};

const resolveAssetSrc = (src: string, basePath?: string) => {
  if (
    !basePath ||
    src.startsWith("/") ||
    isRemoteSrc(src) ||
    src.startsWith("data:") ||
    src.startsWith("blob:")
  ) {
    return src;
  }
  const trimmedBase = basePath.replace(/\/$/, "");
  const trimmedSrc = src.replace(/^\.\/+/, "");
  return `${trimmedBase}/${trimmedSrc}`.replace(/\/{2,}/g, "/");
};

const isSvg = (src: string) =>
  src.split("?")[0]?.split("#")[0]?.toLowerCase().endsWith(".svg");

export default function MDXImage({
  src,
  alt,
  width,
  height,
  className,
  assetBasePath,
  ...rest
}: MDXImageProps) {
  if (typeof src !== "string" || src.length === 0) return null;

  const resolvedSrc = resolveAssetSrc(src, assetBasePath);
  const parsedWidth = parseDimension(width);
  const parsedHeight = parseDimension(height);
  const shouldUseNextImage =
    parsedWidth !== undefined &&
    parsedHeight !== undefined &&
    !isRemoteSrc(resolvedSrc) &&
    !isSvg(resolvedSrc);

  if (!shouldUseNextImage) {
    return (
      // biome-ignore lint/performance/noImgElement: fall back for remote/unknown dimensions.
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
      src={resolvedSrc}
      alt={alt ?? ""}
      width={parsedWidth}
      height={parsedHeight}
      sizes="(min-width: 1024px) 768px, 100vw"
      className={className}
    />
  );
}
