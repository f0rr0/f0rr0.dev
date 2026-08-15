import { mkdir } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const [basePath, donorPath, outputPath] = process.argv.slice(2);

if (!(basePath && donorPath && outputPath)) {
  throw new Error(
    "Usage: bun scripts/compose-face-motion-hair.ts <base.png> <gpt-hair-donor.png> <output.png>"
  );
}

interface RawImage {
  data: Buffer;
  height: number;
  width: number;
}

const readRgb = async (
  inputPath: string,
  width?: number,
  height?: number
): Promise<RawImage> => {
  let pipeline = sharp(inputPath).removeAlpha();
  if (width !== undefined && height !== undefined) {
    pipeline = pipeline.resize(width, height, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    });
  }
  const { data, info } = await pipeline
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, height: info.height, width: info.width };
};

const chromaAlpha = ({ data, height, width }: RawImage) => {
  const pixelCount = width * height;
  const alpha = new Uint8Array(pixelCount);
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;

  const scoreAt = (index: number) => {
    const offset = index * 3;
    return (
      Math.min(data[offset] ?? 0, data[offset + 2] ?? 0) -
      (data[offset + 1] ?? 0)
    );
  };
  const enqueue = (index: number) => {
    if (visited[index] === 1 || scoreAt(index) < 10) {
      return;
    }
    visited[index] = 1;
    queue[tail] = index;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head] ?? 0;
    head += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) {
      enqueue(index - 1);
    }
    if (x + 1 < width) {
      enqueue(index + 1);
    }
    if (y > 0) {
      enqueue(index - width);
    }
    if (y + 1 < height) {
      enqueue(index + width);
    }
  }

  for (let index = 0; index < pixelCount; index += 1) {
    if (visited[index] === 0) {
      alpha[index] = 255;
      continue;
    }
    const distance = Math.max(0, Math.min(1, scoreAt(index) / 24));
    alpha[index] = Math.round(
      255 * (1 - distance * distance * (3 - 2 * distance))
    );
  }
  return alpha;
};

const base = await readRgb(basePath);
const donor = await readRgb(donorPath, base.width, base.height);
const baseAlpha = chromaAlpha(base);
const donorAlpha = chromaAlpha(donor);
const output = Buffer.from(base.data);

const darkHairBounds = (image: RawImage, alpha: Uint8Array, limit: number) => {
  let bottom = -1;
  let left = image.width;
  let right = -1;
  let top = image.height;

  for (let y = 0; y < limit; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const index = y * image.width + x;
      const offset = index * 3;
      const luminance =
        (image.data[offset] ?? 0) * 0.2126 +
        (image.data[offset + 1] ?? 0) * 0.7152 +
        (image.data[offset + 2] ?? 0) * 0.0722;
      if ((alpha[index] ?? 0) < 224 || luminance > 126) {
        continue;
      }
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }

  if (bottom < 0) {
    throw new Error(`Could not find a hair region in ${basePath}`);
  }
  return { bottom, left, right, top };
};

// Register only the GPT-authored hair donor to the immutable endpoint's hair
// coordinates. The original face/body pixels never move. This compensates for
// the rejected full-frame GPT edit's global pose/crop drift while retaining
// its authored strand detail and additional volume.
const registrationLimit = Math.round(base.height * 0.25);
const baseHairBounds = darkHairBounds(base, baseAlpha, registrationLimit);
const donorHairBounds = darkHairBounds(donor, donorAlpha, registrationLimit);
const targetCrownLift = 8;
const donorOffsetX = Math.round(
  (baseHairBounds.left + baseHairBounds.right) / 2 -
    (donorHairBounds.left + donorHairBounds.right) / 2
);
const donorOffsetY = baseHairBounds.top - donorHairBounds.top - targetCrownLift;

// Keep additions close to the endpoint's existing hair mass. GPT edits can
// contain low-contrast artifacts in an otherwise flat chroma background; a
// simple luminance test alone would import those artifacts. Seed a distance
// field exclusively from dark, opaque pixels above the eyewear, then allow a
// narrow expansion around that canonical silhouette.
const pixelCount = base.width * base.height;
const distance = new Int16Array(pixelCount);
distance.fill(-1);
const distanceQueue = new Int32Array(pixelCount);
let distanceHead = 0;
let distanceTail = 0;
const hairSeedLimit = Math.round(base.height * 0.25);

