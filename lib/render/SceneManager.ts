/**
 * SceneManager — manages the Three.js 3D scene, camera, lights, and articulated garment.
 *
 * Responsibilities:
 *   - Transparent WebGLRenderer layered directly over the video canvas
 *   - PerspectiveCamera calibrated to standard webcam field of view
 *   - Studio 3-point lighting setup for realistic fabric rendering
 *   - Real-time 3D Torso Rig anchoring:
 *       - Tracks 3D position of chest center
 *       - Scales shirt with shoulder span and torso height
 *       - Computes 3D orientation quaternion from shoulder & spine vectors (yaw, pitch, roll)
 *   - Dynamic Arm & Sleeve Articulation (Gate S4):
 *       - Tracks shoulder-to-elbow vectors for left and right arms
 *       - Transforms arm vectors into local torso frame
 *       - Rotates left and right shoulder pivot joints in real-time (raising arms, t-pose, rotation)
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
    sleeveLength: 0.42,
  };
  private currentMaterialParams: GarmentMaterialParams = {
    color: '#2563eb',
    roughness: 0.78,
    metalness: 0.05,
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
    const ambientLight = new AmbientLight(0xffffff, 1.25);
    this.scene.add(ambientLight);

    const keyLight = new DirectionalLight(0xfffaed, 1.6);
    keyLight.position.set(2.5, 4.0, 3.5);
    this.scene.add(keyLight);

    const fillLight = new DirectionalLight(0xedf2ff, 0.8);
    fillLight.position.set(-2.5, 2.0, 2.5);
    this.scene.add(fillLight);

    const rimLight = new DirectionalLight(0xffffff, 0.5);
    rimLight.position.set(0, -2.0, -2.0);
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

    const halfW = (this.currentGarmentParams.chestWidth || 1.0) * 0.5;
    const shoulderY = (this.currentGarmentParams.length || 1.25) * 0.5 - 0.05;

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
   *
   * MediaPipe landmark indices used:
   *   11: Left Shoulder, 12: Right Shoulder
   *   13: Left Elbow,    14: Right Elbow
   *   15: Left Wrist,    16: Right Wrist
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

    // Require good visibility on torso landmarks
    const minVisibility = 0.4;
    const isTorsoVisible =
      (leftShoulder.visibility ?? 1) > minVisibility &&
      (rightShoulder.visibility ?? 1) > minVisibility &&
      (leftHip.visibility ?? 1) > minVisibility &&
      (rightHip.visibility ?? 1) > minVisibility;

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
    // 2. Chest center position
    // ------------------------------------------------------------------
    const shoulderCenter = new Vector3()
      .addVectors(pLeftShoulder, pRightShoulder)
      .multiplyScalar(0.5);

    const hipCenter = new Vector3()
      .addVectors(pLeftHip, pRightHip)
      .multiplyScalar(0.5);

    // T-shirt origin is centered at the upper-mid chest
    this.targetPosition.copy(shoulderCenter)
      .multiplyScalar(0.68)
      .addScaledVector(hipCenter, 0.32);

    this.targetPosition.z += 0.04;

    // ------------------------------------------------------------------
    // 3. Torso Scale
    // ------------------------------------------------------------------
    const shoulderSpan = pLeftShoulder.distanceTo(pRightShoulder);
    const torsoHeight = shoulderCenter.distanceTo(hipCenter);

    const scaleX = shoulderSpan * 1.15;
    const scaleY = (torsoHeight / 0.52) * 0.95;
    const scaleZ = scaleX * 1.0;

    this.targetScale.set(scaleX, scaleY, scaleZ);

    // ------------------------------------------------------------------
    // 4. Torso Orientation (3D Basis Vectors -> Quaternion)
    // ------------------------------------------------------------------
    const vAcross = new Vector3().subVectors(pRightShoulder, pLeftShoulder).normalize();
    const vSpine = new Vector3().subVectors(hipCenter, shoulderCenter).normalize();
    const vUp = new Vector3().copy(vSpine).negate();
    const vNormal = new Vector3().crossVectors(vAcross, vUp).normalize();
    const vOrthogonalUp = new Vector3().crossVectors(vNormal, vAcross).normalize();

    const rotMatrix = new Matrix4().makeBasis(vAcross, vOrthogonalUp, vNormal);
    this.targetQuaternion.setFromRotationMatrix(rotMatrix);

    // Smooth torso transform
    if (!this.hasFirstPose) {
      this.smoothedPosition.copy(this.targetPosition);
      this.smoothedScale.copy(this.targetScale);
      this.smoothedQuaternion.copy(this.targetQuaternion);
      this.hasFirstPose = true;
    } else {
      const posAlpha = 0.35;
      const rotAlpha = 0.30;
      this.smoothedPosition.lerp(this.targetPosition, posAlpha);
      this.smoothedScale.lerp(this.targetScale, posAlpha);
      this.smoothedQuaternion.slerp(this.targetQuaternion, rotAlpha);
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
      // Direction vector from shoulder to elbow in world space
      const vLeftArmWorld = new Vector3().subVectors(pLeftElbow, pLeftShoulder).normalize();

      // Transform to local torso coordinate space
      const vLeftArmLocal = vLeftArmWorld.applyQuaternion(invTorsoQuat).normalize();

      // Neutral left sleeve orientation vector
      const vNeutral = this.tshirtGenerator.getNeutralSleeveDirection(true);

      // Compute quaternion from neutral hang angle to current arm angle
      const qArmTarget = new Quaternion().setFromUnitVectors(vNeutral, vLeftArmLocal);

      this.smoothedLeftArmQuat.slerp(qArmTarget, 0.35);
      this.leftShoulderPivot.quaternion.copy(this.smoothedLeftArmQuat);
    } else if (this.leftShoulderPivot) {
      // Ease back toward neutral rest pose if arm is hidden
      const identityQuat = new Quaternion();
      this.smoothedLeftArmQuat.slerp(identityQuat, 0.15);
      this.leftShoulderPivot.quaternion.copy(this.smoothedLeftArmQuat);
    }

    // --- Right Arm Articulation ---
    const rightElbow = landmarks[14];
    if (this.rightShoulderPivot && (rightElbow?.visibility ?? 0) > 0.35) {
      const pRightElbow = this.unprojectLandmark(rightElbow, drawInfo);
      // Direction vector from shoulder to elbow in world space
      const vRightArmWorld = new Vector3().subVectors(pRightElbow, pRightShoulder).normalize();

      // Transform to local torso coordinate space
      const vRightArmLocal = vRightArmWorld.applyQuaternion(invTorsoQuat).normalize();

      // Neutral right sleeve orientation vector
      const vNeutral = this.tshirtGenerator.getNeutralSleeveDirection(false);

      // Compute quaternion from neutral hang angle to current arm angle
      const qArmTarget = new Quaternion().setFromUnitVectors(vNeutral, vRightArmLocal);

      this.smoothedRightArmQuat.slerp(qArmTarget, 0.35);
      this.rightShoulderPivot.quaternion.copy(this.smoothedRightArmQuat);
    } else if (this.rightShoulderPivot) {
      // Ease back toward neutral rest pose if arm is hidden
      const identityQuat = new Quaternion();
      this.smoothedRightArmQuat.slerp(identityQuat, 0.15);
      this.rightShoulderPivot.quaternion.copy(this.smoothedRightArmQuat);
    }
  }

  /**
   * Unprojects a 2D normalized landmark into 3D camera space.
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

    const fovRadians = (this.cameraFov * Math.PI) / 180.0;
    const frustumHeightAtOrigin = 2.0 * this.cameraZ * Math.tan(fovRadians * 0.5);
    const aspect = width / height;
    const frustumWidthAtOrigin = frustumHeightAtOrigin * aspect;

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
