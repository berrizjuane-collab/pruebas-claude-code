/**
 * Resource lifetime management for WebGL objects.
 *
 * WebGL leaks are silent and cumulative. Every scene object registers the
 * geometries, materials, textures and render targets it owns; on teardown the
 * tracker disposes them in one pass. Scene modules also implement dispose()
 * themselves and call it from here.
 */

import type * as THREE from 'three';

export interface Disposable {
  dispose(): void;
}

type Trackable =
  | { dispose: () => void }
  | THREE.BufferGeometry
  | THREE.Material
  | THREE.Texture
  | THREE.WebGLRenderTarget;

export class ResourceTracker {
  private resources = new Set<Trackable>();

  /** Track a disposable and return it for convenient inline use. */
  track<T extends Trackable>(resource: T): T {
    this.resources.add(resource);
    return resource;
  }

  /** Track several resources at once. */
  trackMany(...resources: Trackable[]): void {
    for (const r of resources) this.resources.add(r);
  }

  /** Dispose everything tracked and clear the set. */
  disposeAll(): void {
    for (const r of this.resources) {
      const anyR = r as { dispose?: () => void };
      if (typeof anyR.dispose === 'function') anyR.dispose();
    }
    this.resources.clear();
  }
}
