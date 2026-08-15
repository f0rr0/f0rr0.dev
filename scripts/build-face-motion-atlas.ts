import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import {
  FACE_MOTION_ATLAS_FRAME_ORDER,
  FACE_MOTION_CONFIG,
  faceMotionAtlasPosition,
  faceMotionFrameSource,
} from "../src/lib/face-motion";

const ASSET_DIRECTORY = path.resolve("public/resume/face-motion/v13");
const ATLAS_FILENAME = "face-motion-atlas.webp";
const MANIFEST_FILENAME = "face-motion-atlas.json";
const POSTER_FILENAME = "face-motion-poster.webp";
const WEBP_OPTIONS = {
  alphaQuality: 100,
  effort: 6,
  quality: 82,
  smartSubsample: true,
} as const;

const atlasWidth =
  FACE_MOTION_CONFIG.atlasColumns * FACE_MOTION_CONFIG.atlasCellSizePx;
const atlasHeight =
  FACE_MOTION_CONFIG.atlasRows * FACE_MOTION_CONFIG.atlasCellSizePx;

if (
  FACE_MOTION_ATLAS_FRAME_ORDER.length >
  FACE_MOTION_CONFIG.atlasColumns * FACE_MOTION_CONFIG.atlasRows
) {
  throw new Error("Face-motion frames exceed atlas capacity");
}

function sha256(data: Buffer) {
  return createHash("sha256").update(data).digest("hex");
}

function localFileForSource(source: string) {
  const { pathname } = new URL(source, "https://face-motion.invalid");
  return path.join(ASSET_DIRECTORY, path.basename(pathname));
}

async function resizedRgba(file: string) {
  const result = await sharp(file)
    .resize(
      FACE_MOTION_CONFIG.atlasCellSizePx,
      FACE_MOTION_CONFIG.atlasCellSizePx,
      {
        fit: "fill",
        kernel: sharp.kernel.lanczos3,
      }
    )
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let index = 0; index < result.data.length; index += 4) {
    if (result.data[index + 3] === 0) {
      result.data[index] = 0;
      result.data[index + 1] = 0;
      result.data[index + 2] = 0;
    }
  }

  return result;
}

const frames = await Promise.all(
  FACE_MOTION_ATLAS_FRAME_ORDER.map(async (frame) => {
    const source = faceMotionFrameSource(frame);
    if (source === null) {
      throw new Error(`No source for atlas frame: ${frame}`);
    }

    const file = localFileForSource(source);
    const encoded = await readFile(file);
    const resized = await resizedRgba(file);
    const position = faceMotionAtlasPosition(frame);
    const input = await sharp(resized.data, {
      raw: resized.info,
    })
      .png()
      .toBuffer();

    return {
      ...position,
      file: path.basename(file),
      frame,
      input,
      sourceSha256: sha256(encoded),
    };
  })
);

const atlas = await sharp({
  create: {
    background: { alpha: 0, b: 0, g: 0, r: 0 },
    channels: 4,
    height: atlasHeight,
    width: atlasWidth,
  },
})
  .composite(
    frames.map((frame) => ({
      input: frame.input,
      left: frame.column * FACE_MOTION_CONFIG.atlasCellSizePx,
      top: frame.row * FACE_MOTION_CONFIG.atlasCellSizePx,
    }))
  )
  .webp(WEBP_OPTIONS)
  .toBuffer();

const [center] = frames;
if (center?.frame !== FACE_MOTION_CONFIG.centerPose) {
  throw new Error("Center must be the first atlas frame");
}

const poster = await sharp(center.input).webp(WEBP_OPTIONS).toBuffer();
const atlasPath = path.join(ASSET_DIRECTORY, ATLAS_FILENAME);
const posterPath = path.join(ASSET_DIRECTORY, POSTER_FILENAME);

await Promise.all([writeFile(atlasPath, atlas), writeFile(posterPath, poster)]);

const manifest = {
  schemaVersion: 1,
  atlas: {
    bytes: atlas.byteLength,
    cellHeight: FACE_MOTION_CONFIG.atlasCellSizePx,
    cellWidth: FACE_MOTION_CONFIG.atlasCellSizePx,
    columns: FACE_MOTION_CONFIG.atlasColumns,
    file: ATLAS_FILENAME,
    height: atlasHeight,
    rows: FACE_MOTION_CONFIG.atlasRows,
    sha256: sha256(atlas),
    width: atlasWidth,
  },
  encoding: {
    format: "lossy WebP with alpha",
    ...WEBP_OPTIONS,
  },
  frames: frames.map(({ input: _input, ...frame }) => frame),
  poster: {
    bytes: poster.byteLength,
    file: POSTER_FILENAME,
    height: FACE_MOTION_CONFIG.atlasCellSizePx,
    sha256: sha256(poster),
    width: FACE_MOTION_CONFIG.atlasCellSizePx,
  },
  revision: FACE_MOTION_CONFIG.assetRevision,
} as const;

await writeFile(
  path.join(ASSET_DIRECTORY, MANIFEST_FILENAME),
  `${JSON.stringify(manifest, null, 2)}\n`
);

console.log(
  JSON.stringify(
    {
      atlas: {
        bytes: atlas.byteLength,
        file: atlasPath,
        height: atlasHeight,
        width: atlasWidth,
      },
      frames: frames.length,
      poster: {
        bytes: poster.byteLength,
        file: posterPath,
      },
    },
    null,
    2
  )
);
