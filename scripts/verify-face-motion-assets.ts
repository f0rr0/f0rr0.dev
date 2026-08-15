import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import {
  FACE_MOTION_ATLAS_FRAME_ORDER,
  FACE_MOTION_CANONICAL_EDGES,
  FACE_MOTION_CONFIG,
} from "../src/lib/face-motion";

interface QaConfig {
  approvedCenterRgbaSha256: string;
  atlasFilename: string;
  atlasManifestFilename: string;
  centerFilename: string;
  contactSheetCellSize: number;
  expectedAssetBasePath: string;
  expectedCanvasHeight: number;
  expectedCanvasWidth: number;
  expectedEndpointNames: string[];
  expectedManifestVersion: number;
  expectedModel: string;
  maxRuntimePayloadBytes: number;
  neutralPosterMustMatchCenter: boolean;
  posterFilename: string;
  requireLosslessEndpoints: boolean;
  runtimePosterFilename: string;
}

interface AtlasManifest {
  atlas: {
    bytes: number;
    cellHeight: number;
    cellWidth: number;
    columns: number;
    file: string;
    height: number;
    rows: number;
    sha256: string;
    width: number;
  };
  encoding: {
    format: string;
  };
  frames: {
    column: number;
    file: string;
    frame: string;
    index: number;
    row: number;
    sourceSha256: string;
  }[];
  poster: {
    bytes: number;
    file: string;
    height: number;
    sha256: string;
    width: number;
  };
  revision: string;
  schemaVersion: number;
}

interface ReleaseEndpoint {
  file: string;
  fileSha256: string;
  pose: string;
}

interface ReleaseManifest {
  assetBasePath: string;
  canvas: {
    height: number;
    width: number;
  };
  center: string;
  endpoints: ReleaseEndpoint[];
  model: string;
  poster: string;
  processing: {
    blend: boolean;
    bodyLock: boolean;
    crop: boolean;
    interpolate: boolean;
    opaqueRgbPreserved: boolean;
    opticalFlow: boolean;
    recenter: boolean;
    resize: boolean;
    rotate: boolean;
    warp: boolean;
  };
  schemaVersion: number;
  version: number;
}

interface AlphaBbox {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

interface DecodedAsset {
  alphaBbox: AlphaBbox | null;
  file: string;
  fileSha256: string;
  height: number;
  pose: string;
  rgba: Buffer;
  rgbaSha256: string;
  visiblePixels: number;
  webpEncoding: "lossless" | "lossy" | "unknown";
  width: number;
}

interface CheckResult {
  details?: unknown;
  id: string;
  message: string;
  passed: boolean;
}

const DEFAULT_ASSET_DIRECTORY = path.resolve("public/resume/face-motion/v13");
const DEFAULT_CONFIG_PATH = path.resolve("scripts/face-motion-qa.config.json");
const DEFAULT_OUTPUT_DIRECTORY = path.resolve("build/face-motion-qa");
const TRANSITION_FILENAME = /^transition-[a-z-]+-\d+\.webp$/;

function commandLineValue(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return fallback;
  }

  const value = process.argv[index + 1];
  if (!value) {
    throw new Error(`Missing value after ${name}`);
  }
  return path.resolve(value);
}

function sha256(data: Buffer) {
  return createHash("sha256").update(data).digest("hex");
}

function webpEncoding(file: Buffer): DecodedAsset["webpEncoding"] {
  if (
    file.toString("ascii", 0, 4) !== "RIFF" ||
    file.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return "unknown";
  }

  let offset = 12;
  while (offset + 8 <= file.length) {
    const chunkType = file.toString("ascii", offset, offset + 4);
    const chunkLength = file.readUInt32LE(offset + 4);
    if (chunkType === "VP8L") {
      return "lossless";
    }
    if (chunkType === "VP8 ") {
      return "lossy";
    }
    offset += 8 + chunkLength + (chunkLength % 2);
  }

  return "unknown";
}

