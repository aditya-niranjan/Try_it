/**
 * SkeletonRenderer — draws the 33-landmark skeleton overlay on a 2D canvas.
 *
 * Responsibilities:
 *   - Draw landmark dots (color-coded by body region and confidence)
 *   - Draw connection lines between landmarks (MediaPipe POSE_CONNECTIONS topology)
 *   - Handle mirrored drawing for selfie view
 */

import type { NormalizedLandmark } from './OneEuroFilter';

/**
 * MediaPipe Pose landmark connections (pairs of landmark indices).
 * Based on the official POSE_CONNECTIONS topology.
 */
const POSE_CONNECTIONS: [number, number][] = [
  // Face
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10],
  // Torso
  [11, 12], // shoulders
  [11, 23], [12, 24], // shoulder to hip
  [23, 24], // hips
  // Left arm
  [11, 13], [13, 15],
  // Right arm
  [12, 14], [14, 16],
  // Left hand (simplified)
  [15, 17], [15, 19], [15, 21], [17, 19],
  // Right hand (simplified)
  [16, 18], [16, 20], [16, 22], [18, 20],
  // Left leg
  [23, 25], [25, 27],
  // Right leg
  [24, 26], [26, 28],
  // Left foot
  [27, 29], [27, 31], [29, 31],
  // Right foot
  [28, 30], [28, 32], [30, 32],
];

/** Landmark groups for color coding. */
interface LandmarkStyle {
  color: string;
  radius: number;
}

function getLandmarkStyle(index: number, visibility: number): LandmarkStyle {
  // Low confidence → dim
  const alpha = visibility > 0.65 ? 0.9 : visibility > 0.4 ? 0.5 : 0.2;

  if (index <= 10) {
    // Face landmarks — small, light blue
    return {
      color: `rgba(147, 197, 253, ${alpha})`, // blue-300
      radius: 3,
    };
  } else if (index <= 22) {
    // Upper body — medium, emerald
    return {
      color: `rgba(110, 231, 183, ${alpha})`, // emerald-300
      radius: 5,
    };
  } else {
    // Lower body — medium, violet
    return {
      color: `rgba(196, 181, 253, ${alpha})`, // violet-300
      radius: 4,
    };
  }
}

function getConnectionColor(
  idxA: number,
  idxB: number,
  visA: number,
  visB: number
): string {
  const minVis = Math.min(visA, visB);
  const alpha = minVis > 0.65 ? 0.6 : minVis > 0.4 ? 0.3 : 0.1;

  // Color by region of the first index
  const region = Math.min(idxA, idxB);
  if (region <= 10) return `rgba(147, 197, 253, ${alpha})`; // face - blue
  if (region <= 22) return `rgba(110, 231, 183, ${alpha})`; // upper - emerald
  return `rgba(196, 181, 253, ${alpha})`; // lower - violet
}

export interface DrawBounds {
  width: number;
  height: number;
  offsetX?: number;
  offsetY?: number;
  drawW?: number;
  drawH?: number;
  mirrored?: boolean;
}

export class SkeletonRenderer {
  /**
   * Draw the full skeleton on the given 2D canvas context.
   *
   * @param ctx — 2D rendering context (already in CSS pixel coordinate space)
   * @param landmarks — array of 33 normalized landmarks ([0,1] range)
   * @param bounds — viewport dimensions and optional video letterboxing/crop offsets
   */
  static drawSkeleton(
    ctx: CanvasRenderingContext2D,
    landmarks: NormalizedLandmark[],
    bounds: DrawBounds
  ): void {
    if (!landmarks || landmarks.length < 33) return;

    const {
      width,
      height,
      offsetX = 0,
      offsetY = 0,
      drawW = width,
      drawH = height,
      mirrored = true,
    } = bounds;

    // Convert normalized coords to pixel coords, accounting for aspect ratio and mirroring
    const toPixel = (
      lm: NormalizedLandmark
    ): { x: number; y: number; vis: number } => {
      let px = offsetX + lm.x * drawW;
      const py = offsetY + lm.y * drawH;

      // If mirrored, flip the x coordinate relative to canvas width
      if (mirrored) {
        px = width - px;
      }

      return { x: px, y: py, vis: lm.visibility ?? 0 };
    };

    const pixelLandmarks = landmarks.map(toPixel);

    // Draw connections first (behind dots)
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const [idxA, idxB] of POSE_CONNECTIONS) {
      const a = pixelLandmarks[idxA];
      const b = pixelLandmarks[idxB];

      if (!a || !b) continue;
      // Skip if both have very low visibility
      if (a.vis < 0.2 && b.vis < 0.2) continue;

      ctx.strokeStyle = getConnectionColor(idxA, idxB, a.vis, b.vis);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Draw landmark dots on top
    for (let i = 0; i < pixelLandmarks.length; i++) {
      const pt = pixelLandmarks[i];
      if (pt.vis < 0.2) continue; // Skip very low confidence

      const style = getLandmarkStyle(i, pt.vis);

      ctx.fillStyle = style.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, style.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw torso quad for debugging (semi-transparent)
    const ls = pixelLandmarks[11]; // left shoulder
    const rs = pixelLandmarks[12]; // right shoulder
    const lh = pixelLandmarks[23]; // left hip
    const rh = pixelLandmarks[24]; // right hip

    if (ls && rs && lh && rh) {
      const torsoVis = Math.min(ls.vis, rs.vis, lh.vis, rh.vis);
      if (torsoVis > 0.4) {
        ctx.fillStyle = `rgba(139, 92, 246, ${torsoVis * 0.08})`;
        ctx.beginPath();
        ctx.moveTo(ls.x, ls.y);
        ctx.lineTo(rs.x, rs.y);
        ctx.lineTo(rh.x, rh.y);
        ctx.lineTo(lh.x, lh.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
}
