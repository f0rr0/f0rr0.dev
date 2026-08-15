import { mkdir } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { FACE_MOTION_CONFIG } from "../src/lib/face-motion";

const [input, output] = process.argv.slice(2);

if (!(input && output)) {
  throw new Error(
    "Usage: bun scripts/build-face-motion-transition.ts <input.png> <output.webp>"
  );
}

await mkdir(path.dirname(output), { recursive: true });

const { data, info } = await sharp(input)
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const alpha = Buffer.alloc(info.width * info.height);
const visited = new Uint8Array(info.width * info.height);
const queue = new Int32Array(info.width * info.height);
let head = 0;
let tail = 0;

const scoreAt = (index: number) => {
  const offset = index * info.channels;
  return (
    Math.min(data[offset] ?? 0, data[offset + 2] ?? 0) - (data[offset + 1] ?? 0)
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

for (let x = 0; x < info.width; x += 1) {
  enqueue(x);
  enqueue((info.height - 1) * info.width + x);
}
for (let y = 0; y < info.height; y += 1) {
  enqueue(y * info.width);
  enqueue(y * info.width + info.width - 1);
}

while (head < tail) {
  const index = queue[head] ?? 0;
  head += 1;
  const x = index % info.width;
  const y = Math.floor(index / info.width);
  if (x > 0) {
    enqueue(index - 1);
  }
  if (x + 1 < info.width) {
    enqueue(index + 1);
  }
  if (y > 0) {
    enqueue(index - info.width);
  }
  if (y + 1 < info.height) {
    enqueue(index + info.width);
  }
}

for (let index = 0; index < alpha.length; index += 1) {
  if (visited[index] === 0) {
    alpha[index] = 255;
    continue;
  }

  const distance = Math.max(0, Math.min(1, scoreAt(index) / 24));
  alpha[index] = Math.round(
    255 * (1 - distance * distance * (3 - 2 * distance))
  );
}

// Remove tiny disconnected key-colour islands that GPT sometimes authors
// inside flyaway hair. Real hair remains dark; only strongly magenta clusters
// in the upper portrait region qualify, and only if the connected cluster is
// small. Large magenta regions are already handled by border connectivity.
const speckVisited = new Uint8Array(alpha.length);
const speckQueue = new Int32Array(alpha.length);
const cluster = new Int32Array(alpha.length);
const isMagentaSpeckCandidate = (index: number) => {
  const y = Math.floor(index / info.width);
  if (y >= info.height * 0.32 || visited[index] === 1) {
    return false;
  }
  const offset = index * info.channels;
  const red = data[offset] ?? 0;
  const green = data[offset + 1] ?? 0;
  const blue = data[offset + 2] ?? 0;
  return red > 110 && blue > 90 && red - green > 30 && blue - green > 25;
};

for (let seed = 0; seed < alpha.length; seed += 1) {
  if (speckVisited[seed] === 1 || !isMagentaSpeckCandidate(seed)) {
    continue;
  }

  head = 0;
  tail = 0;
  let clusterLength = 0;
  speckVisited[seed] = 1;
  speckQueue[tail] = seed;
  tail += 1;

  while (head < tail) {
    const index = speckQueue[head] ?? 0;
    head += 1;
    cluster[clusterLength] = index;
    clusterLength += 1;
    const x = index % info.width;
    const y = Math.floor(index / info.width);
    const neighbors = [
      x > 0 ? index - 1 : -1,
      x + 1 < info.width ? index + 1 : -1,
      y > 0 ? index - info.width : -1,
      y + 1 < info.height ? index + info.width : -1,
    ];
    for (const neighbor of neighbors) {
      if (
        neighbor >= 0 &&
        speckVisited[neighbor] === 0 &&
        isMagentaSpeckCandidate(neighbor)
      ) {
        speckVisited[neighbor] = 1;
        speckQueue[tail] = neighbor;
        tail += 1;
      }
    }
  }

  if (clusterLength <= 512) {
    for (let offset = 0; offset < clusterLength; offset += 1) {
      alpha[cluster[offset] ?? 0] = 0;
    }
  }
}

// The generator's magenta matte is useful for making the alpha mask, but its
// RGB must never survive inside antialiased edge pixels. Propagate the nearest
// fully opaque subject colour into those partial pixels before resizing. This
// keeps glasses, hair, ears, and garment edges crisp on the site's dark canvas
// without geometrically altering the generated portrait.
const nearestOpaque = new Int32Array(alpha.length);
nearestOpaque.fill(-1);
head = 0;
tail = 0;

const visitNearestNeighbor = (neighbor: number, sourceIndex: number) => {
  if (nearestOpaque[neighbor] !== -1) {
    return;
  }
  nearestOpaque[neighbor] = sourceIndex;
  queue[tail] = neighbor;
  tail += 1;
};

for (let index = 0; index < alpha.length; index += 1) {
  if (alpha[index] === 255) {
    nearestOpaque[index] = index;
    queue[tail] = index;
    tail += 1;
  }
}

while (head < tail) {
  const index = queue[head] ?? 0;
  head += 1;
  const x = index % info.width;
  const y = Math.floor(index / info.width);
  const sourceIndex = nearestOpaque[index] ?? -1;

  if (x > 0) {
    visitNearestNeighbor(index - 1, sourceIndex);
  }
  if (x + 1 < info.width) {
    visitNearestNeighbor(index + 1, sourceIndex);
  }
  if (y > 0) {
    visitNearestNeighbor(index - info.width, sourceIndex);
  }
  if (y + 1 < info.height) {
    visitNearestNeighbor(index + info.width, sourceIndex);
  }
}

const rgba = Buffer.alloc(info.width * info.height * 4);
for (let index = 0; index < alpha.length; index += 1) {
  const pixelAlpha = alpha[index] ?? 0;
  const colorIndex =
    pixelAlpha < 255 && (nearestOpaque[index] ?? -1) >= 0
      ? nearestOpaque[index]
      : index;
  const inputOffset = colorIndex * info.channels;
  const outputOffset = index * 4;
  rgba[outputOffset] = pixelAlpha === 0 ? 0 : (data[inputOffset] ?? 0);
  rgba[outputOffset + 1] = pixelAlpha === 0 ? 0 : (data[inputOffset + 1] ?? 0);
  rgba[outputOffset + 2] = pixelAlpha === 0 ? 0 : (data[inputOffset + 2] ?? 0);
  rgba[outputOffset + 3] = pixelAlpha;
}

await sharp(rgba, {
  raw: { channels: 4, height: info.height, width: info.width },
})
  .resize(
    FACE_MOTION_CONFIG.atlasCellSizePx,
    FACE_MOTION_CONFIG.atlasCellSizePx,
    { fit: "fill", kernel: sharp.kernel.lanczos3 }
  )
  .webp({
    alphaQuality: 100,
    effort: 6,
    quality: 82,
    smartSubsample: true,
  })
  .toFile(output);

console.log(
  `Built ${FACE_MOTION_CONFIG.atlasCellSizePx}px lossy-alpha transition asset: ${output}`
);
