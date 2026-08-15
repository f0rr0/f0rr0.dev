import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import {
  CompassFaceMachine,
  FACE_MOTION_ALL_SOURCES,
  FACE_MOTION_AVATAR_SRC,
  FACE_MOTION_CANONICAL_EDGES,
  FACE_MOTION_CONFIG,
  FACE_MOTION_EDGE_FRAMES,
  FACE_MOTION_NEUTRAL_SRC,
  FACE_MOTION_POSES,
  FACE_MOTION_POSE_SOURCES,
  FACE_MOTION_POSTER_SRC,
  FACE_MOTION_RING,
  FACE_MOTION_SOURCE_BY_POSE,
  canonicalFaceMotionEdge,
  edgeFrameKey,
  faceMotionEdgeSources,
  faceMotionFrameSource,
  faceMotionNeighbors,
  poseFromClientPointer,
  poseFromPointer,
  shortestPosePath,
} from "../src/lib/face-motion";

const EXPECTED_RING = [
  "right",
  "bottom-right",
  "bottom",
  "bottom-left",
  "left",
  "top-left",
  "top",
  "top-right",
];

const EXPECTED_POSES = ["center", ...EXPECTED_RING];

const EXPECTED_EDGES = [
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
];

const pointAt = (angle, radius = 1000) => ({
  x: Math.cos(angle) * radius,
  y: Math.sin(angle) * radius,
});

const undirectedEdgeKey = (from, to) =>
  [from, to].toSorted((left, right) => left.localeCompare(right)).join("|");
const EXPECTED_EDGE_SET = new Set(
  EXPECTED_EDGES.map(([from, to]) => undirectedEdgeKey(from, to))
);

describe("V13 reference-compatible compass mapping", () => {
  test("declares one exact rest pose and eight clockwise screen-space poses", () => {
    expect(FACE_MOTION_CONFIG).toMatchObject({
      assetBasePath: "/resume/face-motion/v13",
      assetRevision: "20260815a",
      centerPose: "center",
      deadZoneRatio: 0.5,
      frameIntervalMs: 36,
    });
    expect([...FACE_MOTION_RING]).toEqual(EXPECTED_RING);
    expect([...FACE_MOTION_POSES]).toEqual(EXPECTED_POSES);
    expect(new Set(FACE_MOTION_POSES).size).toBe(9);
  });

  test("uses a dead zone equal to half the portrait's smaller dimension", () => {
    const rect = { height: 400, left: 100, top: 200, width: 320 };
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    expect(poseFromClientPointer(centerX, centerY, rect)).toBe("center");
    expect(poseFromClientPointer(centerX + 159.999, centerY, rect)).toBe(
      "center"
    );
    expect(poseFromClientPointer(centerX + 160, centerY, rect)).toBe("right");
    expect(poseFromClientPointer(centerX, centerY - 160, rect)).toBe("top");
    expect(poseFromClientPointer(centerX + 319, centerY, rect, 320)).toBe(
      "center"
    );
    expect(poseFromClientPointer(centerX + 320, centerY, rect, 320)).toBe(
      "right"
    );
  });

  test("returns the exact center for invalid portrait geometry", () => {
    expect(
      poseFromClientPointer(2000, -2000, {
        height: 320,
        left: 0,
        top: 0,
        width: 0,
      })
    ).toBe("center");
    expect(
      poseFromClientPointer(2000, -2000, {
        height: -1,
        left: 0,
        top: 0,
        width: 320,
      })
    ).toBe("center");
  });

  test("maps all eight sector centers without using pointer distance", () => {
    for (const [index, expectedPose] of EXPECTED_RING.entries()) {
      const angle = index * (Math.PI / 4);

      for (const radius of [61, 240, 10_000]) {
        const point = pointAt(angle, radius);
        expect(poseFromPointer(point.x, point.y, 0, 0, 60)).toBe(expectedPose);
      }
    }
  });

  test("centers every sector boundary at an exact 22.5-degree offset", () => {
    const angularEpsilon = 1e-7;

    for (let sector = 0; sector < EXPECTED_RING.length; sector += 1) {
      const boundary = -Math.PI / 8 + sector * (Math.PI / 4);
      const before = pointAt(boundary - angularEpsilon);
      const after = pointAt(boundary + angularEpsilon);
      const previousPose = EXPECTED_RING[(sector + 7) % EXPECTED_RING.length];
      const nextPose = EXPECTED_RING[sector];

      expect(poseFromPointer(before.x, before.y, 0, 0, 0)).toBe(previousPose);
      expect(poseFromPointer(after.x, after.y, 0, 0, 0)).toBe(nextPose);
    }
  });

  test("is mirror-symmetric across both portrait axes", () => {
    const horizontalMirror = {
      "bottom-left": "bottom-right",
      "bottom-right": "bottom-left",
      bottom: "bottom",
      left: "right",
      right: "left",
      "top-left": "top-right",
      "top-right": "top-left",
      top: "top",
    };
    const verticalMirror = {
      "bottom-left": "top-left",
      "bottom-right": "top-right",
      bottom: "top",
      left: "left",
      right: "right",
      "top-left": "bottom-left",
      "top-right": "bottom-right",
      top: "bottom",
    };

    for (let index = 0; index < EXPECTED_RING.length; index += 1) {
      const point = pointAt(index * (Math.PI / 4), 500);
      const pose = poseFromPointer(point.x, point.y, 0, 0, 0);
      const mirroredX = poseFromPointer(-point.x, point.y, 0, 0, 0);
      const mirroredY = poseFromPointer(point.x, -point.y, 0, 0, 0);

      expect(mirroredX).toBe(horizontalMirror[pose]);
      expect(mirroredY).toBe(verticalMirror[pose]);
    }
  });

  test("measures a document-wide pointer from the live portrait rectangle", () => {
    const rect = { height: 200, left: 400, top: 300, width: 200 };

    expect(poseFromClientPointer(1200, 400, rect, 25)).toBe("right");
    expect(poseFromClientPointer(500, -400, rect, 25)).toBe("top");
    expect(poseFromClientPointer(-400, 400, rect, 25)).toBe("left");
    expect(poseFromClientPointer(500, 1200, rect, 25)).toBe("bottom");
  });
});

