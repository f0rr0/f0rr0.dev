export const FACE_MOTION_CONFIG = {
  assetBasePath: "/resume/face-motion/v13",
  assetRevision: "20260815b",
  centerPose: "center",
  deadZoneRatio: 0.5,
  frameIntervalMs: 36,
} as const;

const faceMotionAsset = (file: string) =>
  `${FACE_MOTION_CONFIG.assetBasePath}/${file}?rev=${FACE_MOTION_CONFIG.assetRevision}`;

export const FACE_MOTION_RING = Object.freeze([
  "right",
  "bottom-right",
  "bottom",
  "bottom-left",
  "left",
  "top-left",
  "top",
  "top-right",
] as const);

export type FaceMotionRingPose = (typeof FACE_MOTION_RING)[number];
export type FaceMotionPose = "center" | FaceMotionRingPose;

export const FACE_MOTION_POSES = Object.freeze([
  FACE_MOTION_CONFIG.centerPose,
  ...FACE_MOTION_RING,
] as const);

export const FACE_MOTION_SOURCE_BY_POSE = Object.freeze(
  Object.fromEntries(
    FACE_MOTION_POSES.map((pose) => [pose, faceMotionAsset(`${pose}.webp`)])
  ) as Record<FaceMotionPose, string>
);

export const FACE_MOTION_POSE_SOURCES = Object.freeze(
  FACE_MOTION_POSES.map((pose) => FACE_MOTION_SOURCE_BY_POSE[pose])
);

export const FACE_MOTION_NEUTRAL_SRC =
  FACE_MOTION_SOURCE_BY_POSE[FACE_MOTION_CONFIG.centerPose];
export const FACE_MOTION_POSTER_SRC = faceMotionAsset("portrait-neutral.webp");
export const FACE_MOTION_AVATAR_SRC = FACE_MOTION_NEUTRAL_SRC;

export const FACE_MOTION_CANONICAL_EDGES = Object.freeze([
  ["center", "top"],
  ["center", "top-right"],
  ["center", "right"],
  ["center", "bottom-right"],
  ["center", "bottom"],
  ["center", "bottom-left"],
  ["center", "left"],
  ["center", "top-left"],
  ["top", "top-right"],
  ["top-right", "right"],
  ["right", "bottom-right"],
  ["bottom-right", "bottom"],
  ["bottom", "bottom-left"],
  ["bottom-left", "left"],
  ["left", "top-left"],
  ["top-left", "top"],
] as const satisfies readonly (readonly [FaceMotionPose, FaceMotionPose])[]);

export type FaceMotionCanonicalEdge =
  (typeof FACE_MOTION_CANONICAL_EDGES)[number];
export type FaceMotionCanonicalEdgeKey =
  `${FaceMotionCanonicalEdge[0]}_to_${FaceMotionCanonicalEdge[1]}`;
export type FaceMotionIntermediateFrame = `${string}_to_${string}_${number}`;
export type FaceMotionFrame = FaceMotionPose | FaceMotionIntermediateFrame;

/**
 * Optional intermediate assets, always listed in canonical forward order.
 * Empty edges remain valid: the runtime advances directly to the endpoint.
 */
export const FACE_MOTION_EDGE_FRAMES = Object.freeze({
  center_to_bottom: [faceMotionAsset("transition-center-bottom-1.webp")],
  center_to_left: [
    faceMotionAsset("transition-center-left-1.webp"),
    faceMotionAsset("transition-center-left-2.webp"),
  ],
  center_to_top: [
    faceMotionAsset("transition-center-top-1.webp"),
    faceMotionAsset("transition-center-top-2.webp"),
    faceMotionAsset("transition-center-top-3.webp"),
  ],
  "center_to_top-left": [faceMotionAsset("transition-center-top-left-1.webp")],
  "center_to_top-right": [
    faceMotionAsset("transition-center-top-right-1.webp"),
  ],
  "right_to_bottom-right": [
    faceMotionAsset("transition-right-bottom-right-1.webp"),
  ],
}) as Readonly<Partial<Record<FaceMotionCanonicalEdgeKey, readonly string[]>>>;

export const FACE_MOTION_ALL_SOURCES = Object.freeze([
  ...FACE_MOTION_POSE_SOURCES,
  ...Object.values(FACE_MOTION_EDGE_FRAMES).flatMap((sources) => sources ?? []),
]);

interface RectLike {
  height: number;
  left: number;
  top: number;
  width: number;
}

interface CanonicalEdgeDetails {
  end: FaceMotionPose;
  forward: boolean;
  key: FaceMotionCanonicalEdgeKey;
  start: FaceMotionPose;
}

interface ActiveEdge {
  from: FaceMotionPose;
  intermediates: number;
  step: number;
  to: FaceMotionPose;
}

