/**
 * SceneManager — manages the Three.js 3D scene, camera, lights, and parametric garment.
 *
 * Responsibilities:
 *   - Transparent WebGLRenderer layered directly over the video canvas
 *   - PerspectiveCamera calibrated to standard webcam field of view
 *   - Studio 3-point lighting setup for realistic fabric rendering
 *   - Real-time 3D Torso Rig anchoring:
 *       - Tracks 3D position of chest center
 *       - Scales shirt with shoulder span and torso height
 *       - Computes 3D orientation quaternion from shoulder & spine vectors (yaw, pitch, roll)
 *   - Smooth interpolation (lerp/slerp) for jitter-free garment motion
 *   - Dynamic garment parameter updates (color, size, sleeve length)
 */

import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  AmbientLight,
  DirectionalLight,
  Group,
  Mesh,
  Vector3,
  Matrix4,
  Quaternion,
  SRGBColorSpace,
} from 'three';
import { TShirtGenerator, type TShirtParams } from '../garment/TShirtGenerator';
import {
  createGarmentMaterial,
  updateGarmentMaterial,
  type GarmentMaterialParams,
} from '../garment/GarmentMaterial';
import type { NormalizedLandmark } from '../tracking/OneEuroFilter';

export interface TorsoDrawInfo {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  drawW: number;
  drawH: number;
  mirrored?: boolean;
}

export class SceneManager {
  private scene: Scene | null = null;
  private camera: PerspectiveCamera | null = null;
  private renderer: WebGLRenderer | null = null;
  private garmentGroup: Group | null = null;
  private tshirtMesh: Mesh | null = null;
  private tshirtGenerator: TShirtGenerator = new TShirtGenerator();

  private currentGarmentParams: TShirtParams = {
    chestWidth: 1.0,
    length: 1.25,
    sleeveLength: 0.42,
  };
  private currentMaterialParams: GarmentMaterialParams = {
    color: '#2563eb',
    roughness: 0.78,
    metalness: 0.05,
  };

  // Target and smoothed transformation states
  private targetPosition = new Vector3();
  private targetScale = new Vector3(1, 1, 1);
  private targetQuaternion = new Quaternion();

  private smoothedPosition = new Vector3();
  private smoothedScale = new Vector3(1, 1, 1);
  private smoothedQuaternion = new Quaternion();

  private isPoseVisible = false;
  private hasFirstPose = false;

  /** Camera parameters. */
  private readonly cameraFov = 50; // degrees vertical FOV
  private readonly cameraZ = 3.0;  // camera placed at z = 3

  /**
   * Initialize Three.js scene, renderer, camera, and lighting.
   */
  init(canvas: HTMLCanvasElement): void {
    // 1. Scene
    this.scene = new Scene();
    this.scene.background = null; // transparent to show video beneath

    // 2. Camera
    const aspect = canvas.clientWidth / (canvas.clientHeight || 1);
    this.camera = new PerspectiveCamera(this.cameraFov, aspect, 0.1, 100);
    this.camera.position.set(0, 0, this.cameraZ);
    this.camera.lookAt(0, 0, 0);

    // 3. Renderer
    this.renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    // 4. Lighting Setup (Studio 3-Point Lighting)
    // Ambient light: soft neutral base illumination
    const ambientLight = new AmbientLight(0xffffff, 1.2);
    this.scene.add(ambientLight);

    // Key light: warm directional light from upper right
    const keyLight = new DirectionalLight(0xfffaed, 1.6);
    keyLight.position.set(2.5, 4.0, 3.5);
    this.scene.add(keyLight);

    // Fill light: soft cool directional light from upper left
    const fillLight = new DirectionalLight(0xedf2ff, 0.8);
    fillLight.position.set(-2.5, 2.0, 2.5);
    this.scene.add(fillLight);

    // Rim/Back light: highlights edges and cloth contours
    const rimLight = new DirectionalLight(0xffffff, 0.5);
    rimLight.position.set(0, -2.0, -2.0);
    this.scene.add(rimLight);

    // 5. Garment Group & Mesh
    this.garmentGroup = new Group();
    this.garmentGroup.visible = false;
    this.scene.add(this.garmentGroup);

    this.rebuildGarmentMesh();
  }

  /**
   * Rebuilds the 3D T-shirt mesh using current parameters.
   */
  private rebuildGarmentMesh(): void {
    if (!this.garmentGroup) return;

    // Dispose old mesh geometry and material
    if (this.tshirtMesh) {
      this.tshirtMesh.geometry.dispose();
      this.garmentGroup.remove(this.tshirtMesh);
      this.tshirtMesh = null;
    }

    const geometry = this.tshirtGenerator.generate(this.currentGarmentParams);
    const material = createGarmentMaterial(this.currentMaterialParams);

    this.tshirtMesh = new Mesh(geometry, material);
    this.garmentGroup.add(this.tshirtMesh);
  }

