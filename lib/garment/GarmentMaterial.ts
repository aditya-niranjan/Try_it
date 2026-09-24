/**
 * GarmentMaterial — creates and manages materials for 3D garments.
 *
 * Responsibilities:
 *   - Three.js MeshStandardMaterial with physically-based cloth properties
 *   - Procedural fabric weave texture (cotton micro-pattern) generated via Canvas
 *   - Configurable color, roughness, metalness, and opacity
 *   - Double-sided rendering so collars and sleeves look solid from all angles
 */

import {
  MeshStandardMaterial,
  CanvasTexture,
  RepeatWrapping,
  DoubleSide,
  Color,
} from 'three';

export interface GarmentMaterialParams {
  /** Hex color code or CSS color string (e.g. '#2563eb', '#1e293b'). */
  color?: string;
  /** Surface roughness (0 = mirror, 1 = diffuse cloth; default 0.75). */
  roughness?: number;
  /** Metallic sheen factor (default 0.04). */
  metalness?: number;
  /** Opacity for subtle translucent fabrics (default 1.0). */
  opacity?: number;
  /** Whether to apply a procedural cotton fabric micro-weave texture (default true). */
  useProceduralTexture?: boolean;
}

const DEFAULT_PARAMS: Required<GarmentMaterialParams> = {
  color: '#2563eb', // Modern cobalt / royal blue
  roughness: 0.78,  // Soft matte fabric
  metalness: 0.05,
  opacity: 1.0,
  useProceduralTexture: true,
};

/**
 * Creates a subtle procedural fabric weave texture on a 64x64 canvas.
 * This gives realistic tactile depth to the cloth without external asset downloads.
 */
function createFabricWeaveTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Base neutral grey
  ctx.fillStyle = '#e5e7eb';
  ctx.fillRect(0, 0, 64, 64);

  // Micro-weave diagonal cross-hatch pattern
  ctx.lineWidth = 1;
  for (let i = -64; i < 128; i += 4) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 64, 64);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.beginPath();
    ctx.moveTo(i, 64);
    ctx.lineTo(i + 64, 0);
    ctx.stroke();
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(16, 16);
  return texture;
}

// Cached procedural texture instance
let cachedFabricTexture: CanvasTexture | null = null;

export function createGarmentMaterial(
  userParams?: GarmentMaterialParams
): MeshStandardMaterial {
  const params: Required<GarmentMaterialParams> = { ...DEFAULT_PARAMS, ...userParams };

  if (params.useProceduralTexture && !cachedFabricTexture) {
    cachedFabricTexture = createFabricWeaveTexture();
  }

  const material = new MeshStandardMaterial({
    color: new Color(params.color),
    roughness: params.roughness,
    metalness: params.metalness,
    transparent: params.opacity < 1.0,
    opacity: params.opacity,
    side: DoubleSide,
    map: params.useProceduralTexture ? cachedFabricTexture : null,
  });

  return material;
}

/**
 * Updates an existing garment material's color or physical parameters.
 */
export function updateGarmentMaterial(
  material: MeshStandardMaterial,
  params: Partial<GarmentMaterialParams>
): void {
  if (params.color !== undefined) {
    material.color.set(params.color);
  }
  if (params.roughness !== undefined) {
    material.roughness = params.roughness;
  }
  if (params.metalness !== undefined) {
    material.metalness = params.metalness;
  }
  if (params.opacity !== undefined) {
    material.opacity = params.opacity;
    material.transparent = params.opacity < 1.0;
  }
  material.needsUpdate = true;
}
