/**
 * SceneManager — manages the Three.js 3D scene, camera, lights, and articulated garment.
 *
 * Responsibilities:
 *   - Transparent WebGLRenderer layered directly over the video canvas
 *   - PerspectiveCamera calibrated to webcam FOV and plane projection
 *   - Balanced 3-point studio lighting for realistic fabric shading and depth
 *   - Exact 1:1 Torso Rig Scaling:
 *       - Anchors shirt collar directly to the user's shoulder center
 *       - Scales shirt uniformly to the detected shoulder span (scale = shoulderSpan)
 *       - Eliminates oversized clipping and projection blowup
 *   - Anatomically stable 3D rotation (yaw, pitch, roll) from body landmarks
 *   - Dynamic Arm & Sleeve Articulation following shoulder-to-elbow vectors
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
  Quaternion,
  Euler,
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

  // Hierarchical Garment Assembly
  private garmentGroup: Group | null = null;
  private torsoMesh: Mesh | null = null;
  private leftShoulderPivot: Group | null = null;
  private leftSleeveMesh: Mesh | null = null;
  private rightShoulderPivot: Group | null = null;
  private rightSleeveMesh: Mesh | null = null;

  private tshirtGenerator: TShirtGenerator = new TShirtGenerator();

  private currentGarmentParams: TShirtParams = {
    chestWidth: 1.0,
    length: 1.25,
    sleeveLength: 0.38,
  };
  private currentMaterialParams: GarmentMaterialParams = {
    color: '#2563eb',
    roughness: 0.72,
    metalness: 0.04,
  };

  // Target and smoothed transformation states for Torso
  private targetPosition = new Vector3();
  private targetScale = new Vector3(1, 1, 1);
  private targetQuaternion = new Quaternion();

  private smoothedPosition = new Vector3();
  private smoothedScale = new Vector3(1, 1, 1);
  private smoothedQuaternion = new Quaternion();

  // Target and smoothed quaternions for Articulated Sleeves
  private smoothedLeftArmQuat = new Quaternion();
  private smoothedRightArmQuat = new Quaternion();

  private isPoseVisible = false;
  private hasFirstPose = false;

  /** Camera parameters. */
  private readonly cameraFov = 45; // degrees vertical FOV
  private readonly cameraZ = 4.0;  // camera placed at z = 4.0

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

    // 4. Lighting Setup (Studio 3-Point Lighting with realistic contrast)
    // Ambient light: soft base fill (not washed out)
    const ambientLight = new AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    // Key light: warm directional light from upper right, gives shape and folds
    const keyLight = new DirectionalLight(0xfff6ea, 1.4);
    keyLight.position.set(3.0, 4.5, 3.5);
    this.scene.add(keyLight);

    // Fill light: soft cool directional light from upper left
    const fillLight = new DirectionalLight(0xe8f0fe, 0.6);
    fillLight.position.set(-3.0, 2.0, 2.5);
    this.scene.add(fillLight);

    // Rim/Back light: highlights collar and contours
    const rimLight = new DirectionalLight(0xffffff, 0.4);
    rimLight.position.set(0, 3.0, -3.0);
    this.scene.add(rimLight);

    // 5. Root Garment Group
    this.garmentGroup = new Group();
    this.garmentGroup.visible = false;
    this.scene.add(this.garmentGroup);

    this.rebuildGarmentMesh();
  }

  /**
   * Rebuilds the articulated 3D T-shirt assembly (Torso body + Left & Right sleeve pivots).
   */
  private rebuildGarmentMesh(): void {
    if (!this.garmentGroup) return;

    // Dispose old meshes and clear children
    if (this.torsoMesh) {
      this.torsoMesh.geometry.dispose();
      this.garmentGroup.remove(this.torsoMesh);
      this.torsoMesh = null;
    }
    if (this.leftShoulderPivot) {
      this.leftSleeveMesh?.geometry.dispose();
      this.garmentGroup.remove(this.leftShoulderPivot);
      this.leftShoulderPivot = null;
      this.leftSleeveMesh = null;
    }
    if (this.rightShoulderPivot) {
      this.rightSleeveMesh?.geometry.dispose();
      this.garmentGroup.remove(this.rightShoulderPivot);
      this.rightShoulderPivot = null;
      this.rightSleeveMesh = null;
    }

    const { torso, leftSleeve, rightSleeve } = this.tshirtGenerator.generate(this.currentGarmentParams);
    const material = createGarmentMaterial(this.currentMaterialParams);

    // 1. Torso mesh
    this.torsoMesh = new Mesh(torso, material);
    this.garmentGroup.add(this.torsoMesh);

    // Shoulder pivots: Left at -0.5, Right at +0.5
    const halfW = (this.currentGarmentParams.chestWidth || 1.0) * 0.5;
    const shoulderY = -0.04;

    // 2. Left shoulder pivot & sleeve
    this.leftShoulderPivot = new Group();
    this.leftShoulderPivot.position.set(-halfW, shoulderY, 0);
    this.leftSleeveMesh = new Mesh(leftSleeve, material);
    this.leftShoulderPivot.add(this.leftSleeveMesh);
    this.garmentGroup.add(this.leftShoulderPivot);

    // 3. Right shoulder pivot & sleeve
    this.rightShoulderPivot = new Group();
    this.rightShoulderPivot.position.set(halfW, shoulderY, 0);
    this.rightSleeveMesh = new Mesh(rightSleeve, material);
    this.rightShoulderPivot.add(this.rightSleeveMesh);
    this.garmentGroup.add(this.rightShoulderPivot);
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

      if (this.torsoMesh && !needsGeometryRebuild) {
        updateGarmentMaterial(
          this.torsoMesh.material as import('three').MeshStandardMaterial,
          this.currentMaterialParams
        );
      }
    }

    if (needsGeometryRebuild) {
      this.rebuildGarmentMesh();
    }
  }

  /**
   * Updates the 3D torso rig and dynamic sleeve articulation from MediaPipe smoothed landmarks.
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

    // Visibility guard
    const minVisibility = 0.35;
    const isTorsoVisible =
      (leftShoulder.visibility ?? 1) > minVisibility &&
      (rightShoulder.visibility ?? 1) > minVisibility;

    if (!isTorsoVisible) {
      this.isPoseVisible = false;
      this.garmentGroup.visible = false;
      return;
    }

    this.isPoseVisible = true;
    this.garmentGroup.visible = true;

    // ------------------------------------------------------------------
    // 1. Unproject core landmarks into 3D camera space
    // ------------------------------------------------------------------
    const pLeftShoulder = this.unprojectLandmark(leftShoulder, drawInfo);
    const pRightShoulder = this.unprojectLandmark(rightShoulder, drawInfo);
    const pLeftHip = this.unprojectLandmark(leftHip, drawInfo);
    const pRightHip = this.unprojectLandmark(rightHip, drawInfo);

    // ------------------------------------------------------------------
    // 2. Collar & Shoulder Center Position
    // ------------------------------------------------------------------
    // In mirrored selfie mode:
    // Left shoulder landmark (11) is on the user's left on screen
    // Right shoulder landmark (12) is on the user's right on screen
    const shoulderCenter = new Vector3()
      .addVectors(pLeftShoulder, pRightShoulder)
      .multiplyScalar(0.5);

    // Anchors the collar line of the T-shirt directly at the shoulders
    this.targetPosition.copy(shoulderCenter);
    // Move slightly forward so front fabric drapes over body
    this.targetPosition.z += 0.02;

    // ------------------------------------------------------------------
    // 3. Proportional Scale (Directly anchored to shoulder span)
    // ------------------------------------------------------------------
    // The 3D model base shoulder width is 1.0 (from -0.5 to +0.5).
    // Therefore: scale = actualShoulderSpan ensures exact 1:1 fit!
    const shoulderSpan = pLeftShoulder.distanceTo(pRightShoulder);

    // Add 15% ease for comfortable clothing fit
    const baseScale = Math.max(0.2, shoulderSpan * 1.15);

    this.targetScale.set(baseScale, baseScale, baseScale);

    // ------------------------------------------------------------------
    // 4. Stable 3D Rotation (Euler: Roll, Yaw, Pitch)
    // ------------------------------------------------------------------
    // Roll: tilt angle of the shoulder line in the screen plane
    const deltaX = pRightShoulder.x - pLeftShoulder.x;
    const deltaY = pRightShoulder.y - pLeftShoulder.y;
    const roll = Math.atan2(deltaY, deltaX);

    // Yaw: body turn left/right (from relative Z difference of shoulders)
    // Clamped to prevent extreme flips
    const zDiff = (rightShoulder.z ?? 0) - (leftShoulder.z ?? 0);
    const yaw = Math.max(-0.6, Math.min(0.6, zDiff * 1.6));

    // Pitch: forward/backward torso lean
    const hipCenter = new Vector3().addVectors(pLeftHip, pRightHip).multiplyScalar(0.5);
    const zTilt = shoulderCenter.z - hipCenter.z;
    const pitch = Math.max(-0.35, Math.min(0.35, zTilt * 0.9));

    // Compose Euler angles: Y (yaw) -> X (pitch) -> Z (roll)
    const euler = new Euler(pitch, yaw, roll, 'YXZ');
    this.targetQuaternion.setFromEuler(euler);

    // Smooth torso transform with lerp / slerp
    if (!this.hasFirstPose) {
      this.smoothedPosition.copy(this.targetPosition);
      this.smoothedScale.copy(this.targetScale);
      this.smoothedQuaternion.copy(this.targetQuaternion);
      this.hasFirstPose = true;
    } else {
      this.smoothedPosition.lerp(this.targetPosition, 0.35);
      this.smoothedScale.lerp(this.targetScale, 0.30);
      this.smoothedQuaternion.slerp(this.targetQuaternion, 0.28);
    }

    this.garmentGroup.position.copy(this.smoothedPosition);
    this.garmentGroup.scale.copy(this.smoothedScale);
    this.garmentGroup.quaternion.copy(this.smoothedQuaternion);

    // ------------------------------------------------------------------
    // 5. Dynamic Arm & Sleeve Articulation (Gate S4)
    // ------------------------------------------------------------------
    const invTorsoQuat = this.smoothedQuaternion.clone().invert();

    // --- Left Arm Articulation ---
    const leftElbow = landmarks[13];
    if (this.leftShoulderPivot && (leftElbow?.visibility ?? 0) > 0.35) {
      const pLeftElbow = this.unprojectLandmark(leftElbow, drawInfo);
      const vLeftArmWorld = new Vector3().subVectors(pLeftElbow, pLeftShoulder).normalize();
      const vLeftArmLocal = vLeftArmWorld.clone().applyQuaternion(invTorsoQuat).normalize();
      const vNeutral = this.tshirtGenerator.getNeutralSleeveDirection(true);

      const qArmTarget = new Quaternion().setFromUnitVectors(vNeutral, vLeftArmLocal);
      this.smoothedLeftArmQuat.slerp(qArmTarget, 0.30);
      this.leftShoulderPivot.quaternion.copy(this.smoothedLeftArmQuat);
    } else if (this.leftShoulderPivot) {
      const identityQuat = new Quaternion();
      this.smoothedLeftArmQuat.slerp(identityQuat, 0.15);
      this.leftShoulderPivot.quaternion.copy(this.smoothedLeftArmQuat);
    }

    // --- Right Arm Articulation ---
    const rightElbow = landmarks[14];
    if (this.rightShoulderPivot && (rightElbow?.visibility ?? 0) > 0.35) {
      const pRightElbow = this.unprojectLandmark(rightElbow, drawInfo);
      const vRightArmWorld = new Vector3().subVectors(pRightElbow, pRightShoulder).normalize();
      const vRightArmLocal = vRightArmWorld.clone().applyQuaternion(invTorsoQuat).normalize();
      const vNeutral = this.tshirtGenerator.getNeutralSleeveDirection(false);

      const qArmTarget = new Quaternion().setFromUnitVectors(vNeutral, vRightArmLocal);
      this.smoothedRightArmQuat.slerp(qArmTarget, 0.30);
      this.rightShoulderPivot.quaternion.copy(this.smoothedRightArmQuat);
    } else if (this.rightShoulderPivot) {
      const identityQuat = new Quaternion();
      this.smoothedRightArmQuat.slerp(identityQuat, 0.15);
      this.rightShoulderPivot.quaternion.copy(this.smoothedRightArmQuat);
    }
  }

  /**
   * Unprojects a 2D normalized landmark into 3D camera space at the reference plane.
   */
  private unprojectLandmark(
    lm: NormalizedLandmark,
    drawInfo: TorsoDrawInfo
  ): Vector3 {
    const { width, height, offsetX, offsetY, drawW, drawH, mirrored } = drawInfo;

    const normX = mirrored ? 1.0 - lm.x : lm.x;
    const screenX = offsetX + normX * drawW;
    const screenY = offsetY + lm.y * drawH;

    const ndcX = (screenX / width) * 2.0 - 1.0;
    const ndcY = -((screenY / height) * 2.0 - 1.0);

    // Visible frustum dimensions at target plane z = 0 (distance = cameraZ = 4.0)
    const fovRadians = (this.cameraFov * Math.PI) / 180.0;
    const frustumHeightAtOrigin = 2.0 * this.cameraZ * Math.tan(fovRadians * 0.5);
    const aspect = width / (height || 1);
    const frustumWidthAtOrigin = frustumHeightAtOrigin * aspect;

    const worldX = ndcX * (frustumWidthAtOrigin * 0.5);
    const worldY = ndcY * (frustumHeightAtOrigin * 0.5);

    // Relative depth scaled safely (capped to prevent blowing up into the camera)
    const worldZ = Math.max(-0.25, Math.min(0.25, -(lm.z || 0) * 0.4));

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
    if (this.torsoMesh) {
      this.torsoMesh.geometry.dispose();
      this.torsoMesh = null;
    }
    if (this.leftSleeveMesh) {
      this.leftSleeveMesh.geometry.dispose();
      this.leftSleeveMesh = null;
    }
    if (this.rightSleeveMesh) {
      this.rightSleeveMesh.geometry.dispose();
      this.rightSleeveMesh = null;
    }

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }

    this.scene = null;
    this.camera = null;
    this.garmentGroup = null;
    this.leftShoulderPivot = null;
    this.rightShoulderPivot = null;
    this.hasFirstPose = false;
  }
}