describe("V13 endpoint assets", () => {
  test("maps each of the nine poses to one unique versioned endpoint", () => {
    expect(FACE_MOTION_POSE_SOURCES).toHaveLength(9);
    expect(new Set(FACE_MOTION_POSE_SOURCES).size).toBe(9);

    for (const pose of EXPECTED_POSES) {
      const expectedSource = `/resume/face-motion/v13/${pose}.webp?rev=20260815a`;
      expect(FACE_MOTION_SOURCE_BY_POSE[pose]).toBe(expectedSource);
      expect(FACE_MOTION_POSE_SOURCES).toContain(expectedSource);
      expect(faceMotionFrameSource(pose)).toBe(expectedSource);
    }
  });

  test("uses the exact center endpoint for rest and avatar fallbacks", () => {
    expect(FACE_MOTION_NEUTRAL_SRC).toBe(FACE_MOTION_SOURCE_BY_POSE.center);
    expect(FACE_MOTION_NEUTRAL_SRC).toBe(
      "/resume/face-motion/v13/center.webp?rev=20260815a"
    );
    expect(FACE_MOTION_AVATAR_SRC).toBe(FACE_MOTION_NEUTRAL_SRC);
    expect(FACE_MOTION_POSTER_SRC).toBe(
      "/resume/face-motion/v13/portrait-neutral.webp?rev=20260815a"
    );
  });

  test("has no duplicate endpoint or approved transition URLs", () => {
    const transitionSources = Object.values(FACE_MOTION_EDGE_FRAMES).flatMap(
      (sources) => sources ?? []
    );

    expect(FACE_MOTION_ALL_SOURCES).toEqual([
      ...FACE_MOTION_POSE_SOURCES,
      ...transitionSources,
    ]);
    expect(new Set(FACE_MOTION_ALL_SOURCES).size).toBe(
      FACE_MOTION_ALL_SOURCES.length
    );
    expect(FACE_MOTION_ALL_SOURCES.length).toBeGreaterThan(
      FACE_MOTION_POSE_SOURCES.length
    );

    for (const source of FACE_MOTION_ALL_SOURCES) {
      expect(source).toStartWith("/resume/face-motion/v13/");
      expect(source).toEndWith(".webp?rev=20260815a");
    }
  });
});

