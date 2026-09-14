// Complete each turn before following the latest pointer direction.
export const FACE_MOTION_CONFIG = {
  atlasColumns: 8,
  atlasRows: 8,
  centerPose: "center",
  deadZoneRatio: 0.5,
  frameIntervalMs: 50,
} as const;

export const FACE_MOTION_POSTER_SRC = "/portraits/neutral.webp?v=7";
export const FACE_MOTION_ATLAS_SRC = "/portraits/atlas.webp?v=7";

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

const FACE_MOTION_POSE_SET = new Set<FaceMotionPose>(FACE_MOTION_POSES);
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

export const FACE_MOTION_ATLAS_FRAME_ORDER = Object.freeze([
  ...FACE_MOTION_POSES,
  ...FACE_MOTION_CANONICAL_EDGES.flatMap(([from, to]) =>
    Array.from({ length: 3 }, (_, index) =>
      edgeFrameKey(from, to, index + 1, 3)
    )
  ),
] as readonly FaceMotionFrame[]);

const FACE_MOTION_ATLAS_INDEX = new Map<FaceMotionFrame, number>(
  FACE_MOTION_ATLAS_FRAME_ORDER.map((frame, index) => [frame, index])
);

export function faceMotionAtlasFrameIndex(frame: FaceMotionFrame): number {
  const index = FACE_MOTION_ATLAS_INDEX.get(frame);

  if (index === undefined) {
    throw new Error(`Unknown face-motion atlas frame: ${frame}`);
  }

  return index;
}

export function faceMotionAtlasPosition(frame: FaceMotionFrame) {
  const index = faceMotionAtlasFrameIndex(frame);
  const column = index % FACE_MOTION_CONFIG.atlasColumns;
  const row = Math.floor(index / FACE_MOTION_CONFIG.atlasColumns);

  return {
    column,
    index,
    row,
    xPercent: (column / Math.max(1, FACE_MOTION_CONFIG.atlasColumns - 1)) * 100,
    yPercent: (row / Math.max(1, FACE_MOTION_CONFIG.atlasRows - 1)) * 100,
  } as const;
}

export class CompassFaceMachine {
  private edge: ActiveEdge | null = null;
  private frame: FaceMotionFrame;
  private pose: FaceMotionPose;
  private target: FaceMotionPose;

  constructor(initialPose: FaceMotionPose = "center") {
    assertFaceMotionPose(initialPose);
    this.frame = initialPose;
    this.pose = initialPose;
    this.target = initialPose;
  }

  getFrame(): FaceMotionFrame {
    return this.frame;
  }

  getPose(): FaceMotionPose {
    return this.pose;
  }

  isSettled(): boolean {
    return this.edge === null && this.pose === this.target;
  }

  setTarget(target: FaceMotionPose): void {
    assertFaceMotionPose(target);
    this.target = target;
  }

  advance(): FaceMotionFrame {
    if (this.edge === null) {
      if (this.pose === this.target) {
        return this.frame;
      }

      const adjacent = FACE_MOTION_CANONICAL_EDGES.some(
        ([start, end]) =>
          (this.pose === start && this.target === end) ||
          (this.pose === end && this.target === start)
      );
      if (!adjacent) {
        this.pose = this.target;
        this.frame = this.pose;
        return this.frame;
      }

      this.edge = {
        from: this.pose,
        intermediates: 3,
        step: 0,
        to: this.target,
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
}