for (let y = 0; y < hairSeedLimit; y += 1) {
  for (let x = 0; x < base.width; x += 1) {
    const index = y * base.width + x;
    const offset = index * 3;
    const luminance =
      (base.data[offset] ?? 0) * 0.2126 +
      (base.data[offset + 1] ?? 0) * 0.7152 +
      (base.data[offset + 2] ?? 0) * 0.0722;
    if ((baseAlpha[index] ?? 0) >= 224 && luminance <= 126) {
      distance[index] = 0;
      distanceQueue[distanceTail] = index;
      distanceTail += 1;
    }
  }
}

const enqueueDistance = (index: number, value: number) => {
  if ((distance[index] ?? -1) !== -1) {
    return;
  }
  distance[index] = value;
  distanceQueue[distanceTail] = index;
  distanceTail += 1;
};

const maxHairExpansion = 24;
while (distanceHead < distanceTail) {
  const index = distanceQueue[distanceHead] ?? 0;
  distanceHead += 1;
  const currentDistance = distance[index] ?? 0;
  if (currentDistance >= maxHairExpansion) {
    continue;
  }
  const nextDistance = currentDistance + 1;
  const x = index % base.width;
  const y = Math.floor(index / base.width);
  if (x > 0) {
    enqueueDistance(index - 1, nextDistance);
  }
  if (x + 1 < base.width) {
    enqueueDistance(index + 1, nextDistance);
  }
  if (y > 0) {
    enqueueDistance(index - base.width, nextDistance);
  }
  if (y + 1 < base.height) {
    enqueueDistance(index + base.width, nextDistance);
  }
}

for (let y = 0; y < base.height; y += 1) {
  const fadeStart = base.height * 0.25;
  const fadeEnd = base.height * 0.295;
  const verticalWeight =
    y <= fadeStart
      ? 1
      : y >= fadeEnd
        ? 0
        : 1 - (y - fadeStart) / (fadeEnd - fadeStart);

  if (verticalWeight <= 0) {
    continue;
  }

  for (let x = 0; x < base.width; x += 1) {
    const index = y * base.width + x;
    const offset = index * 3;
    const donorX = x - donorOffsetX;
    const donorY = y - donorOffsetY;
    if (
      donorX < 0 ||
      donorX >= donor.width ||
      donorY < 0 ||
      donorY >= donor.height
    ) {
      continue;
    }
    const donorIndex = donorY * donor.width + donorX;
    const donorOffset = donorIndex * 3;
    const red = donor.data[donorOffset] ?? 0;
    const green = donor.data[donorOffset + 1] ?? 0;
    const blue = donor.data[donorOffset + 2] ?? 0;
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;

    // The generated donor may differ elsewhere. Import only dark hair pixels
    // outside the original opaque silhouette and only above the eyewear.
    if (luminance > 118) {
      continue;
    }

    const donorCoverage = (donorAlpha[donorIndex] ?? 0) / 255;
    const originalCoverage = (baseAlpha[index] ?? 0) / 255;
    const hairDistance = distance[index] ?? -1;
    if (hairDistance < 0 || hairDistance > maxHairExpansion) {
      continue;
    }
    if (
      x < baseHairBounds.left - 3 ||
      x > baseHairBounds.right + 3 ||
      y > baseHairBounds.top
    ) {
      continue;
    }
    const solidExpansion = maxHairExpansion - 6;
    const distanceWeight =
      hairDistance <= solidExpansion
        ? 1
        : (maxHairExpansion - hairDistance) /
          (maxHairExpansion - solidExpansion);
    const weight =
      donorCoverage * (1 - originalCoverage) * verticalWeight * distanceWeight;

    if (weight <= 0) {
      continue;
    }

    output[offset] = Math.round(
      (base.data[offset] ?? 0) * (1 - weight) + red * weight
    );
    output[offset + 1] = Math.round(
      (base.data[offset + 1] ?? 0) * (1 - weight) + green * weight
    );
    output[offset + 2] = Math.round(
      (base.data[offset + 2] ?? 0) * (1 - weight) + blue * weight
    );
  }
}

await mkdir(path.dirname(outputPath), { recursive: true });
await sharp(output, {
  raw: { channels: 3, height: base.height, width: base.width },
})
  .png({ compressionLevel: 9 })
  .toFile(outputPath);

console.log(`Composited GPT Image 2 hair expansion: ${outputPath}`);