describe("V13 symmetric compass graph", () => {
  test("declares the same 8 center spokes and 8 adjacent ring edges as the reference", () => {
    expect(FACE_MOTION_CANONICAL_EDGES.map((edge) => [...edge])).toEqual(
      EXPECTED_EDGES
    );
    expect(
      new Set(
        FACE_MOTION_CANONICAL_EDGES.map(([from, to]) =>
          undirectedEdgeKey(from, to)
        )
      ).size
    ).toBe(16);

    expect(faceMotionNeighbors("center")).toEqual(EXPECTED_RING);
    for (const pose of EXPECTED_RING) {
      const neighbors = faceMotionNeighbors(pose);
      expect(neighbors).toHaveLength(3);
      expect(neighbors).toContain("center");
      for (const neighbor of neighbors) {
        expect(EXPECTED_EDGE_SET.has(undirectedEdgeKey(pose, neighbor))).toBe(
          true
        );
      }
    }
  });

  test("routes center spokes and adjacent ring motion directly", () => {
    for (const pose of EXPECTED_RING) {
      expect(shortestPosePath("center", pose)).toEqual(["center", pose]);
      expect(shortestPosePath(pose, "center")).toEqual([pose, "center"]);
    }

    for (let index = 0; index < EXPECTED_RING.length; index += 1) {
      const current = EXPECTED_RING[index];
      const next = EXPECTED_RING[(index + 1) % EXPECTED_RING.length];
      expect(shortestPosePath(current, next)).toEqual([current, next]);
      expect(shortestPosePath(next, current)).toEqual([next, current]);
    }
  });

  test("keeps every all-pairs path adjacent and exactly reverse-symmetric", () => {
    for (const from of EXPECTED_POSES) {
      for (const to of EXPECTED_POSES) {
        const path = shortestPosePath(from, to);
        const reversePath = shortestPosePath(to, from);

        expect(path[0]).toBe(from);
        expect(path.at(-1)).toBe(to);
        expect(reversePath).toEqual(path.toReversed());

        for (let index = 1; index < path.length; index += 1) {
          expect(
            EXPECTED_EDGE_SET.has(
              undirectedEdgeKey(path[index - 1], path[index])
            )
          ).toBe(true);
        }
      }
    }
  });

  test("reuses each canonical edge's intermediate frames in reverse order", () => {
    expect(edgeFrameKey("center", "top", 1, 3)).toBe("center_to_top_1");
    expect(edgeFrameKey("top", "center", 1, 3)).toBe("center_to_top_3");
    expect(edgeFrameKey("top", "center", 3, 3)).toBe("center_to_top_1");
    expect(edgeFrameKey("top-right", "right", 1, 3)).toBe(
      "topright_to_right_1"
    );
    expect(edgeFrameKey("right", "top-right", 1, 3)).toBe(
      "topright_to_right_3"
    );

    for (const [from, to] of EXPECTED_EDGES) {
      const forward = canonicalFaceMotionEdge(from, to);
      const reverse = canonicalFaceMotionEdge(to, from);
      expect(reverse.key).toBe(forward.key);
      expect(reverse.forward).toBe(false);
      expect(faceMotionEdgeSources(to, from)).toEqual(
        faceMotionEdgeSources(from, to).toReversed()
      );
    }
  });
});

describe("V13 latest-target state machine", () => {
  test("starts at the exact center and advances a direct edge one frame per tick", () => {
    const machine = new CompassFaceMachine({ intermediates: 3 });

    expect(machine.getPose()).toBe("center");
    expect(machine.getFrame()).toBe("center");
    expect(machine.getTarget()).toBe("center");
    expect(machine.isSettled()).toBe(true);

    machine.setTarget("top");
    expect([
      machine.advance(),
      machine.advance(),
      machine.advance(),
      machine.advance(),
    ]).toEqual([
      "center_to_top_1",
      "center_to_top_2",
      "center_to_top_3",
      "top",
    ]);
    expect(machine.isSettled()).toBe(true);
  });

  test("routes non-adjacent poses without snapping across the compass", () => {
    const machine = new CompassFaceMachine({
      initialPose: "left",
      intermediates: 1,
    });
    machine.setTarget("right");

    expect([
      machine.advance(),
      machine.advance(),
      machine.advance(),
      machine.advance(),
    ]).toEqual(["center_to_left_1", "center", "center_to_right_1", "right"]);
  });

  test("uses the newest target instead of building a stale input queue", () => {
    const machine = new CompassFaceMachine();

    machine.setTarget("right");
    machine.setTarget("left");
    machine.setTarget("bottom");
    machine.setTarget("top");

    expect(machine.getTarget()).toBe("top");
    expect(machine.advance()).toBe("top");
    expect(machine.getPose()).toBe("top");
    expect(machine.isSettled()).toBe(true);
  });

  test("reverses an early in-flight edge and still lands on the newest target", () => {
    const machine = new CompassFaceMachine({ intermediates: 3 });
    machine.setTarget("right");
    expect(machine.advance()).toBe("center_to_right_1");

    machine.setTarget("left");
    machine.setTarget("top");
    expect(machine.getTarget()).toBe("top");
    expect(machine.advance()).toBe("center");

    const frames = [];
    for (let guard = 0; guard < 20 && !machine.isSettled(); guard += 1) {
      frames.push(machine.advance());
    }

    expect(machine.isSettled()).toBe(true);
    expect(machine.getPose()).toBe("top");
    expect(machine.getFrame()).toBe("top");
    expect(frames.at(-1)).toBe("top");
    expect(frames).not.toContain("left");
  });

  test("supports the V13 build without inventing blended frames", () => {
    const machine = new CompassFaceMachine({
      intermediates: (from, to) => faceMotionEdgeSources(from, to).length,
    });

    machine.setTarget("bottom-right");
    const emitted = [];
    for (let guard = 0; guard < 20 && !machine.isSettled(); guard += 1) {
      emitted.push(machine.advance());
    }

    expect(machine.isSettled()).toBe(true);
    expect(emitted.at(-1)).toBe("bottom-right");
    for (const frame of emitted) {
      expect(faceMotionFrameSource(frame)).not.toBeNull();
    }
  });
});

