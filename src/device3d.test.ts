import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildDeviceModel } from './device3d';
import { DEFINITIONS } from './model';
import { hasDevice3D, KNOWLEDGE_KINDS } from './knowledge';

describe('teaching device geometry', () => {
  const supported = KNOWLEDGE_KINDS.filter(hasDevice3D);
  it('offers representative models without labeling unsupported components as 3D', () => {
    expect(supported).toContain('vfd');
    expect(supported).toContain('softStarter');
    expect(supported).toContain('motor');
    expect(supported).toContain('contactor220NC');
    expect(hasDevice3D('surge3')).toBe(false);
    expect(hasDevice3D('target')).toBe(false);
    expect(hasDevice3D('motorSingle')).toBe(false);
    expect(() => buildDeviceModel('surge3')).toThrow();
  });
  it.each(supported)('%s is finite, centered and has exactly the declared model terminals', (kind) => {
    const model = buildDeviceModel(kind);
    expect([...model.terminals.keys()].sort()).toEqual(DEFINITIONS[kind].ports.map((p) => p.id).sort());
    const bounds = new THREE.Box3().setFromObject(model.root);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    expect(center.length()).toBeLessThan(.00001);
    expect(Math.min(size.x, size.y, size.z)).toBeGreaterThan(.2);
    expect(Math.max(size.x, size.y, size.z)).toBeLessThan(8);
    let meshes = 0;
    model.root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      meshes++;
      const positions = obj.geometry.getAttribute('position');
      expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
    });
    expect(meshes).toBeGreaterThan(5);
    for (const [id, mesh] of model.terminals) {
      expect(mesh.userData.terminalId).toBe(id);
      expect(mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    }
    model.dispose();
  });
  it('releases geometry and materials on disposal', () => {
    const model = buildDeviceModel('vfd');
    const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    model.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        geometry.add(obj.geometry);
        (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => materials.add(m));
      }
    });
    const geometrySpies = [...geometry].map((g) => vi.spyOn(g, 'dispose'));
    const materialSpies = [...materials].map((m) => vi.spyOn(m, 'dispose'));
    model.dispose();
    expect(geometrySpies.every((s) => s.mock.calls.length === 1)).toBe(true);
    expect(materialSpies.every((s) => s.mock.calls.length === 1)).toBe(true);
  });
});
