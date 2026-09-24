/**
 * TShirtGenerator — procedural parametric 3D T-shirt BufferGeometry.
 *
 * PROPORTIONAL NORMALIZED COORDINATES:
 *   - Shoulders: Left at x = -0.5, Right at x = +0.5 (Base span = 1.0)
 *   - Shoulder level: y = 0.0
 *   - Bottom hem: y = -1.25
 *   - Front-to-back depth: z in [-0.14, +0.14] (Thickness = 0.28)
 *   - Origin (0, 0, 0) is at the collar / shoulder center line
 *
 * This allows SceneManager to scale uniformly by shoulderSpan:
 *   scale = actualShoulderDistanceInWorld
 * which guarantees the 3D shirt is ALWAYS 100% proportional to the user's body!
 */

import {
  BufferGeometry,
  Float32BufferAttribute,
  Vector3,
} from 'three';

export interface TShirtParams {
  /** Relative chest width factor (default 1.0). */
  chestWidth?: number;
  /** Relative shirt length factor (default 1.25). */
  length?: number;
  /** Relative sleeve length factor (default 0.38). */
  sleeveLength?: number;
  /** Sleeve opening radius (default 0.14). */
  sleeveRadius?: number;
  /** Scooped neck depth (default 0.15). */
  neckDepth?: number;
  /** Neck opening half-width (default 0.20). */
  neckWidth?: number;
  /** Torso front-to-back depth (default 0.28). */
  torsoDepth?: number;
}

export interface TShirtGeometries {
  torso: BufferGeometry;
  leftSleeve: BufferGeometry;
  rightSleeve: BufferGeometry;
}

const DEFAULT_PARAMS: Required<TShirtParams> = {
  chestWidth: 1.0,
  length: 1.25,
  sleeveLength: 0.38,
  sleeveRadius: 0.14,
  neckDepth: 0.15,
  neckWidth: 0.20,
  torsoDepth: 0.28,
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
   * Generates the torso body geometry with armholes and scooped neckline.
   * Origin (0, 0, 0) is at the shoulder center line.
   * Top of shoulders at y = 0.0, bottom hem at y = -length (-1.25).
   */
  generateTorso(params: Required<TShirtParams>): BufferGeometry {
    const {
      chestWidth,
      length,
      neckDepth,
      neckWidth,
      torsoDepth,
    } = params;

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const halfW = chestWidth * 0.5;
    const halfD = torsoDepth * 0.5;
    const topY = 0.0;
    const hemY = -length;
    const armholeBottomY = -0.36 * length;

    const subdivisionsX = 14;
    const subdivisionsY = 18;
    const numRingSegments = subdivisionsX * 2;
    const numRings = subdivisionsY + 1;

    const addQuad = (i1: number, i2: number, i3: number, i4: number) => {
      indices.push(i1, i2, i4);
      indices.push(i2, i3, i4);
    };

    // 1. Generate rings of vertices from hem (y = -length) up to shoulders (y = 0)
    for (let r = 0; r < numRings; r++) {
      const vT = r / subdivisionsY; // 0 = hem, 1 = shoulders
      const curY = hemY + vT * (topY - hemY);

      // Subtle anatomical taper at waist, widening at chest
      const waistFactor = 1.0 - 0.07 * Math.sin(vT * Math.PI);
      const ringW = halfW * waistFactor;
      const ringD = halfD * (0.88 + 0.18 * Math.sin(vT * Math.PI));

      for (let s = 0; s < numRingSegments; s++) {
        // Angle: 0 is Right, PI/2 is Front (+Z), PI is Left, 3PI/2 is Back (-Z)
        const angle = (s / numRingSegments) * Math.PI * 2;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        const x = ringW * cosA;
        let z = ringD * sinA;

        // Front chest dome (+Z)
        if (sinA > 0 && vT > 0.45 && vT < 0.9) {
          z += 0.035 * Math.sin(angle) * Math.sin(((vT - 0.45) / 0.45) * Math.PI);
        }

        // Scoop neck cut at front collar
        let y = curY;
        if (vT > 0.82 && sinA > 0.3 && Math.abs(x) < neckWidth) {
          const neckFactor = (1.0 - Math.abs(x) / neckWidth) * ((vT - 0.82) / 0.18);
          y -= neckDepth * neckFactor;
        }

        positions.push(x, y, z);
        normals.push(cosA, 0.1, sinA);
        uvs.push(s / numRingSegments, vT);
      }
    }

    // 2. Connect rings with quads, leaving side armhole openings
    for (let r = 0; r < numRings - 1; r++) {
      const ring1 = r * numRingSegments;
      const ring2 = (r + 1) * numRingSegments;

      for (let s = 0; s < numRingSegments; s++) {
        const nextS = (s + 1) % numRingSegments;

        const vT = r / subdivisionsY;
        const curY = hemY + vT * (topY - hemY);
        const isArmholeLevel = curY > armholeBottomY;
        const angle = (s / numRingSegments) * Math.PI * 2;

        const isRightArmhole = isArmholeLevel && (angle < Math.PI * 0.15 || angle > Math.PI * 1.85);
        const isLeftArmhole = isArmholeLevel && Math.abs(angle - Math.PI) < Math.PI * 0.15;

        // Skip quads where armholes open into sleeves
        if (isRightArmhole || isLeftArmhole) {
          continue;
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
   * Extends outward and downward along its neutral axis.
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

      // Top of sleeve starts slightly wider to overlap cleanly with torso armhole seam
      const curR = sleeveRadius * (1.06 - t * 0.12);

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