type IntermediateCountResolver =
  | number
  | ((from: FaceMotionPose, to: FaceMotionPose) => number);

interface CompassFaceMachineOptions {
  initialPose?: FaceMotionPose;
  intermediates?: IntermediateCountResolver;
}

const FACE_MOTION_POSE_SET = new Set<FaceMotionPose>(FACE_MOTION_POSES);
const FACE_MOTION_RING_INDEX = new Map<FaceMotionRingPose, number>(
  FACE_MOTION_RING.map((pose, index) => [pose, index])
);

const isFaceMotionPose = (value: string): value is FaceMotionPose =>
  FACE_MOTION_POSE_SET.has(value as FaceMotionPose);

function assertFaceMotionPose(pose: string): asserts pose is FaceMotionPose {
  if (!isFaceMotionPose(pose)) {
    throw new Error(`Unknown face-motion pose: ${pose}`);
  }
}

export function poseFromPointer(
  pointerX: number,
  pointerY: number,
  anchorX: number,
  anchorY: number,
  deadZone: number
): FaceMotionPose {
  const deltaX = pointerX - anchorX;
  const deltaY = pointerY - anchorY;

  if (Math.hypot(deltaX, deltaY) < Math.max(0, deadZone)) {
    return FACE_MOTION_CONFIG.centerPose;
  }

  const fullTurn = Math.PI * 2;
  const sectorSize = Math.PI / 4;
  const normalizedAngle =
    (((Math.atan2(deltaY, deltaX) + sectorSize / 2) % fullTurn) + fullTurn) %
    fullTurn;
  const sector = Math.floor(normalizedAngle / sectorSize);

  return FACE_MOTION_RING[sector] ?? FACE_MOTION_CONFIG.centerPose;
}

export function poseFromClientPointer(
  clientX: number,
  clientY: number,
  portraitRect: RectLike,
  deadZone = Math.min(portraitRect.width, portraitRect.height) *
    FACE_MOTION_CONFIG.deadZoneRatio
): FaceMotionPose {
  if (portraitRect.width <= 0 || portraitRect.height <= 0) {
    return FACE_MOTION_CONFIG.centerPose;
  }

  return poseFromPointer(
    clientX,
    clientY,
    portraitRect.left + portraitRect.width / 2,
    portraitRect.top + portraitRect.height / 2,
    deadZone
  );
}

export function faceMotionNeighbors(pose: FaceMotionPose): FaceMotionPose[] {
  if (pose === FACE_MOTION_CONFIG.centerPose) {
    return [...FACE_MOTION_RING];
  }

  const ringIndex = FACE_MOTION_RING_INDEX.get(pose);

  if (ringIndex === undefined) {
    throw new Error(`Unknown face-motion pose: ${pose}`);
  }

  return [
    FACE_MOTION_CONFIG.centerPose,
    FACE_MOTION_RING[
      (ringIndex + FACE_MOTION_RING.length - 1) % FACE_MOTION_RING.length
    ],
    FACE_MOTION_RING[(ringIndex + 1) % FACE_MOTION_RING.length],
  ];
}

export function shortestPosePath(
  from: FaceMotionPose,
  to: FaceMotionPose
): FaceMotionPose[] {
  assertFaceMotionPose(from);
  assertFaceMotionPose(to);

  if (from === to) {
    return [from];
  }

  const queue: FaceMotionPose[][] = [[from]];
  const visited = new Set<FaceMotionPose>([from]);

  while (queue.length > 0) {
    const path = queue.shift();

    if (path === undefined) {
      break;
    }

    const endpoint = path.at(-1);

    if (endpoint === undefined) {
      continue;
    }

    for (const neighbor of faceMotionNeighbors(endpoint)) {
      if (visited.has(neighbor)) {
        continue;
      }

      const candidate = [...path, neighbor];

      if (neighbor === to) {
        return candidate;
      }

      visited.add(neighbor);
      queue.push(candidate);
    }
  }

  throw new Error(`Unreachable face-motion pose: ${to}`);
}

export function canonicalFaceMotionEdge(
  from: FaceMotionPose,
  to: FaceMotionPose
): CanonicalEdgeDetails {
  const pair = FACE_MOTION_CANONICAL_EDGES.find(
    ([start, end]) =>
      (from === start && to === end) || (from === end && to === start)
  );

  if (pair === undefined) {
    throw new Error(`Non-adjacent face-motion edge: ${from} -> ${to}`);
  }

  const [start, end] = pair;

  return {
    end,
    forward: from === start,
    key: `${start}_to_${end}`,
    start,
  };
}

