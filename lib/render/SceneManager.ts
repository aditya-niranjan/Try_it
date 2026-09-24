/**
 * SceneManager — manages the Three.js scene, camera, renderer, and lights.
 *
 * Responsibilities:
 *   - Create and configure WebGLRenderer, Scene, Camera
 *   - Manage lighting setup
 *   - Provide a render() call for the frame loop
 *   - Handle resize events and disposal
 */

export class SceneManager {
  /**
   * Initialize the Three.js scene, renderer, camera, and lights.
   * TODO: Create WebGLRenderer bound to canvas, PerspectiveCamera, Scene, lights.
   */
  init(_canvas: HTMLCanvasElement): void {
    // TODO: implement in P3
    throw new Error('SceneManager.init() not implemented');
  }

  /**
   * Render one frame.
   * TODO: Call renderer.render(scene, camera).
   */
  render(): void {
    // TODO: implement in P3
  }

  /**
   * Handle canvas/window resize.
   * TODO: Update camera aspect ratio, renderer size.
   */
  resize(_width: number, _height: number): void {
    // TODO: implement in P3
  }

  /**
   * Clean up all Three.js resources.
   */
  dispose(): void {
    // TODO: implement in P3
  }
}
