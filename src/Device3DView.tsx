import { useEffect, useRef, useState } from 'react';
import { Expand, LoaderCircle, Pause, Play, RotateCcw, ScanLine, ZoomIn, ZoomOut } from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildDeviceModel } from './device3d';
import { DEFINITIONS } from './model';
import type { Kind } from './model';
import { terminalMeaning } from './knowledge';

interface ViewerAPI {
  reset: (front?: boolean) => void;
  zoom: (factor: number) => void;
  select: (id: string) => void;
}

export default function Device3DView({ kind }: { kind: Kind }) {
  const def = DEFINITIONS[kind];
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const api = useRef<ViewerAPI | null>(null);
  const rotate = useRef(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selected, setSelected] = useState('');
  const [retry, setRetry] = useState(0);
  const [fullscreenError, setFullscreenError] = useState(false);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;
    setStatus('loading'); setSelected(''); setAutoRotate(false); rotate.current = false;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    } catch { setStatus('error'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    const canvas = renderer.domElement;
    canvas.setAttribute('aria-label', `${def.name}三维教学模型`);
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('tabindex', '0');
    host.appendChild(canvas);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#eef2f4');
    const model = buildDeviceModel(kind);
    scene.add(model.root);
    const bounds = new THREE.Box3().setFromObject(model.root);
    const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
    scene.add(new THREE.HemisphereLight('#ffffff', '#809096', 2.7));
    const key = new THREE.DirectionalLight('#fffaf2', 4.3);
    key.position.set(4, 7, 6);
    scene.add(key);
    const fill = new THREE.DirectionalLight('#d3e9ff', 2.1);
    fill.position.set(-4, 2, -5); scene.add(fill);
    const camera = new THREE.PerspectiveCamera(34, 1, .05, 200);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.dampingFactor = .08;
    controls.autoRotateSpeed = 1.4;
    controls.minDistance = radius * 1.6;
    controls.maxDistance = radius * 8;
    controls.target.set(0, 0, 0);
    let baselineDistance = radius * 4;
    const frame = (front = false) => {
      const vertical = THREE.MathUtils.degToRad(camera.fov / 2);
      const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
      baselineDistance = radius / Math.sin(Math.min(vertical, horizontal)) * 1.12;
      camera.position.copy(new THREE.Vector3(front ? 0 : .82, front ? 0 : .5, 1.65).normalize().multiplyScalar(baselineDistance));
      controls.target.set(0, 0, 0); controls.update();
    };
    const resize = () => {
      if (!host.clientWidth || !host.clientHeight) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
      frame();
      renderer.render(scene, camera);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    let visible = true;
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) renderer.render(scene, camera);
    });
    intersection.observe(host);
    const markDirty = () => { renderer.render(scene, camera); };
    controls.addEventListener('change', markDirty);
    const select = (id: string) => {
      for (const [terminalId, mesh] of model.terminals) {
        const material = mesh.material as THREE.MeshStandardMaterial;
        material.emissive.set(terminalId === id ? '#e6a31d' : '#000000');
        material.emissiveIntensity = terminalId === id ? .9 : 0;
      }
      renderer.render(scene, camera);
    };
    api.current = {
      reset: (front = false) => { frame(front); renderer.render(scene, camera); },
      zoom: (factor) => {
        camera.position.multiplyScalar(factor).clampLength(controls.minDistance, controls.maxDistance);
        controls.update(); renderer.render(scene, camera);
      },
      select,
    };
    const raycaster = new THREE.Raycaster();
    let down = { x: 0, y: 0 };
    const pointerDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY }; };
    const pointerUp = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return;
      const rect = canvas.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1,
        -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
      const hit = raycaster.intersectObject(model.root, true)[0];
      const id = hit?.object.userData.terminalId as string | undefined;
      if (id) { setSelected(id); select(id); }
    };
    const keyboard = (event: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Home'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home') frame();
      else if (['+', '=', '-'].includes(event.key)) api.current?.zoom(event.key === '-' ? 1.15 : 1 / 1.15);
      else {
        const offset = camera.position.clone().sub(controls.target);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        if (event.key === 'ArrowLeft') spherical.theta -= .13;
        if (event.key === 'ArrowRight') spherical.theta += .13;
        if (event.key === 'ArrowUp') spherical.phi -= .13;
        if (event.key === 'ArrowDown') spherical.phi += .13;
        spherical.phi = THREE.MathUtils.clamp(spherical.phi, .05, Math.PI - .05);
        camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
        controls.update();
      }
      renderer.render(scene, camera);
    };
    const contextLost = (event: Event) => { event.preventDefault(); setStatus('error'); renderer.setAnimationLoop(null); };
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('keydown', keyboard);
    canvas.addEventListener('webglcontextlost', contextLost);
    resize();
    renderer.render(scene, camera);
    setStatus('ready');
    let last = performance.now();
    renderer.setAnimationLoop(() => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, .05); last = now;
      if (!visible) return;
      controls.autoRotate = rotate.current;
      controls.update(dt);
    });
    return () => {
      api.current = null;
      resizeObserver.disconnect(); intersection.disconnect();
      renderer.setAnimationLoop(null);
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('keydown', keyboard);
      canvas.removeEventListener('webglcontextlost', contextLost);
      controls.dispose();
      model.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, [kind, def.name, retry]);

  return <section className="device3d" aria-label={`${def.name}三维展示`} ref={hostRef}>
    <div className="device3d-toolbar"><span className="device3d-caption">3D 结构示意</span>
      <div className="device3d-tools">
        <button title={autoRotate ? '暂停旋转' : '自动旋转'} aria-label={autoRotate ? '暂停旋转' : '自动旋转'} aria-pressed={autoRotate} disabled={status !== 'ready'}
          onClick={() => { rotate.current = !autoRotate; setAutoRotate(!autoRotate); }}>{autoRotate ? <Pause size={17} /> : <Play size={17} />}</button>
        <button title="正视图" aria-label="正视图" disabled={status !== 'ready'} onClick={() => api.current?.reset(true)}><ScanLine size={18} /></button>
        <button title="放大模型" aria-label="放大模型" disabled={status !== 'ready'} onClick={() => api.current?.zoom(1 / 1.18)}><ZoomIn size={18} /></button>
        <button title="缩小模型" aria-label="缩小模型" disabled={status !== 'ready'} onClick={() => api.current?.zoom(1.18)}><ZoomOut size={18} /></button>
        <button title="重置视角" aria-label="重置视角" disabled={status !== 'ready'} onClick={() => { rotate.current = false; setAutoRotate(false); api.current?.reset(); }}><RotateCcw size={17} /></button>
        <button title="全屏模型" aria-label="全屏模型" disabled={status !== 'ready'} onClick={async () => {
          try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await hostRef.current?.requestFullscreen();
          } catch { setFullscreenError(true); }
        }}><Expand size={17} /></button>
      </div>
    </div>
    <div className="device3d-stage" data-render-state={status} ref={canvasHostRef} />
    {status === 'loading' && <div className="device3d-message" role="status"><LoaderCircle size={22} className="device3d-loading" />模型加载中</div>}
    {status === 'error' && <div className="device3d-message" role="status"><p>当前浏览器的 3D 渲染不可用，文字和端子资料仍可正常阅读。</p>
      <button onClick={() => setRetry((value) => value + 1)}><RotateCcw size={16} />重新加载模型</button></div>}
    <div className="device3d-footer">
      <label>端子<select aria-label="查看三维模型端子" value={selected} disabled={status !== 'ready'} onChange={(e) => { setSelected(e.target.value); api.current?.select(e.target.value); }}>
        <option value="">未选择</option>{def.ports.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select></label>
      <span>通用外形 · 非厂家尺寸模型</span>
    </div>
    {selected && <div className="device3d-terminal-detail" role="status"><strong>{selected}</strong><span>{terminalMeaning(kind, selected)}</span></div>}
    {fullscreenError && <p className="device3d-fullscreen-error" role="status">浏览器未允许全屏，仍可在当前页面查看模型。</p>}
  </section>;
}