function inspectAlpha(rgba: Buffer, width: number, height: number) {
  let bottom = -1;
  let left = width;
  let right = -1;
  let top = height;
  let visiblePixels = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = rgba[(y * width + x) * 4 + 3] ?? 0;
      if (alpha === 0) {
        continue;
      }
      visiblePixels += 1;
      bottom = Math.max(bottom, y);
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
    }
  }

  return {
    alphaBbox: bottom === -1 ? null : { bottom, left, right, top },
    visiblePixels,
  };
}

async function decodeAsset(
  assetDirectory: string,
  file: string,
  pose: string
): Promise<DecodedAsset> {
  const encoded = await readFile(path.join(assetDirectory, file));
  const decoded = await sharp(encoded)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alpha = inspectAlpha(
    decoded.data,
    decoded.info.width,
    decoded.info.height
  );

  return {
    alphaBbox: alpha.alphaBbox,
    file,
    fileSha256: sha256(encoded),
    height: decoded.info.height,
    pose,
    rgba: decoded.data,
    rgbaSha256: sha256(decoded.data),
    visiblePixels: alpha.visiblePixels,
    webpEncoding: webpEncoding(encoded),
    width: decoded.info.width,
  };
}

function addCheck(
  checks: CheckResult[],
  id: string,
  passed: boolean,
  message: string,
  details?: unknown
) {
  checks.push({ details, id, message, passed });
}

function sameMembers(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }
  const leftSorted = left.toSorted();
  const rightSorted = right.toSorted();
  return leftSorted.every((value, index) => value === rightSorted[index]);
}

function transitionSequenceIssues(files: string[]) {
  const stepsByEdge = new Map<string, number[]>();

  for (const file of files) {
    const match = /^transition-([a-z-]+)-(\d+)\.webp$/.exec(file);
    if (!match) {
      continue;
    }

    const [, edge, stepText] = match;
    if (!(edge && stepText)) {
      continue;
    }

    stepsByEdge.set(edge, [
      ...(stepsByEdge.get(edge) ?? []),
      Math.trunc(Number(stepText)),
    ]);
  }

  return [...stepsByEdge.entries()]
    .map(([edge, steps]) => {
      const sorted = steps.toSorted((left, right) => left - right);
      const expected = Array.from(
        { length: sorted.length },
        (_, index) => index + 1
      );
      return sorted.every((step, index) => step === expected[index])
        ? null
        : { edge, expected, steps: sorted };
    })
    .filter(Boolean);
}

function duplicateGroups(
  assets: DecodedAsset[],
  property: "fileSha256" | "rgbaSha256"
) {
  const groups = new Map<string, string[]>();
  for (const asset of assets) {
    groups.set(
      property === "fileSha256" ? asset.fileSha256 : asset.rgbaSha256,
      [
        ...(groups.get(
          property === "fileSha256" ? asset.fileSha256 : asset.rgbaSha256
        ) ?? []),
        asset.file,
      ]
    );
  }
  return [...groups.values()].filter((files) => files.length > 1);
}

async function createContactSheet(
  assets: DecodedAsset[],
  orderedPoses: string[],
  assetDirectory: string,
  cellSize: number,
  outputPath: string
) {
  const assetsByPose = new Map(assets.map((asset) => [asset.pose, asset]));
  const orderedAssets: DecodedAsset[] = [];
  for (const pose of orderedPoses) {
    const asset = assetsByPose.get(pose);
    if (!asset) {
      return false;
    }
    orderedAssets.push(asset);
  }

  const columns = 3;
  const rows = 3;
  const images = await Promise.all(
    orderedAssets.map(async (asset, index) => ({
      input: await sharp(path.join(assetDirectory, asset.file))
        .resize(cellSize, cellSize, { fit: "fill" })
        .flatten({ background: "#181716" })
        .png()
        .toBuffer(),
      left: (index % columns) * cellSize,
      top: Math.floor(index / columns) * cellSize,
    }))
  );
  const labels = orderedAssets
    .map((asset, index) => {
      const x = (index % columns) * cellSize;
      const y = Math.floor(index / columns) * cellSize;
      const centerOutline =
        asset.pose === "center"
          ? `<rect x="${x + 1}" y="${y + 1}" width="${cellSize - 2}" height="${cellSize - 2}" fill="none" stroke="#67e8f9" stroke-width="3"/>`
          : "";
      return `${centerOutline}<rect x="${x + 5}" y="${y + 5}" width="${Math.max(52, asset.pose.length * 8 + 10)}" height="20" rx="3" fill="#000" fill-opacity="0.76"/><text x="${x + 10}" y="${y + 19}" fill="#fff" font-size="12" font-family="monospace">${asset.pose}</text>`;
    })
    .join("");
  const overlay = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${columns * cellSize}" height="${rows * cellSize}">${labels}</svg>`
  );

  await sharp({
    create: {
      background: "#181716",
      channels: 4,
      height: rows * cellSize,
      width: columns * cellSize,
    },
  })
    .composite([...images, { input: overlay, left: 0, top: 0 }])
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
  return true;
}