  /**
   * Update garment parameters (size, sleeves, color).
   */
  setGarmentParams(params: TShirtParams & GarmentMaterialParams): void {
    let needsGeometryRebuild = false;

    if (
      params.chestWidth !== undefined ||
      params.length !== undefined ||
      params.sleeveLength !== undefined
    ) {
      this.currentGarmentParams = {
        ...this.currentGarmentParams,
        chestWidth: params.chestWidth ?? this.currentGarmentParams.chestWidth,
        length: params.length ?? this.currentGarmentParams.length,
        sleeveLength: params.sleeveLength ?? this.currentGarmentParams.sleeveLength,
      };
      needsGeometryRebuild = true;
    }

    if (params.color !== undefined || params.roughness !== undefined) {
      this.currentMaterialParams = {
        ...this.currentMaterialParams,
        color: params.color ?? this.currentMaterialParams.color,
        roughness: params.roughness ?? this.currentMaterialParams.roughness,
      };

      if (this.tshirtMesh && !needsGeometryRebuild) {
        updateGarmentMaterial(
          this.tshirtMesh.material as import('three').MeshStandardMaterial,
          this.currentMaterialParams
        );
      }
    }

    if (needsGeometryRebuild) {
      this.rebuildGarmentMesh();
    }
  }

  /**
   * Updates the 3D torso rig from MediaPipe smoothed landmarks.
   *
   * MediaPipe landmark indices used:
   *   11: Left Shoulder, 12: Right Shoulder
   *   23: Left Hip,      24: Right Hip
   */
  updateTorso(landmarks: NormalizedLandmark[], drawInfo: TorsoDrawInfo): void {
    if (!this.camera || !this.garmentGroup || landmarks.length < 25) {
      this.isPoseVisible = false;
      if (this.garmentGroup) this.garmentGroup.visible = false;
      return;
    }

    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];

    // Require good visibility on upper body landmarks
    const minVisibility = 0.4;
    const isVisible =
      (leftShoulder.visibility ?? 1) > minVisibility &&
      (rightShoulder.visibility ?? 1) > minVisibility &&
      (leftHip.visibility ?? 1) > minVisibility &&
      (rightHip.visibility ?? 1) > minVisibility;

    if (!isVisible) {
      this.isPoseVisible = false;
      this.garmentGroup.visible = false;
      return;
    }

    this.isPoseVisible = true;
    this.garmentGroup.visible = true;

    // ------------------------------------------------------------------
    // 1. Convert normalized landmarks to 3D camera space coordinates
    // ------------------------------------------------------------------
    const pLeftShoulder = this.unprojectLandmark(leftShoulder, drawInfo);
    const pRightShoulder = this.unprojectLandmark(rightShoulder, drawInfo);
    const pLeftHip = this.unprojectLandmark(leftHip, drawInfo);
    const pRightHip = this.unprojectLandmark(rightHip, drawInfo);

    // ------------------------------------------------------------------
    // 2. Chest center position
    // ------------------------------------------------------------------
    const shoulderCenter = new Vector3()
      .addVectors(pLeftShoulder, pRightShoulder)
      .multiplyScalar(0.5);

    const hipCenter = new Vector3()
      .addVectors(pLeftHip, pRightHip)
      .multiplyScalar(0.5);

    // The T-shirt mesh origin is centered at the chest
    // (65% up from hips toward shoulders)
    this.targetPosition.copy(shoulderCenter)
      .multiplyScalar(0.68)
      .addScaledVector(hipCenter, 0.32);

    // Pull slightly forward in Z so the shirt drapes over the body
    this.targetPosition.z += 0.04;

    // ------------------------------------------------------------------
    // 3. Torso Scale
    // ------------------------------------------------------------------
    // Shoulder span in 3D
    const shoulderSpan = pLeftShoulder.distanceTo(pRightShoulder);
    // Torso length from shoulders to hips in 3D
    const torsoHeight = shoulderCenter.distanceTo(hipCenter);

    // Mesh is generated with chestWidth = 1.0, length = 1.25
    // Scale mesh to match actual user proportions:
    // Scale factor with slight ease for natural fit
    const scaleX = shoulderSpan * 1.15;
    const scaleY = (torsoHeight / 0.52) * 0.95;
    const scaleZ = scaleX * 1.0;

    this.targetScale.set(scaleX, scaleY, scaleZ);

