import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DEFINITIONS } from './model';
import type { Kind } from './model';
import { hasDevice3D } from './knowledge';

export interface DeviceModel {
  root: THREE.Group;
  terminals: Map<string, THREE.Mesh>;
  dispose: () => void;
}

export function buildDeviceModel(kind: Kind): DeviceModel {
  if (!hasDevice3D(kind)) throw new Error(`No teaching model for ${kind}`);
  const def = DEFINITIONS[kind];
  const root = new THREE.Group();
  root.name = kind;
  const terminals = new Map<string, THREE.Mesh>();
  const materials: THREE.Material[] = [], textures: THREE.Texture[] = [];
  const mat = (color: string, metalness = 0, roughness = .6) => {
    const m = new THREE.MeshStandardMaterial({ color, metalness, roughness });
    materials.push(m);
    return m;
  };
  const shell = mat('#dedfda'), black = mat('#272c30'), dark = mat('#4b5357');
  const metal = mat('#b3bec4', .8, .3), brass = mat('#b8a064', .75, .3);
  const accent = mat(def.color ?? '#198d84'), red = mat('#bd4843');
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material, radius = .035) => {
    const mesh = new THREE.Mesh(radius ? new RoundedBoxGeometry(w, h, d, 2, radius) : new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const cylinder = (r: number, length: number, x: number, y: number, z: number, material: THREE.Material, segments = 32) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, length, segments), material);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const plate = (text: string, w: number, h: number, x: number, y: number, z: number, background = '#e8ebe8', color = '#253139') => {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = Math.max(80, Math.round(640 * h / w));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    ctx.font = `600 ${Math.round(canvas.height * .55)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width * .92);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.push(texture);
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.FrontSide });
    materials.push(material);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.set(x, y, z);
    root.add(mesh);
  };
  const screw = (id: string, x: number, y: number, z: number, size = .085) => {
    box(size * 2.9, size * 3.4, .16, x, y, z - .05, black, .018);
    const terminalMaterial = mat('#b8a064', .72, .3);
    const mesh = cylinder(size, .06, x, y, z + .06, terminalMaterial, 16);
    mesh.name = `terminal:${id}`;
    mesh.userData.terminalId = id;
    terminals.set(id, mesh);
    box(size * 1.55, .017, .01, x, y, z + .095, dark, 0).userData.terminalId = id;
    plate(id, size * 3.3, .14, x, y + size * 2.65, z + .105);
  };
  const portRow = (ids: string[], y: number, z: number, width: number, size = .085) => {
    ids.forEach((id, i) => screw(id, (i - (ids.length - 1) / 2) * width / Math.max(ids.length, 1), y, z, size));
  };
  const bolts = (w: number, h: number, z: number) => {
    for (const x of [-w / 2, w / 2]) for (const y of [-h / 2, h / 2]) {
      cylinder(.055, .025, x, y, z, metal, 12);
      box(.065, .012, .01, x, y, z + .017, dark, 0);
    }
  };

  if (def.family === 'drive') {
    box(2.05, 3.2, 1.2, 0, 0, -.15, dark);
    for (let i = 0; i < 12; i++) box(.045, 3.12, .65, -.92 + i * .167, 0, -.93, metal, .009);
    box(2.2, 3.45, .13, 0, 0, -1.16, dark);
    box(2.13, 3.18, .48, 0, 0, .56, shell, .07);
    box(1.75, 1.58, .12, 0, .5, .86, black, .06);
    box(1.36, .5, .035, 0, .87, .94, mat('#203f3a', .1, .25));
    plate(kind === 'vfd' ? 'STOP' : 'READY', 1.22, .32, 0, .89, .964, '#203f3a', '#b3efba');
    plate(kind === 'vfd' ? 'AC DRIVE' : 'SOFT STARTER', 1.47, .19, 0, 1.38, .815);
    plate('通用结构示意', 1.45, .14, 0, -1.1, .815);
    for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
      box(.36, .25, .08, -.48 + col * .48, .27 - row * .37, .97, row === 1 && col === 0 ? accent : row === 1 && col === 2 ? red : dark, .025);
      plate(['▲', 'SET', '▼', 'RUN', '◀', 'STOP'][row * 3 + col], .28, .12, -.48 + col * .48, .27 - row * .37, 1.016, row === 1 && col === 0 ? '#198d84' : row === 1 && col === 2 ? '#bd4843' : '#4b5357', '#ffffff');
    }
    for (let i = 0; i < 8; i++) box(1.56, .035, .04, 0, -.49 - i * .059, .815, black, .008);
    const top = def.ports.filter((p) => p.y < def.height / 2).map((p) => p.id);
    const bottom = def.ports.filter((p) => p.y >= def.height / 2).map((p) => p.id);
    portRow(top, 1.69, .35, 1.94, .073);
    portRow(bottom, -1.55, .8, 2.05, .065);
    bolts(1.88, 2.92, .82);
  } else if (def.family === 'contactor') {
    box(2.08, 2.7, 1.14, 0, 0, -.18, black, .07);
    box(2.16, .38, 1.28, 0, 1.18, -.04, shell);
    box(2.16, .38, 1.28, 0, -1.18, -.04, shell);
    for (const x of [-.68, 0, .68]) {
      box(.56, 1.65, .7, x, 0, .5, dark);
      box(.44, .53, .13, x, .5, .91, black);
      box(.44, .43, .13, x, -.5, .91, black);
      for (let i = 0; i < 4; i++) box(.35, .022, .015, x, -.59 + i * .067, .99, shell, 0);
    }
    box(1.96, .46, .17, 0, -.06, .94, accent);
    box(.46, .38, .08, 0, -.06, 1.065, black);
    plate(`${def.coil?.supply.toUpperCase()} ${def.voltage}V`, 1.48, .18, 0, -.91, .805);
    portRow(['1', '3', '5'], 1.17, .67, 2.04, .105);
    portRow(['2', '4', '6'], -1.17, .67, 2.04, .105);
    portRow(['A1', 'A2'], 1.63, .27, 1.28, .08);
    const aux = def.ports.filter((p) => ['13', '14', '21', '22'].includes(p.id));
    if (aux.length) {
      box(.46, 2.45, .94, 1.37, 0, -.02, shell);
      aux.forEach((p, i) => screw(p.id, 1.37, .89 - i * .55, .53, .065));
    }
    box(2.18, .24, .3, 0, -1.48, -.46, dark);
  } else if (kind === 'motor') {
    const body = cylinder(.96, 1.9, 0, -.02, 0, mat('#397c83', .45, .4), 64);
    body.rotation.x = Math.PI / 2;
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6;
      const fin = box(.035, .23, 1.68, Math.sin(angle) * .96, Math.cos(angle) * .96, 0, mat('#34747c', .5, .42), .005);
      fin.rotation.z = -angle;
    }
    cylinder(1.03, .22, 0, 0, .98, mat('#779398', .65, .35), 64);
    cylinder(.6, .23, 0, 0, 1.14, dark);
    cylinder(.18, .76, 0, 0, 1.6, metal);
    box(.06, .05, .42, 0, .185, 1.7, dark, .006);
    cylinder(.98, .25, 0, 0, -1.08, dark, 64);
    for (let i = 0; i < 7; i++) box(1.35, .036, .01, 0, -.48 + i * .16, -1.216, metal, 0);
    for (const x of [-.66, .66]) {
      box(.52, .18, 1.38, x, -1.1, 0, dark);
      cylinder(.06, .03, x, -1.02, .49, metal);
    }
    box(1.24, .64, .88, 0, 1.08, -.05, dark);
    box(1.27, .09, .91, 0, 1.44, -.05, shell);
    box(1.24, .54, .12, 0, 1.09, .46, mat('#c0a67e'));
    portRow(['W2', 'U2', 'V2'], 1.22, .55, 1.08, .055);
    portRow(['U1', 'V1', 'W1'], .85, .55, 1.08, .055);
    screw('PE', .99, .5, .5, .058);
    plate('3~ MOTOR', 1.05, .17, 0, -.53, 1.108, '#779398');
    bolts(1.25, 1.25, 1.11);
  } else if (def.family === 'breaker') {
    const poles = def.poles ?? 3, w = .52 * poles + .12;
    box(w, 2.64, 1.2, 0, 0, 0, shell, .05);
    for (let i = 0; i < poles; i++) {
      const x = (i - (poles - 1) / 2) * .52;
      box(.018, 2.5, .03, x - .25, 0, .62, dark, 0);
      box(.35, .66, .12, x, -.01, .67, black);
      box(.34, .31, .28, x, .09, .85, accent);
      const top = def.ports.find((p) => p.id === String(i * 2 + 1));
      const bottom = def.ports.find((p) => p.id === String(i * 2 + 2));
      if (top) screw(top.id, x, 1.05, .65, .085);
      if (bottom) screw(bottom.id, x, -1.05, .65, .085);
    }
    plate(def.prefix, Math.min(w * .8, 1.2), .18, 0, .56, .625);
    plate('I / O', Math.min(w * .8, 1.1), .16, 0, -.57, .625);
    box(w + .1, .23, .2, 0, -1.43, -.36, black);
  } else if (def.family === 'pushbutton') {
    box(.95, 1.46, .64, 0, 0, -.51, black);
    cylinder(.6, .26, 0, .4, .04, metal);
    cylinder(kind.startsWith('emergency') ? .74 : .49, .31, 0, .4, .28, accent);
    if (kind.startsWith('emergency')) {
      cylinder(.88, .05, 0, .4, -.11, mat('#e6c94e'));
      plate('STOP', .62, .19, 0, .4, .45, '#c8463e', '#ffffff');
    } else plate(def.operation === 'toggle' ? 'LOCK' : kind === 'buttonNC' ? 'O' : 'I', .5, .24, 0, .4, .45, def.color ?? '#198d84', '#ffffff');
    const ids = def.ports.map((p) => p.id);
    const half = Math.ceil(ids.length / 2);
    portRow(ids.slice(0, half), -1.02, -.06, 1.35, .06);
    portRow(ids.slice(half), -.64, -.06, 1.35, .06);
  } else if (kind === 'ssrAC' || kind === 'ssrDC') {
    box(1.7, 2.2, .32, 0, 0, -.12, metal);
    box(1.5, 1.9, .58, 0, 0, .26, shell);
    box(1.26, .9, .035, 0, 0, .57, black, .015);
    plate('SOLID STATE', 1.15, .18, 0, .16, .6, '#272c30', '#ffffff');
    plate('RELAY', 1.15, .18, 0, -.08, .6, '#272c30', '#ffffff');
    portRow(['1', '2'], .87, .62, 1.28, .09);
    portRow(['A1', 'A2'], -.87, .62, 1.28, .09);
    for (let i = 0; i < 7; i++) box(.04, 2, .55, -.66 + i * .22, 0, -.49, metal, .005);
  } else if (kind === 'safetyRelayAC' || kind === 'safetyRelayDC') {
    box(1.8, 2.35, 1.06, 0, 0, 0, mat('#dfc04c'), .05);
    box(1.3, 1.5, .1, 0, 0, .58, black);
    plate('SAFETY RELAY', 1.12, .18, 0, .49, .642, '#272c30', '#ffffff');
    for (let i = 0; i < 3; i++) {
      cylinder(.055, .035, -.35, .11 - i * .22, .66, accent);
      plate(['PWR', 'CH1', 'CH2'][i], .47, .14, .12, .11 - i * .22, .65, '#272c30', '#ffffff');
    }
    const half = Math.ceil(def.ports.length / 2);
    portRow(def.ports.slice(0, half).map((p) => p.id), 1.34, .29, 1.95, .047);
    portRow(def.ports.slice(half).map((p) => p.id), -1.29, .29, 1.95, .047);
  } else {
    box(1.65, 2.15, 1, 0, 0, 0, shell, .05);
    box(1.38, 1.55, .12, 0, .07, .57, black, .03);
    plate(def.family === 'timer' ? 'TIMER' : 'RELAY', 1.07, .23, 0, .59, .64, '#272c30', '#ffffff');
    if (def.family === 'timer') {
      cylinder(.36, .12, 0, .04, .7, metal);
      box(.05, .22, .025, .1, .08, .78, accent, .005);
      plate('ON DELAY', .94, .14, 0, -.46, .65, '#272c30', '#cedcd5');
    } else {
      box(.82, .76, .2, 0, .02, .67, accent, .035);
      for (let i = 0; i < 8; i++) box(.56, .018, .03, 0, -.28 + i * .075, .79, brass, 0);
    }
    plate(def.coil ? `${def.coil.supply.toUpperCase()} ${def.voltage}V` : 'TEACHING MODEL', 1.05, .15, 0, -.77, .65);
    const half = Math.ceil(def.ports.length / 2);
    portRow(def.ports.slice(0, half).map((p) => p.id), 1.24, .2, 1.9, .048);
    portRow(def.ports.slice(half).map((p) => p.id), -1.27, .2, 1.9, .048);
  }
  root.updateMatrixWorld(true);
  const center = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
  root.position.sub(center);
  return {
    root, terminals,
    dispose: () => {
      root.traverse((obj) => { if (obj instanceof THREE.Mesh) obj.geometry.dispose(); });
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