// The verifier intentionally evaluates every gate so one run reports the full
// release state instead of stopping after the first invalid endpoint.
// oxlint-disable-next-line complexity
async function main() {
  const assetDirectory = commandLineValue(
    "--asset-directory",
    DEFAULT_ASSET_DIRECTORY
  );
  const configPath = commandLineValue("--config", DEFAULT_CONFIG_PATH);
  const outputDirectory = commandLineValue(
    "--output-directory",
    DEFAULT_OUTPUT_DIRECTORY
  );
  const qaConfig = JSON.parse(await readFile(configPath, "utf-8")) as QaConfig;
  const manifest = JSON.parse(
    await readFile(path.join(assetDirectory, "manifest.json"), "utf-8")
  ) as ReleaseManifest;
  const files = await readdir(assetDirectory);
  const checks: CheckResult[] = [];

  const expectedEndpointFiles = qaConfig.expectedEndpointNames.map(
    (pose) => `${pose}.webp`
  );
  const expectedTransitionFiles = FACE_MOTION_CANONICAL_EDGES.flatMap(
    ([from, to]) =>
      Array.from(
        { length: 3 },
        (_, index) => `transition-${from}-${to}-${index + 1}.webp`
      )
  );
  const discoveredWebpFiles = files.filter((file) => file.endsWith(".webp"));
  const discoveredTransitionFiles = discoveredWebpFiles.filter((file) =>
    TRANSITION_FILENAME.test(file)
  );
  const discoveredCoreWebpFiles = discoveredWebpFiles.filter(
    (file) => !TRANSITION_FILENAME.test(file)
  );
  const expectedCoreWebpFiles = [
    ...expectedEndpointFiles,
    qaConfig.atlasFilename,
    qaConfig.posterFilename,
    qaConfig.runtimePosterFilename,
  ];
  const manifestPoses = manifest.endpoints.map((endpoint) => endpoint.pose);
  const manifestFiles = manifest.endpoints.map((endpoint) => endpoint.file);

  addCheck(
    checks,
    "release-contract",
    manifest.schemaVersion === 1 &&
      manifest.version === qaConfig.expectedManifestVersion &&
      manifest.model === qaConfig.expectedModel &&
      manifest.assetBasePath === qaConfig.expectedAssetBasePath &&
      manifest.center === "center" &&
      manifest.poster === qaConfig.posterFilename,
    "The release manifest must identify the approved V13 GPT Image 2 asset set.",
    {
      actual: {
        assetBasePath: manifest.assetBasePath,
        center: manifest.center,
        model: manifest.model,
        poster: manifest.poster,
        version: manifest.version,
      },
      expected: {
        assetBasePath: qaConfig.expectedAssetBasePath,
        center: "center",
        model: qaConfig.expectedModel,
        poster: qaConfig.posterFilename,
        version: qaConfig.expectedManifestVersion,
      },
    }
  );
  addCheck(
    checks,
    "immutable-endpoint-contract",
    !manifest.processing.crop &&
      !manifest.processing.recenter &&
      !manifest.processing.rotate &&
      !manifest.processing.warp &&
      !manifest.processing.bodyLock &&
      !manifest.processing.opticalFlow &&
      !manifest.processing.interpolate &&
      !manifest.processing.blend,
    "V13 must declare uncropped, unwarped, and unblended generated endpoints.",
    manifest.processing
  );
  addCheck(
    checks,
    "manifest-canvas",
    manifest.canvas.width === qaConfig.expectedCanvasWidth &&
      manifest.canvas.height === qaConfig.expectedCanvasHeight,
    "The manifest canvas must be the approved 1254px square.",
    { actual: manifest.canvas, expected: [1254, 1254] }
  );
  addCheck(
    checks,
    "manifest-endpoints",
    manifest.endpoints.length === 9 &&
      sameMembers(manifestPoses, qaConfig.expectedEndpointNames) &&
      sameMembers(manifestFiles, expectedEndpointFiles) &&
      manifest.endpoints.every(
        (endpoint) => endpoint.file === `${endpoint.pose}.webp`
      ),
    "The manifest must contain each semantic compass endpoint exactly once.",
    {
      expectedFiles: expectedEndpointFiles,
      files: manifestFiles,
      poses: manifestPoses,
    }
  );
  addCheck(
    checks,
    "webp-inventory",
    sameMembers(discoveredCoreWebpFiles, expectedCoreWebpFiles) &&
      sameMembers(discoveredTransitionFiles, expectedTransitionFiles),
    "The release directory must contain the exact endpoints, 48 transitions, neutral poster, runtime poster, and runtime atlas.",
    {
      core: discoveredCoreWebpFiles.toSorted(),
      expectedCore: expectedCoreWebpFiles.toSorted(),
      expectedTransitions: expectedTransitionFiles.toSorted(),
      transitions: discoveredTransitionFiles.toSorted(),
    }
  );

  const presentEndpoints = manifest.endpoints.filter((endpoint) =>
    files.includes(endpoint.file)
  );
  const decodedEndpoints = await Promise.all(
    presentEndpoints.map(
      async (endpoint) =>
        await decodeAsset(assetDirectory, endpoint.file, endpoint.pose)
    )
  );
  const manifestHashMismatches = decodedEndpoints
    .map((asset) => {
      const endpoint = manifest.endpoints.find(
        (candidate) => candidate.file === asset.file
      );
      return endpoint?.fileSha256 === asset.fileSha256
        ? null
        : {
            actual: asset.fileSha256,
            expected: endpoint?.fileSha256 ?? null,
            file: asset.file,
          };
    })
    .filter(Boolean);
  addCheck(
    checks,
    "manifest-file-hashes",
    decodedEndpoints.length === 9 && manifestHashMismatches.length === 0,
    "Every deployed endpoint must match its immutable manifest SHA-256.",
    manifestHashMismatches
  );

  const decodedTransitions = await Promise.all(
    discoveredTransitionFiles.map(
      async (file) => await decodeAsset(assetDirectory, file, file)
    )
  );
  const invalidTransitions = decodedTransitions
    .filter(
      (asset) =>
        asset.width !== FACE_MOTION_CONFIG.atlasCellSizePx ||
        asset.height !== FACE_MOTION_CONFIG.atlasCellSizePx ||
        asset.webpEncoding !== "lossy" ||
        asset.visiblePixels === 0 ||
        !asset.alphaBbox
    )
    .map((asset) => ({
      dimensions: [asset.width, asset.height],
      encoding: asset.webpEncoding,
      file: asset.file,
      visiblePixels: asset.visiblePixels,
    }));
  addCheck(
    checks,
    "transition-assets",
    discoveredTransitionFiles.length === expectedTransitionFiles.length &&
      invalidTransitions.length === 0,
    "Every approved transition must be a visible 240×240 lossy WebP with alpha.",
    invalidTransitions
  );
  const invalidTransitionSequences = transitionSequenceIssues(
    discoveredTransitionFiles
  );
  addCheck(
    checks,
    "transition-sequences",
    invalidTransitionSequences.length === 0,
    "Every transition edge must use contiguous 1-based frame numbering.",
    invalidTransitionSequences
  );

  const wrongDimensions = decodedEndpoints
    .filter(
      (asset) =>
        asset.width !== qaConfig.expectedCanvasWidth ||
        asset.height !== qaConfig.expectedCanvasHeight
    )
    .map((asset) => ({
      actual: [asset.width, asset.height],
      file: asset.file,
    }));
  addCheck(
    checks,
    "endpoint-dimensions",
    decodedEndpoints.length === 9 && wrongDimensions.length === 0,
    "Every endpoint must be exactly 1254×1254.",
    wrongDimensions
  );

  const nonLosslessEndpoints = decodedEndpoints
    .filter((asset) => asset.webpEncoding !== "lossless")
    .map((asset) => ({ encoding: asset.webpEncoding, file: asset.file }));
  addCheck(
    checks,
    "lossless-endpoints",
    !qaConfig.requireLosslessEndpoints || nonLosslessEndpoints.length === 0,
    "Every endpoint must use lossless VP8L WebP encoding.",
    nonLosslessEndpoints
  );

  const emptyEndpoints = decodedEndpoints
    .filter((asset) => asset.visiblePixels === 0 || !asset.alphaBbox)
    .map((asset) => asset.file);
  addCheck(
    checks,
    "visible-endpoints",
    decodedEndpoints.length === 9 && emptyEndpoints.length === 0,
    "Every endpoint must contain a visible transparent-background portrait.",
    emptyEndpoints
  );

  const duplicateEncodedGroups = duplicateGroups(
    decodedEndpoints,
    "fileSha256"
  );
  const duplicateDecodedGroups = duplicateGroups(
    decodedEndpoints,
    "rgbaSha256"
  );
  addCheck(
    checks,
    "unique-endpoints",
    duplicateEncodedGroups.length === 0 && duplicateDecodedGroups.length === 0,
    "All nine compass endpoints must contain unique generated portraits.",
    {
      decodedDuplicates: duplicateDecodedGroups,
      encodedDuplicates: duplicateEncodedGroups,
    }
  );

  const center = decodedEndpoints.find(
    (asset) => asset.file === qaConfig.centerFilename
  );
  addCheck(
    checks,
    "approved-center-hash",
    center?.rgbaSha256 === qaConfig.approvedCenterRgbaSha256,
    "The decoded center portrait must match the approved center hash.",
    {
      actual: center?.rgbaSha256 ?? null,
      expected: qaConfig.approvedCenterRgbaSha256,
    }
  );

  const poster = files.includes(qaConfig.posterFilename)
    ? await decodeAsset(assetDirectory, qaConfig.posterFilename, "poster")
    : undefined;
  const posterHasApprovedDimensions =
    poster?.width === qaConfig.expectedCanvasWidth &&
    poster.height === qaConfig.expectedCanvasHeight;
  const posterIsLossless = poster?.webpEncoding === "lossless";
  const posterMatchesCenter =
    poster?.fileSha256 === center?.fileSha256 &&
    poster?.rgbaSha256 === center?.rgbaSha256;
  addCheck(
    checks,
    "neutral-poster-center-parity",
    !qaConfig.neutralPosterMustMatchCenter ||
      (posterHasApprovedDimensions && posterIsLossless && posterMatchesCenter),
    "The neutral poster must be a byte-for-byte and decoded-pixel copy of center.webp.",
    {
      centerFileSha256: center?.fileSha256 ?? null,
      centerRgbaSha256: center?.rgbaSha256 ?? null,
      posterFileSha256: poster?.fileSha256 ?? null,
      posterRgbaSha256: poster?.rgbaSha256 ?? null,
    }
  );

  const hasRuntimeFiles = [
    qaConfig.atlasFilename,
    qaConfig.atlasManifestFilename,
    qaConfig.runtimePosterFilename,
  ].every((file) => files.includes(file));
  const atlasEncoded = hasRuntimeFiles
    ? await readFile(path.join(assetDirectory, qaConfig.atlasFilename))
    : undefined;
  const runtimePosterEncoded = hasRuntimeFiles
    ? await readFile(path.join(assetDirectory, qaConfig.runtimePosterFilename))
    : undefined;
  const runtimeAtlas = atlasEncoded
    ? await decodeAsset(assetDirectory, qaConfig.atlasFilename, "runtime-atlas")
    : undefined;
  const runtimePoster = runtimePosterEncoded
    ? await decodeAsset(
        assetDirectory,
        qaConfig.runtimePosterFilename,
        "runtime-poster"
      )
    : undefined;
  const atlasManifest = hasRuntimeFiles
    ? (JSON.parse(
        await readFile(
          path.join(assetDirectory, qaConfig.atlasManifestFilename),
          "utf-8"
        )
      ) as AtlasManifest)
    : undefined;
  const expectedAtlasWidth =
    FACE_MOTION_CONFIG.atlasColumns * FACE_MOTION_CONFIG.atlasCellSizePx;
  const expectedAtlasHeight =
    FACE_MOTION_CONFIG.atlasRows * FACE_MOTION_CONFIG.atlasCellSizePx;
  addCheck(
    checks,
    "runtime-lossy-alpha-assets",
    runtimeAtlas?.width === expectedAtlasWidth &&
      runtimeAtlas.height === expectedAtlasHeight &&
      runtimeAtlas.webpEncoding === "lossy" &&
      runtimeAtlas.visiblePixels > 0 &&
      runtimePoster?.width === FACE_MOTION_CONFIG.atlasCellSizePx &&
      runtimePoster.height === FACE_MOTION_CONFIG.atlasCellSizePx &&
      runtimePoster.webpEncoding === "lossy" &&
      runtimePoster.visiblePixels > 0,
    "The browser runtime must use a 240px lossy-alpha poster and a 57-frame lossy-alpha atlas.",
    {
      atlas: runtimeAtlas
        ? {
            dimensions: [runtimeAtlas.width, runtimeAtlas.height],
            encoding: runtimeAtlas.webpEncoding,
            visiblePixels: runtimeAtlas.visiblePixels,
          }
        : null,
      poster: runtimePoster
        ? {
            dimensions: [runtimePoster.width, runtimePoster.height],
            encoding: runtimePoster.webpEncoding,
            visiblePixels: runtimePoster.visiblePixels,
          }
        : null,
    }
  );

  const atlasFramesValid =
    atlasManifest?.frames.length === FACE_MOTION_ATLAS_FRAME_ORDER.length &&
    atlasManifest.frames.every(
      (frame, index) =>
        frame.frame === FACE_MOTION_ATLAS_FRAME_ORDER[index] &&
        frame.index === index &&
        frame.column === index % FACE_MOTION_CONFIG.atlasColumns &&
        frame.row === Math.floor(index / FACE_MOTION_CONFIG.atlasColumns)
    );
  const atlasSourceHashMismatches = atlasManifest
    ? (
        await Promise.all(
          atlasManifest.frames.map(async (frame) => {
            const source = await readFile(
              path.join(assetDirectory, frame.file)
            );
            const actual = sha256(source);
            return actual === frame.sourceSha256
              ? null
              : { actual, expected: frame.sourceSha256, file: frame.file };
          })
        )
      ).filter(Boolean)
    : [];
  addCheck(
    checks,
    "runtime-atlas-manifest",
    atlasManifest?.schemaVersion === 1 &&
      atlasManifest.revision === FACE_MOTION_CONFIG.assetRevision &&
      atlasManifest.encoding.format === "lossy WebP with alpha" &&
      atlasManifest.atlas.file === qaConfig.atlasFilename &&
      atlasManifest.atlas.width === expectedAtlasWidth &&
      atlasManifest.atlas.height === expectedAtlasHeight &&
      atlasManifest.atlas.cellWidth === FACE_MOTION_CONFIG.atlasCellSizePx &&
      atlasManifest.atlas.cellHeight === FACE_MOTION_CONFIG.atlasCellSizePx &&
      atlasManifest.atlas.sha256 ===
        (atlasEncoded ? sha256(atlasEncoded) : undefined) &&
      atlasManifest.poster.file === qaConfig.runtimePosterFilename &&
      atlasManifest.poster.sha256 ===
        (runtimePosterEncoded ? sha256(runtimePosterEncoded) : undefined) &&
      atlasFramesValid &&
      atlasSourceHashMismatches.length === 0,
    "The atlas manifest must map all 57 frames to their exact approved master sources.",
    {
      frameCount: atlasManifest?.frames.length ?? 0,
      framesValid: atlasFramesValid,
      sourceHashMismatches: atlasSourceHashMismatches,
    }
  );

  const runtimePayloadBytes =
    (atlasEncoded?.byteLength ?? 0) + (runtimePosterEncoded?.byteLength ?? 0);
  addCheck(
    checks,
    "runtime-payload-budget",
    hasRuntimeFiles && runtimePayloadBytes <= qaConfig.maxRuntimePayloadBytes,
    "The complete browser face-motion payload must stay at or below the 1.5 MB budget.",
    {
      atlasBytes: atlasEncoded?.byteLength ?? 0,
      budgetBytes: qaConfig.maxRuntimePayloadBytes,
      referenceSiteBothThemesBytes: 1_446_302,
      runtimePayloadBytes,
      runtimePosterBytes: runtimePosterEncoded?.byteLength ?? 0,
    }
  );

  await mkdir(outputDirectory, { recursive: true });
  const contactSheetPath = path.join(outputDirectory, "contact-sheet.png");
  const contactSheetCreated = await createContactSheet(
    decodedEndpoints,
    qaConfig.expectedEndpointNames,
    assetDirectory,
    qaConfig.contactSheetCellSize,
    contactSheetPath
  );
  const failedChecks = checks.filter((check) => !check.passed);
  const reportPath = path.join(outputDirectory, "report.json");
  const report = {
    checks,
    config: qaConfig,
    contactSheet: contactSheetCreated ? contactSheetPath : null,
    endpoints: decodedEndpoints.map((asset) => ({
      alphaBbox: asset.alphaBbox,
      file: asset.file,
      fileSha256: asset.fileSha256,
      height: asset.height,
      pose: asset.pose,
      rgbaSha256: asset.rgbaSha256,
      visiblePixels: asset.visiblePixels,
      webpEncoding: asset.webpEncoding,
      width: asset.width,
    })),
    transitions: decodedTransitions.map((asset) => ({
      alphaBbox: asset.alphaBbox,
      file: asset.file,
      fileSha256: asset.fileSha256,
      height: asset.height,
      rgbaSha256: asset.rgbaSha256,
      visiblePixels: asset.visiblePixels,
      webpEncoding: asset.webpEncoding,
      width: asset.width,
    })),
    manifest: {
      assetBasePath: manifest.assetBasePath,
      model: manifest.model,
      version: manifest.version,
    },
    poster: poster
      ? {
          file: poster.file,
          fileSha256: poster.fileSha256,
          rgbaSha256: poster.rgbaSha256,
        }
      : null,
    runtime: {
      atlas: runtimeAtlas
        ? {
            bytes: atlasEncoded?.byteLength ?? 0,
            file: runtimeAtlas.file,
            fileSha256: runtimeAtlas.fileSha256,
            height: runtimeAtlas.height,
            webpEncoding: runtimeAtlas.webpEncoding,
            width: runtimeAtlas.width,
          }
        : null,
      payloadBytes: runtimePayloadBytes,
      poster: runtimePoster
        ? {
            bytes: runtimePosterEncoded?.byteLength ?? 0,
            file: runtimePoster.file,
            fileSha256: runtimePoster.fileSha256,
            height: runtimePoster.height,
            webpEncoding: runtimePoster.webpEncoding,
            width: runtimePoster.width,
          }
        : null,
    },
    result: {
      failedCheckIds: failedChecks.map((check) => check.id),
      passed: failedChecks.length === 0,
    },
    schemaVersion: 2,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  if (failedChecks.length > 0) {
    console.error(
      `Face-motion asset QA failed (${failedChecks.length}/${checks.length} checks):`
    );
    for (const check of failedChecks) {
      console.error(`- ${check.id}: ${check.message}`);
    }
    console.error(`Report: ${reportPath}`);
    if (contactSheetCreated) {
      console.error(`Contact sheet: ${contactSheetPath}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Verified nine GPT Image 2 endpoints and ${decodedTransitions.length} approved transition frames with ${checks.length} deterministic QA checks.`
  );
  console.log(`Report: ${reportPath}`);
  console.log(`Contact sheet: ${contactSheetPath}`);
}

await main();