export function faceMotionEdgeSources(
  from: FaceMotionPose,
  to: FaceMotionPose
): readonly string[] {
  const edge = canonicalFaceMotionEdge(from, to);
  const sources = FACE_MOTION_EDGE_FRAMES[edge.key] ?? [];

  return edge.forward ? sources : sources.toReversed();
}

export function edgeFrameKey(
  from: FaceMotionPose,
  to: FaceMotionPose,
  step: number,
  intermediates: number
): FaceMotionIntermediateFrame {
  if (!Number.isInteger(intermediates) || intermediates < 1) {
    throw new Error(`Invalid intermediate count: ${intermediates}`);
  }

  if (!Number.isInteger(step) || step < 1 || step > intermediates) {
    throw new Error(`Invalid edge step: ${step}`);
  }

  const edge = canonicalFaceMotionEdge(from, to);
  const canonicalStep = edge.forward ? step : intermediates + 1 - step;

  return `${edge.start}_to_${edge.end}_${canonicalStep}`.replaceAll(
    "-",
    ""
  ) as FaceMotionIntermediateFrame;
}

export function faceMotionFrameSource(frame: FaceMotionFrame): string | null {
  if (isFaceMotionPose(frame)) {
    return FACE_MOTION_SOURCE_BY_POSE[frame];
  }

  for (const [from, to] of FACE_MOTION_CANONICAL_EDGES) {
    const sources = FACE_MOTION_EDGE_FRAMES[`${from}_to_${to}`] ?? [];
    const frameIndex = sources.findIndex(
      (_, index) => edgeFrameKey(from, to, index + 1, sources.length) === frame
    );

    if (frameIndex !== -1) {
      return sources[frameIndex] ?? null;
    }
  }

  return null;
}

export class CompassFaceMachine {
  private edge: ActiveEdge | null = null;
  private readonly intermediateCount: IntermediateCountResolver;
  private frame: FaceMotionFrame;
  private pose: FaceMotionPose;
  private target: FaceMotionPose;

  constructor({
    initialPose = FACE_MOTION_CONFIG.centerPose,
    intermediates = 0,
  }: CompassFaceMachineOptions = {}) {
    assertFaceMotionPose(initialPose);

    if (
      typeof intermediates === "number" &&
      (!Number.isInteger(intermediates) || intermediates < 0)
    ) {
      throw new Error("intermediates must be a non-negative integer");
    }

    this.frame = initialPose;
    this.intermediateCount = intermediates;
    this.pose = initialPose;
    this.target = initialPose;
  }

  getFrame(): FaceMotionFrame {
    return this.frame;
  }

  getPose(): FaceMotionPose {
    return this.pose;
  }

  getTarget(): FaceMotionPose {
    return this.target;
  }

  isSettled(): boolean {
    return this.edge === null && this.pose === this.target;
  }

  setTarget(target: FaceMotionPose): void {
    assertFaceMotionPose(target);

    if (target === this.target) {
      return;
    }

    this.target = target;

    if (this.edge === null) {
      return;
    }

    const distanceFrom = this.edge.step;
    const distanceTo = this.edge.intermediates + 1 - this.edge.step;

    if (distanceFrom < distanceTo) {
      this.edge = {
        from: this.edge.to,
        intermediates: this.edge.intermediates,
        step: this.edge.intermediates + 1 - this.edge.step,
        to: this.edge.from,
      };
    }
  }

  setPointer(
    clientX: number,
    clientY: number,
    portraitRect: RectLike,
    deadZone?: number
  ): FaceMotionPose {
    const target = poseFromClientPointer(
      clientX,
      clientY,
      portraitRect,
      deadZone
    );
    this.setTarget(target);
    return target;
  }

  advance(): FaceMotionFrame {
    if (this.edge === null) {
      if (this.pose === this.target) {
        return this.frame;
      }

      const path = shortestPosePath(this.pose, this.target);
      const [, nextPose] = path;

      if (nextPose === undefined) {
        return this.frame;
      }

      this.edge = {
        from: this.pose,
        intermediates: this.getIntermediateCount(this.pose, nextPose),
        step: 0,
        to: nextPose,
      };
    }

    this.edge.step += 1;

    if (this.edge.step <= this.edge.intermediates) {
      this.frame = edgeFrameKey(
        this.edge.from,
        this.edge.to,
        this.edge.step,
        this.edge.intermediates
      );
      return this.frame;
    }

    this.pose = this.edge.to;
    this.frame = this.pose;
    this.edge = null;
    return this.frame;
  }

  private getIntermediateCount(
    from: FaceMotionPose,
    to: FaceMotionPose
  ): number {
    const count =
      typeof this.intermediateCount === "function"
        ? this.intermediateCount(from, to)
        : this.intermediateCount;

    if (!Number.isInteger(count) || count < 0) {
      throw new Error("intermediate count resolver returned an invalid value");
    }

    return count;
  }
}