    // ------------------------------------------------------------------
    // 4. Torso Orientation (3D Basis Vectors -> Quaternion)
    // ------------------------------------------------------------------
    // In mirrored selfie mode:
    // Right shoulder is on screen right (+X), Left shoulder is on screen left (-X)
    // Vector pointing across chest from left to right:
    const vAcross = new Vector3().subVectors(pRightShoulder, pLeftShoulder).normalize();

    // Vector pointing down torso from shoulders to hips:
    const vSpine = new Vector3().subVectors(hipCenter, shoulderCenter).normalize();

    // Chest normal (pointing outward from chest toward the camera):
    // vAcross × (-vSpine) points forward (+Z)
    const vUp = new Vector3().copy(vSpine).negate();
    const vNormal = new Vector3().crossVectors(vAcross, vUp).normalize();

    // Re-orthogonalize Up vector to guarantee an orthonormal basis
    const vOrthogonalUp = new Vector3().crossVectors(vNormal, vAcross).normalize();

    // Build rotation matrix from basis:
    // Column 0: X (Across), Column 1: Y (Up), Column 2: Z (Normal)
    const rotMatrix = new Matrix4().makeBasis(vAcross, vOrthogonalUp, vNormal);
    this.targetQuaternion.setFromRotationMatrix(rotMatrix);

    // ------------------------------------------------------------------
    // 5. Smooth Interpolation (Jitter Prevention)
    // ------------------------------------------------------------------
    if (!this.hasFirstPose) {
      this.smoothedPosition.copy(this.targetPosition);
      this.smoothedScale.copy(this.targetScale);
      this.smoothedQuaternion.copy(this.targetQuaternion);
      this.hasFirstPose = true;
    } else {
      // Responsive lerp rate for position/scale, slerp for rotation
      const posAlpha = 0.35;
      const rotAlpha = 0.30;
      this.smoothedPosition.lerp(this.targetPosition, posAlpha);
      this.smoothedScale.lerp(this.targetScale, posAlpha);
      this.smoothedQuaternion.slerp(this.targetQuaternion, rotAlpha);
    }

    // Apply to Three.js garment group
    this.garmentGroup.position.copy(this.smoothedPosition);
    this.garmentGroup.scale.copy(this.smoothedScale);
    this.garmentGroup.quaternion.copy(this.smoothedQuaternion);
  }

  /**
   * Unprojects a 2D normalized landmark into 3D camera space.
   */
  private unprojectLandmark(
    lm: NormalizedLandmark,
    drawInfo: TorsoDrawInfo
  ): Vector3 {
    const { width, height, offsetX, offsetY, drawW, drawH, mirrored } = drawInfo;

    // Apply mirroring if active (selfie view)
    const normX = mirrored ? 1.0 - lm.x : lm.x;
    const screenX = offsetX + normX * drawW;
    const screenY = offsetY + lm.y * drawH;

    // Convert screen pixels to Normalized Device Coordinates (NDC) [-1, 1]
    const ndcX = (screenX / width) * 2.0 - 1.0;
    const ndcY = -((screenY / height) * 2.0 - 1.0);

    // Compute visible frustum dimensions at camera target plane (z = 0, distance = cameraZ)
    const fovRadians = (this.cameraFov * Math.PI) / 180.0;
    const frustumHeightAtOrigin = 2.0 * this.cameraZ * Math.tan(fovRadians * 0.5);
    const aspect = width / height;
    const frustumWidthAtOrigin = frustumHeightAtOrigin * aspect;

    // MediaPipe z is relative depth scaled roughly with image width
    const depthOffset = (lm.z || 0) * -1.8;

    const worldX = ndcX * (frustumWidthAtOrigin * 0.5);
    const worldY = ndcY * (frustumHeightAtOrigin * 0.5);
    const worldZ = depthOffset;

    return new Vector3(worldX, worldY, worldZ);
  }

  /**
   * Render one Three.js frame.
   */
  render(): void {
    if (!this.renderer || !this.scene || !this.camera) return;
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Handle canvas resize.
   */
  resize(width: number, height: number): void {
    if (!this.renderer || !this.camera) return;
    this.camera.aspect = width / (height || 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  /**
   * Clean up all Three.js resources, textures, and geometry.
   */
  dispose(): void {
    if (this.tshirtMesh) {
      this.tshirtMesh.geometry.dispose();
      if (Array.isArray(this.tshirtMesh.material)) {
        this.tshirtMesh.material.forEach((m) => m.dispose());
      } else {
        this.tshirtMesh.material.dispose();
      }
      this.tshirtMesh = null;
    }

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }

    this.scene = null;
    this.camera = null;
    this.garmentGroup = null;
    this.hasFirstPose = false;
  }
}
