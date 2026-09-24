/**
 * TShirtGenerator — procedural parametric T-shirt mesh.
 *
 * Responsibilities:
 *   - Generate a single BufferGeometry with front/back panels, sleeve tubes, collar ring
 *   - Parameterized by chest width, length, sleeve length, neck depth
 *   - Weldable seams for cloth simulation
 */

import type { BufferGeometry } from 'three';

export interface TShirtParams {
  chestWidth?: number;
  length?: number;
  sleeveLength?: number;
  neckDepth?: number;
}

export class TShirtGenerator {
  /**
   * Generate a parametric T-shirt mesh.
   * TODO: Build front/back grid panels + sleeve tubes + collar ring as BufferGeometry.
   */
  generate(_params?: TShirtParams): BufferGeometry {
    // TODO: implement in P3
    throw new Error('TShirtGenerator.generate() not implemented');
  }
}
