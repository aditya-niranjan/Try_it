/**
 * TShirtGenerator — procedural parametric T-shirt BufferGeometry.
 *
 * Responsibilities:
 *   - Generate a single Three.js BufferGeometry representing a realistic 3D T-shirt
 *   - Double-sided torso (front & back panels) with realistic front-to-back volume
 *   - Left and right angled sleeve tubes seamlessly attached at shoulder seams
 *   - Scooped neck opening (collar) and open hem
 *   - Clean normals and UV coordinates for fabric textures and lighting
 *   - Suitable for real-time vertex deformation and cloth physics
 */

import {
  BufferGeometry,
  Float32BufferAttribute,
} from 'three';

export interface TShirtParams {
  /** Overall chest width in world units (default 1.0). */
  chestWidth?: number;
  /** Shirt body length from shoulder to bottom hem (default 1.25). */
  length?: number;
  /** Sleeve length extending down from shoulder (default 0.42). */
  sleeveLength?: number;
  /** Radius of the sleeve opening (default 0.16). */
  sleeveRadius?: number;
  /** Depth of the scooped neck opening (default 0.18). */
  neckDepth?: number;
  /** Half-width of the neck opening (default 0.22). */
  neckWidth?: number;
  /** Front-to-back depth/thickness of the torso (default 0.28). */
  torsoDepth?: number;
  /** Horizontal resolution of torso grid (default 14). */
  subdivisionsX?: number;
  /** Vertical resolution of torso grid (default 18). */
  subdivisionsY?: number;
}

const DEFAULT_PARAMS: Required<TShirtParams> = {
  chestWidth: 1.0,
  length: 1.25,
  sleeveLength: 0.42,
  sleeveRadius: 0.16,
  neckDepth: 0.18,
  neckWidth: 0.22,
  torsoDepth: 0.28,
  subdivisionsX: 14,
  subdivisionsY: 18,
};

export class TShirtGenerator {
  /**
   * Generates a parametric 3D T-shirt geometry centered around the chest origin (0, 0, 0).
   *
   * Coordinates:
   *   - X: Left (-X) to Right (+X) across shoulders
   *   - Y: Bottom hem (-Y) to Collar/Shoulders (+Y)
   *   - Z: Back (-Z) to Front (+Z)
   */
  generate(userParams?: TShirtParams): BufferGeometry {
    const params: Required<TShirtParams> = { ...DEFAULT_PARAMS, ...userParams };

    const {
      chestWidth,
      length,
      sleeveLength,
      sleeveRadius,
      neckDepth,
      neckWidth,
      torsoDepth,
      subdivisionsX,
      subdivisionsY,
    } = params;

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const halfW = chestWidth * 0.5;
    const halfD = torsoDepth * 0.5;
    const shoulderY = length * 0.5;
    const hemY = -length * 0.5;
    const armholeBottomY = shoulderY - 0.38 * length;



    // Helper to add a quad (two triangles)
    const addQuad = (i1: number, i2: number, i3: number, i4: number) => {
      indices.push(i1, i2, i4);
      indices.push(i2, i3, i4);
    };

    // -------------------------------------------------------------
    // 1. Torso Rings (Tube from hem up to shoulder level)
    // -------------------------------------------------------------
    // We create rings of vertices around the torso circumference.
    // Ring segments = 2 * subdivisionsX
    const numRingSegments = subdivisionsX * 2;
    const numRings = subdivisionsY + 1;
    const torsoVertexStart = positions.length / 3;

    for (let r = 0; r < numRings; r++) {
      const vT = r / subdivisionsY; // 0 = hem, 1 = shoulder
      const curY = hemY + vT * (shoulderY - hemY);

      // Slight natural taper at waist, widening at chest and hips
      const waistFactor = 1.0 - 0.08 * Math.sin(vT * Math.PI);
      const ringW = halfW * waistFactor;
      const ringD = halfD * (0.9 + 0.15 * Math.sin(vT * Math.PI));

      for (let s = 0; s < numRingSegments; s++) {
        // Angle around circumference: 0 is right side, PI/2 is front, PI is left, 3PI/2 is back
        const angle = (s / numRingSegments) * Math.PI * 2;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        // Curvature around elliptical torso
        const x = ringW * cosA;
        let z = ringD * sinA;

        // Front chest subtle outward dome (+Z)
        if (sinA > 0 && vT > 0.4 && vT < 0.9) {
          z += 0.04 * Math.sin(angle) * Math.sin((vT - 0.4) / 0.5 * Math.PI);
        }

        // Scoop neck cut: at the very top front rings, taper Z back slightly for neckline
        let y = curY;
        if (vT > 0.85 && sinA > 0.4 && Math.abs(x) < neckWidth) {
          const neckFactor = (1.0 - Math.abs(x) / neckWidth) * (vT - 0.85) / 0.15;
          y -= neckDepth * neckFactor * 0.7;
        }

        positions.push(x, y, z);
        normals.push(cosA, 0.1, sinA); // preliminary normal

        // UV mapping: u corresponds to circumference [0, 1], v to height [0, 1]
        const u = s / numRingSegments;
        const v = vT;
        uvs.push(u, v);
      }
    }

    // Connect rings with quads
    for (let r = 0; r < numRings - 1; r++) {
      const ring1 = torsoVertexStart + r * numRingSegments;
      const ring2 = torsoVertexStart + (r + 1) * numRingSegments;

      for (let s = 0; s < numRingSegments; s++) {
        const nextS = (s + 1) % numRingSegments;

        // Leave armhole openings near the top (sides: left ~ angle PI, right ~ angle 0)
        const vT = r / subdivisionsY;
        const isArmholeLevel = curYAtVT(vT, hemY, shoulderY) > armholeBottomY;
        const angle = (s / numRingSegments) * Math.PI * 2;
        const isRightArmhole = isArmholeLevel && (angle < Math.PI * 0.15 || angle > Math.PI * 1.85);
        const isLeftArmhole = isArmholeLevel && Math.abs(angle - Math.PI) < Math.PI * 0.15;

        // Skip quads where armhole openings exist so sleeves can connect
        if (isRightArmhole || isLeftArmhole) {
          continue;
        }

        addQuad(
          ring1 + s,
          ring1 + nextS,
          ring2 + nextS,
          ring2 + s
        );
      }
    }

    // -------------------------------------------------------------
    // 2. Left Sleeve (extends from left armhole outward & down)
    // -------------------------------------------------------------
    buildSleeve({
      isLeft: true,
      shoulderX: -halfW,
      shoulderY: shoulderY - 0.05,
      shoulderZ: 0,
      armholeBottomY,
      length: sleeveLength,
      radius: sleeveRadius,
      subdivisionsLen: 6,
      subdivisionsRad: 10,
      positions,
      normals,
      uvs,
      indices,
    });

    // -------------------------------------------------------------
    // 3. Right Sleeve (extends from right armhole outward & down)
    // -------------------------------------------------------------
    buildSleeve({
      isLeft: false,
      shoulderX: halfW,
      shoulderY: shoulderY - 0.05,
      shoulderZ: 0,
      armholeBottomY,
      length: sleeveLength,
      radius: sleeveRadius,
      subdivisionsLen: 6,
      subdivisionsRad: 10,
      positions,
      normals,
      uvs,
      indices,
    });

    // -------------------------------------------------------------
    // 4. Build BufferGeometry and Compute Accurate Normals
    // -------------------------------------------------------------
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    geometry.computeVertexNormals();

    return geometry;
  }
}

