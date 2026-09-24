/**
 * GarmentMaterial — creates the material for the garment mesh.
 *
 * Responsibilities:
 *   - Build a MeshStandardMaterial with configurable color, texture (canvas UV map),
 *     roughness, and metalness
 *   - Support runtime color/texture updates from the UI panel
 */

import type { MeshStandardMaterial } from 'three';

export interface GarmentMaterialParams {
  color?: string;
  textureUrl?: string;
  roughness?: number;
  metalness?: number;
}

/**
 * Create a garment material with the given parameters.
 * TODO: Build MeshStandardMaterial, handle texture loading for UV map.
 */
export function createGarmentMaterial(
  _params?: GarmentMaterialParams
): MeshStandardMaterial {
  // TODO: implement in P3
  throw new Error('createGarmentMaterial() not implemented');
}