describe("V13 single-image browser runtime", () => {
  test("renders exactly one replaceable image and no blended image stack", async () => {
    const componentSource = await readFile(
      new URL("../src/components/face-motion-portrait.tsx", import.meta.url),
      "utf-8"
    );
    const imageElements = componentSource.match(/<img\b/g) ?? [];

    expect(imageElements).toHaveLength(1);
    expect(componentSource).toMatch(/faceMotionFrameSource/);
    expect(componentSource).toMatch(/\.src\s*=/);
    expect(componentSource).not.toMatch(/cross\s*-?fade/i);
    expect(componentSource).not.toMatch(/transition-opacity/);
    expect(componentSource).not.toMatch(/mixBlendMode/);
    expect(componentSource).not.toMatch(/globalAlpha/);
  });

  test("tracks mouse input across the whole page using the live portrait rectangle", async () => {
    const componentSource = await readFile(
      new URL("../src/components/face-motion-portrait.tsx", import.meta.url),
      "utf-8"
    );

    expect(componentSource).toMatch(
      /(?:window|document)\.addEventListener\(\s*["']pointermove["']/
    );
    expect(componentSource).toMatch(/pointerType\s*!==?\s*["']mouse["']/);
    expect(componentSource).toMatch(/getBoundingClientRect\(\)/);
    expect(componentSource).toMatch(/poseFromClientPointer/);
    expect(componentSource).toMatch(
      /(?:window|document)\.addEventListener\(\s*["'](?:scroll|resize)["']/
    );
    expect(componentSource).toMatch(/passive:\s*true/);
  });

  test("preloads and decodes the finite random-access source set", async () => {
    const componentSource = await readFile(
      new URL("../src/components/face-motion-portrait.tsx", import.meta.url),
      "utf-8"
    );

    expect(componentSource).toMatch(/FACE_MOTION_ALL_SOURCES/);
    expect(componentSource).toMatch(/new (?:window\.)?Image\(\)/);
    expect(componentSource).toMatch(/\.decode\(\)/);
    expect(componentSource).toMatch(/FACE_MOTION_CONFIG\.frameIntervalMs/);
    expect(componentSource).toMatch(/CompassFaceMachine/);
  });

  test("contains no canvas, optical-flow, geometric warp, or old 2D-grid runtime", async () => {
    const [componentSource, librarySource] = await Promise.all([
      readFile(
        new URL("../src/components/face-motion-portrait.tsx", import.meta.url),
        "utf-8"
      ),
      readFile(new URL("../src/lib/face-motion.ts", import.meta.url), "utf-8"),
    ]);
    const runtimeSource = `${componentSource}\n${librarySource}`;

    expect(runtimeSource).not.toMatch(/<canvas\b/i);
    expect(runtimeSource).not.toMatch(/getContext\s*\(/);
    expect(runtimeSource).not.toMatch(/drawImage\s*\(/);
    expect(runtimeSource).not.toMatch(/createImageBitmap\s*\(/);
    expect(runtimeSource).not.toMatch(/imageSmoothing/);
    expect(runtimeSource).not.toMatch(/optical\s*-?flow/i);
    expect(runtimeSource).not.toMatch(/\.style\.transform\s*=/);
    expect(runtimeSource).not.toMatch(/translate3d\s*\(/);
    expect(runtimeSource).not.toMatch(/scale3d\s*\(/);
    expect(runtimeSource).not.toMatch(/smoothDamp/);
    expect(runtimeSource).not.toMatch(/quantizeWithHysteresis/);
    expect(runtimeSource).not.toMatch(/pitchCount|yawCount/);
  });
});