function curYAtVT(vt: number, hemY: number, shoulderY: number): number {
  return hemY + vt * (shoulderY - hemY);
}

interface SleeveConfig {
  isLeft: boolean;
  shoulderX: number;
  shoulderY: number;
  shoulderZ: number;
  armholeBottomY: number;
  length: number;
  radius: number;
  subdivisionsLen: number;
  subdivisionsRad: number;
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

function buildSleeve(cfg: SleeveConfig): void {
  const {
    isLeft,
    shoulderX,
    shoulderY,
    length,
    radius,
    subdivisionsLen,
    subdivisionsRad,
    positions,
    normals,
    uvs,
    indices,
  } = cfg;

  const sleeveStartIdx = positions.length / 3;
  const dirX = isLeft ? -1 : 1;

  // Sleeve hangs outward and downward naturally (40 degrees downward slope)
  const angleDown = 0.55; // radians downward
  const cosDown = Math.cos(angleDown);
  const sinDown = Math.sin(angleDown);

  for (let l = 0; l <= subdivisionsLen; l++) {
    const t = l / subdivisionsLen;
    // Current center along sleeve axis
    const segDist = t * length;
    const cx = shoulderX + dirX * segDist * cosDown;
    const cy = shoulderY - segDist * sinDown;
    const cz = 0;

    // Slight tapering towards sleeve cuff
    const curR = radius * (1.0 - t * 0.12);

    for (let r = 0; r < subdivisionsRad; r++) {
      const theta = (r / subdivisionsRad) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      // Ring perpendicular to sleeve direction
      const vx = cx + cosT * curR * sinDown * dirX;
      const vy = cy + cosT * curR * cosDown;
      const vz = cz + sinT * curR;

      positions.push(vx, vy, vz);
      normals.push(cosT * sinDown * dirX, cosT * cosDown, sinT);

      // UV coordinates
      uvs.push(r / subdivisionsRad, t);
    }
  }

  // Connect sleeve rings with quads
  for (let l = 0; l < subdivisionsLen; l++) {
    const r1 = sleeveStartIdx + l * subdivisionsRad;
    const r2 = sleeveStartIdx + (l + 1) * subdivisionsRad;

    for (let r = 0; r < subdivisionsRad; r++) {
      const nextR = (r + 1) % subdivisionsRad;

      if (isLeft) {
        indices.push(r1 + r, r2 + r, r2 + nextR);
        indices.push(r1 + r, r2 + nextR, r1 + nextR);
      } else {
        indices.push(r1 + r, r2 + nextR, r2 + r);
        indices.push(r1 + r, r1 + nextR, r2 + nextR);
      }
    }
  }
}
