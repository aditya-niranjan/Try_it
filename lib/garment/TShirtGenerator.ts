/**
 * TShirtGenerator — procedural parametric T-shirt BufferGeometry with articulated sleeves.
 *
 * Responsibilities:
 *   - Generates decoupled components for hierarchical 3D body rigging:
 *       1. Torso body mesh with scooped neckline and armhole openings
 *       2. Left sleeve mesh hinged at left shoulder joint (0, 0, 0)
 *       3. Right sleeve mesh hinged at right shoulder joint (0, 0, 0)
 *   - Clean normals and UV coordinates for realistic fabric rendering
 *   - Double-sided volume suitable for real-time arm articulation and cloth simulation
 */

import {
  BufferGeometry,
  Float32BufferAttribute,
  Vector3,
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

export interface TShirtGeometries {
  torso: BufferGeometry;
  leftSleeve: BufferGeometry;
  rightSleeve: BufferGeometry;
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
   * Generates articulated components: torso and two independent sleeve geometries.
   */
  generate(userParams?: TShirtParams): TShirtGeometries {
    const params: Required<TShirtParams> = { ...DEFAULT_PARAMS, ...userParams };

    const torso = this.generateTorso(params);
    const leftSleeve = this.generateSleeve(true, params);
    const rightSleeve = this.generateSleeve(false, params);

    return { torso, leftSleeve, rightSleeve };
  }

  /**
   * Generates the torso body geometry with armhole openings and scooped neckline.
   */
  generateTorso(params: Required<TShirtParams>): BufferGeometry {
    const {
      chestWidth,
      length,
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

    const addQuad = (i1: number, i2: number, i3: number, i4: number) => {
      indices.push(i1, i2, i4);
      indices.push(i2, i3, i4);
    };

    const numRingSegments = subdivisionsX * 2;
    const numRings = subdivisionsY + 1;

    for (let r = 0; r < numRings; r++) {
      const vT = r / subdivisionsY;
      const curY = hemY + vT * (shoulderY - hemY);

      // Slight waist taper and natural curvature
      const waistFactor = 1.0 - 0.08 * Math.sin(vT * Math.PI);
      const ringW = halfW * waistFactor;
      const ringD = halfD * (0.9 + 0.15 * Math.sin(vT * Math.PI));

      for (let s = 0; s < numRingSegments; s++) {
        const angle = (s / numRingSegments) * Math.PI * 2;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        const x = ringW * cosA;
        let z = ringD * sinA;

        // Front chest subtle outward dome (+Z)
        if (sinA > 0 && vT > 0.4 && vT < 0.9) {
          z += 0.04 * Math.sin(angle) * Math.sin(((vT - 0.4) / 0.5) * Math.PI);
        }

        // Scoop neck cut at the front collar
        let y = curY;
        if (vT > 0.85 && sinA > 0.35 && Math.abs(x) < neckWidth) {
          const neckFactor = (1.0 - Math.abs(x) / neckWidth) * ((vT - 0.85) / 0.15);
          y -= neckDepth * neckFactor * 0.75;
        }

        positions.push(x, y, z);
        normals.push(cosA, 0.1, sinA);

        uvs.push(s / numRingSegments, vT);
      }
    }

    // Connect rings, leaving side armholes for articulated sleeves
    for (let r = 0; r < numRings - 1; r++) {
      const ring1 = r * numRingSegments;
      const ring2 = (r + 1) * numRingSegments;

      for (let s = 0; s < numRingSegments; s++) {
        const nextS = (s + 1) % numRingSegments;

        const vT = r / subdivisionsY;
        const curY = hemY + vT * (shoulderY - hemY);
        const isArmholeLevel = curY > armholeBottomY;
        const angle = (s / numRingSegments) * Math.PI * 2;

        const isRightArmhole = isArmholeLevel && (angle < Math.PI * 0.16 || angle > Math.PI * 1.84);
        const isLeftArmhole = isArmholeLevel && Math.abs(angle - Math.PI) < Math.PI * 0.16;

        if (isRightArmhole || isLeftArmhole) {
          continue; // Armhole opening
        }

        addQuad(ring1 + s, ring1 + nextS, ring2 + nextS, ring2 + s);
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Generates a sleeve tube whose local origin (0, 0, 0) is at the shoulder joint.
   *
   * The sleeve extends along its neutral axis (angled ~35° down from horizontal).
   * In SceneManager, the sleeve is attached to a shoulder pivot group so rotating
   * the pivot naturally articulates the sleeve in 3D.
   */
  generateSleeve(isLeft: boolean, params: Required<TShirtParams>): BufferGeometry {
    const { sleeveLength, sleeveRadius } = params;

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const subdivisionsLen = 8;
    const subdivisionsRad = 12;
    const dirX = isLeft ? -1 : 1;

    // Neutral hang angle: 35 degrees down from horizontal
    const angleDown = 0.60;
    const cosDown = Math.cos(angleDown);
    const sinDown = Math.sin(angleDown);

    for (let l = 0; l <= subdivisionsLen; l++) {
      const t = l / subdivisionsLen;
      const segDist = t * sleeveLength;

      // Center of ring along sleeve axis (origin at shoulder joint 0, 0, 0)
      const cx = dirX * segDist * cosDown;
      const cy = -segDist * sinDown;
      const cz = 0;

      // Top of sleeve starts slightly wider to overlap with torso armhole seam
      const curR = sleeveRadius * (1.08 - t * 0.15);

      for (let r = 0; r < subdivisionsRad; r++) {
        const theta = (r / subdivisionsRad) * Math.PI * 2;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        // Ring vertices perpendicular to sleeve axis
        const vx = cx + cosT * curR * sinDown * dirX;
        const vy = cy + cosT * curR * cosDown;
        const vz = cz + sinT * curR;

        positions.push(vx, vy, vz);
        normals.push(cosT * sinDown * dirX, cosT * cosDown, sinT);
        uvs.push(r / subdivisionsRad, t);
      }
    }

    // Connect rings with quads
    for (let l = 0; l < subdivisionsLen; l++) {
      const r1 = l * subdivisionsRad;
      const r2 = (l + 1) * subdivisionsRad;

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

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Neutral direction vector of the sleeve in local torso space.
   */
  getNeutralSleeveDirection(isLeft: boolean): Vector3 {
    const dirX = isLeft ? -1 : 1;
    const angleDown = 0.60;
    return new Vector3(dirX * Math.cos(angleDown), -Math.sin(angleDown), 0).normalize();
  }
}
