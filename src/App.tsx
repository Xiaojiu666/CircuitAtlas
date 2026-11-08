import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowRight, BookOpen, Check, CheckCheck,
  ChevronDown, ChevronRight, Circle, CircleHelp, CircuitBoard, Copy, FilePlus2,
  Columns2, Eraser, FolderOpen, Grid2X2, Hand, Layers2, Maximize, Minus,
  MoreHorizontal, MousePointer2, PanelLeftClose, PanelLeftOpen, Play, Plus,
  Redo2, RotateCw, Save, Search, Settings2, ShieldCheck, Square, Trash2,
  Undo2, Unplug, Waypoints, X, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  DEFINITIONS, LIBRARY_GROUPS, PHASE_COLORS, WIRE_COLORS, exampleProject, initialProject,
  locateTerminal, makeComponent, parseProject, portPosition, terminalId,
} from './model';
import type { Component, Kind, Port, Project, Wire, WireColor } from './model';
import { checkProject, emptyRuntime, simulate } from './simulation';
import type { Controls, Runtime } from './simulation';
import { Actuator, DeviceMiniature, ExtendedDeviceVisual, FamilyIcon } from './DeviceVisual';
import { CIRCUIT_EXAMPLES } from './examples';
import { SchematicView } from './SchematicView';
import { historyReducer } from './workspaceHistory';
import type { CleanupScope } from './workspaceHistory';
import { componentConnections } from './connections';
import type { TerminalConnection } from './connections';
import { ConnectionPanel } from './ConnectionPanel';

type Mode = 'select' | 'wire' | 'pan';
type Selection = { type: 'component' | 'wire'; id: string } | null;
type View = { x: number; y: number; scale: number };
type Drag = { type: 'component'; id: string; sx: number; sy: number; x: number; y: number; ox: number; oy: number } |
  { type: 'pan'; sx: number; sy: number; ox: number; oy: number };
type Dialog = { title: string; kind: 'check' | 'replace' | 'about' | 'clear'; lines?: string[]; project?: Project };
const STORAGE_KEY = 'easysim.project.v1';
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const round = (n: number) => Math.round(n / 10) * 10;

function loadProject() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? parseProject(stored) : initialProject();
  } catch { return initialProject(); }
}
function Tool({ icon: Icon, label, active = false, className = '', children, ...props }: {
  icon: LucideIcon; label: string; active?: boolean; className?: string; children?: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" title={label} aria-label={label} className={`tool ${active ? 'active' : ''} ${className}`} {...props}>
    <Icon size={17} strokeWidth={1.7} />{children}
  </button>;
}
function Miniature({ kind }: { kind: Kind }) {
  const def = DEFINITIONS[kind];
  if (def.image) return <img className={`miniature miniature-${kind}`} src={def.image} alt="" draggable={false} />;
  if (def.supply) return <div className="mini-source">
    <Zap size={13} /><span>{kind === 'source3' ? '3~' : kind === 'source1' ? '1~' : 'DC'}</span><i /><i /><i />
  </div>;
  if (!['buttonNO', 'buttonNC', 'lamp'].includes(kind)) return <DeviceMiniature kind={kind} />;
  return <div className={`mini-button ${kind}`}><span /></div>;
}

function ComponentVisual({ component: c, active, operating, pressed, reverse, runtime, controls, onOperate, onTune }: {
  component: Component; active: boolean; operating: boolean; pressed: boolean; reverse: boolean;
  runtime: Runtime; controls: Controls;
  onOperate: (pressed?: boolean | number, channel?: string) => void; onTune: (value: number) => void;
}) {
  const def = DEFINITIONS[c.kind];
  if (def.supply) return <div className="source-body">
    <div className="source-top"><Zap size={15} /><span>{def.name}</span><span className="source-ac">{def.supply === 'dc' ? 'DC' : 'AC'}</span></div>
    <div className="source-voltage">{c.voltage}<span>V</span><small>{def.supply !== 'dc' ? '50 Hz' : '稳压电源'}</small></div>
  </div>;
  if (!['breaker', 'buttonNO', 'buttonNC', 'lamp', 'motor'].includes(c.kind) && def.family !== 'contactor') {
    return <ExtendedDeviceVisual component={c} runtime={runtime} controls={controls} operating={operating} onOperate={onOperate} onTune={onTune} />;
  }
  if (c.kind === 'breaker') return <>
    <img className="device-photo breaker-photo" src={def.image} alt="三极断路器" draggable={false} />
    <div className="breaker-mark">C16 <span>400 V~</span></div>
    <button className={`breaker-toggle ${pressed ? 'on' : ''}`} title={`${c.name} ${pressed ? '分闸' : '合闸'}`}
      aria-label={`${c.name} ${pressed ? '分闸' : '合闸'}`} disabled={!operating} onClick={() => onOperate()}>
      <span>{pressed ? 'I · ON' : 'O · OFF'}</span>
    </button>
  </>;
  if (def.family === 'contactor') return <>
    <img className="device-photo contactor-photo" src={def.image} alt="交流接触器" draggable={false} />
    <span className={`contactor-indicator ${active ? 'energized' : ''}`} />
    <Actuator label={`${c.name} 手动吸合（按住）`} active={pressed} disabled={!operating} momentary
      className="contactor-plunger" onChange={(value) => onOperate(value)}><Hand size={21} /></Actuator>
    <div className="coil-plate">{def.coil?.supply.toUpperCase()} {c.voltage}V</div>
    <div className="auxiliary-block">
      {def.contacts?.some((contact) => contact.a === '13' && contact.b === '14') && <span>NO</span>}
      {def.contacts?.some((contact) => contact.a === '21' && contact.b === '22') && <span>NC</span>}
    </div>
  </>;
  if (c.kind === 'motor') return <>
    <div className="motor-terminal-block"><span>Y / Δ</span></div>
    <img className="device-photo motor-photo" src={def.image} alt="三相异步电动机" draggable={false} />
    <div className={`motor-shaft ${active ? 'spinning' : ''} ${reverse ? 'reverse' : ''}`}><RotateCw size={29} /></div>
  </>;
  if (c.kind === 'lamp') return <div className="pushbutton-housing lamp-housing">
    <div className={`lamp-lens ${active ? 'illuminated' : ''}`} /><span>{c.voltage}V~</span>
  </div>;
  const isNO = c.kind === 'buttonNO';
  return <div className={`pushbutton-housing ${isNO ? 'start-housing' : 'stop-housing'}`}>
    <button className={`pushbutton ${pressed ? 'pressed' : ''}`} aria-label={`${c.name} ${isNO ? '启动按钮' : '停止按钮'}`}
      title={`${c.name} ${def.name}`} disabled={!operating}
      onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); onOperate(true); }}
      onPointerUp={() => onOperate(false)} onPointerCancel={() => onOperate(false)}
      onLostPointerCapture={() => onOperate(false)}
      onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); onOperate(true); } }}
      onKeyUp={(event) => { if (event.key === ' ' || event.key === 'Enter') onOperate(false); }}
      onBlur={() => { if (pressed) onOperate(false); }}>
      {isNO ? 'I' : 'O'}
    </button>
    <span>{isNO ? 'START' : 'STOP'}</span>
  </div>;
}

function WirePath({ wire, project, index }: { wire: Wire; project: Project; index: number }) {
  const a = locateTerminal(project, wire.from);
  const b = locateTerminal(project, wire.to);
  if (!a || !b) return '';
  const escape = (terminal: string) => {
    const [id, pid] = terminal.split(':');
    const c = project.components.find((c) => c.id === id)!;
    const def = DEFINITIONS[c.kind];
    const p = def.ports.find((p) => p.id === pid)!;
    const right = p.x > def.width * 0.82 && ['contactor', 'motor'].includes(def.family ?? '');
    const target = right ? { ...p, x: def.width + 24 + index % 3 * 8 } :
      { ...p, y: p.y < def.height / 2 ? -22 - index % 3 * 8 : def.height + 22 + index % 3 * 8 };
    const angle = c.rotation * Math.PI / 180;
    const dx = target.x - def.width / 2;
    const dy = target.y - def.height / 2;
    return { x: c.x + def.width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle),
      y: c.y + def.height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle) };
  };
  const ae = escape(wire.from);
  const be = escape(wire.to);
  const mid = Math.round((ae.x + be.x) / 2);
  return `M ${a.x} ${a.y} L ${ae.x} ${ae.y} L ${mid} ${ae.y} L ${mid} ${be.y} L ${be.x} ${be.y} L ${b.x} ${b.y}`;
}

export default function App() {
  const [history, dispatch] = useReducer(historyReducer, undefined, () => ({ current: loadProject(), past: [], future: [] }));
  const project = history.current;
  const [selection, setSelection] = useState<Selection>({ type: 'component', id: 'contactor' });
  const [hiddenConnectionsFor, setHiddenConnectionsFor] = useState<string | null>(null);
  const [connectionFocus, setConnectionFocus] = useState<{ componentId: string; wireId: string } | null>(null);
  const [locateRequest, setLocateRequest] = useState<{ terminal: string } | null>(null);
  const [mode, setMode] = useState<Mode>('select');
  const [wireColor, setWireColor] = useState<WireColor>('auto');
  const [pendingTerminal, setPendingTerminal] = useState<string | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 0.8 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [running, setRunning] = useState(false);
  const [controls, setControls] = useState<Controls>({});
  const [runtime, setRuntime] = useState<Runtime>(emptyRuntime);
  const runtimeRef = useRef(runtime);
  const [showGrid, setShowGrid] = useState(true);
  const [showEnergized, setShowEnergized] = useState(true);
  const [libraryOpen, setLibraryOpen] = useState(() => window.innerWidth >= 760);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('通用类');
  const [modelFilter, setModelFilter] = useState('all');
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [menu, setMenu] = useState<'examples' | 'file' | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [cleanupScope, setCleanupScope] = useState<CleanupScope>('all');
  const [toast, setToast] = useState('');
  const [saveError, setSaveError] = useState(false);
  const [monitorOpen, setMonitorOpen] = useState(true);
  const [fitRevision, setFitRevision] = useState(0);
  const [viewMode, setViewMode] = useState<'wiring' | 'schematic' | 'split'>('wiring');
  const [exampleSearch, setExampleSearch] = useState('');
  const viewportRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const projectRef = useRef(project);
  projectRef.current = project;
  const edit = useCallback((next: Project) => { dispatch({ type: 'change', project: next }); }, []);
  const selectedComponent = selection?.type === 'component' ? project.components.find((c) => c.id === selection.id) : undefined;
  const selectedWire = selection?.type === 'wire' ? project.wires.find((w) => w.id === selection.id) : undefined;
  const connectionRows = useMemo(() => selectedComponent ? componentConnections(project, selectedComponent.id) : [],
    [project, selectedComponent]);
  const connectionsOpen = !!selectedComponent && hiddenConnectionsFor !== selectedComponent.id;
  const connectedWireIds = useMemo(() => new Set(connectionRows.flatMap((r) => r.connections.map((c) => c.wire.id))), [connectionRows]);
  const focusedWireId = connectionsOpen && connectionFocus?.componentId === selectedComponent?.id && connectedWireIds.has(connectionFocus?.wireId ?? '')
    ? connectionFocus?.wireId : undefined;
  const focusedWire = focusedWireId ? project.wires.find((w) => w.id === focusedWireId) : undefined;
  const focusedTerminals = new Set(focusedWire ? [focusedWire.from, focusedWire.to] : []);
  const displayProject = useMemo(() => drag?.type === 'component' ? {
    ...project, components: project.components.map((c) => c.id === drag.id ? { ...c, x: drag.x, y: drag.y } : c),
  } : project, [project, drag]);

  const fit = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const components = projectRef.current.components;
    if (!components.length) { setView({ x: 80, y: 80, scale: 0.8 }); return; }
    const minX = Math.min(...components.map((c) => c.x)) - 35;
    const minY = Math.min(...components.map((c) => c.y)) - 48;
    const maxX = Math.max(...components.map((c) => c.x + DEFINITIONS[c.kind].width)) + 35;
    const maxY = Math.max(...components.map((c) => c.y + DEFINITIONS[c.kind].height)) + 64;
    const scale = clamp(Math.min((el.clientWidth - 90) / (maxX - minX), (el.clientHeight - 100) / (maxY - minY)), 0.24, 1);
    setView({ x: (el.clientWidth - (maxX - minX) * scale) / 2 - minX * scale,
      y: (el.clientHeight - (maxY - minY) * scale) / 2 - minY * scale - 10, scale });
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(fit);
    const observer = new ResizeObserver(fit);
    if (viewportRef.current) observer.observe(viewportRef.current);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [fit, fitRevision]);
  useEffect(() => {
    if (!locateRequest || viewMode !== 'wiring') return;
    let frame = requestAnimationFrame(() => {
      // Wait for the pane and viewport resize before centering the terminal.
      frame = requestAnimationFrame(() => {
        const el = viewportRef.current;
        const position = locateTerminal(projectRef.current, locateRequest.terminal);
        if (el && position) setView((v) => {
          const scale = clamp(v.scale, 0.9, 1.2);
          return { x: el.clientWidth / 2 - position.x * scale, y: el.clientHeight / 2 - position.y * scale, scale };
        });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [locateRequest, viewMode]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(project)); setSaveError(false); }
    catch { setSaveError(true); }
  }, [project]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previous?.focus();
  }, [dialog]);
  useEffect(() => {
    if (!running) { setRuntime(emptyRuntime()); runtimeRef.current = emptyRuntime(); return; }
    const update = () => {
      const next = simulate(project, controls, runtimeRef.current);
      if (next.fault) { setToast(next.fault); setRunning(false); setControls({}); return; }
      const coilProblem = project.components.find((c) => {
        const issue = next.coilInputs[c.id]?.issue;
        return issue && issue !== 'open' && issue !== runtimeRef.current.coilInputs?.[c.id]?.issue;
      });
      if (coilProblem) {
        const input = next.coilInputs[coilProblem.id];
        setToast(`${coilProblem.name} ${input.message}：实际约 ${Math.round(input.voltage)} V，额定 ${coilProblem.voltage} V`);
      }
      runtimeRef.current = next;
      setRuntime(next);
    };
    update();
    const timer = setInterval(update, 80);
    return () => clearInterval(timer);
  }, [running, controls, project]);
  useEffect(() => {
    const release = () => setControls((previous) => Object.fromEntries(Object.entries(previous)
      .filter(([id]) => {
        const c = projectRef.current.components.find((c) => c.id === id.split('.')[0]);
        return c && DEFINITIONS[c.kind].operation !== 'momentary';
      })));
    window.addEventListener('blur', release);
    return () => window.removeEventListener('blur', release);
  }, []);
  const zoom = useCallback((factor: number, anchor?: { x: number; y: number }) => {
    const el = viewportRef.current;
    if (!el) return;
    const center = anchor ?? { x: el.clientWidth / 2, y: el.clientHeight / 2 };
    setView((v) => {
      const scale = clamp(v.scale * factor, 0.24, 2);
      return { x: center.x - (center.x - v.x) * scale / v.scale,
        y: center.y - (center.y - v.y) * scale / v.scale, scale };
    });
  }, []);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const rect = el.getBoundingClientRect();
        zoom(Math.exp(-event.deltaY * 0.005), { x: event.clientX - rect.left, y: event.clientY - rect.top });
      } else setView((v) => ({ ...v, x: v.x - event.deltaX, y: v.y - event.deltaY }));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [zoom]);

  const changeComponent = (patch: Partial<Component>) => {
    if (!selectedComponent || (running && !Object.keys(patch).every((key) => ['value', 'setpoint'].includes(key)))) return;
    edit({ ...project, components: project.components.map((c) => c.id === selectedComponent.id ? { ...c, ...patch } : c) });
  };
  const stopSimulation = () => { setRunning(false); setControls({}); setPendingTerminal(null); };
  const startSimulation = () => {
    if (!project.components.length) { setToast('请先添加电源和元件'); return; }
    const next = simulate(project, {});
    if (next.fault) { setToast(next.fault); return; }
    setPendingTerminal(null); setControls({}); setMode('select'); setRunning(true);
  };
  const deleteSelection = useCallback(() => {
    if (!selection || running) return;
    const next = selection.type === 'component' ? {
      ...project,
      components: project.components.filter((c) => c.id !== selection.id).map((c) => c.linkedTo === selection.id ? { ...c, linkedTo: '' } : c),
      wires: project.wires.filter((w) => !w.from.startsWith(`${selection.id}:`) && !w.to.startsWith(`${selection.id}:`)),
    } : { ...project, wires: project.wires.filter((w) => w.id !== selection.id) };
    edit(next); setSelection(null); setPendingTerminal(null);
  }, [selection, project, running, edit]);
  const duplicate = useCallback(() => {
    if (!selectedComponent || running) return;
    if (project.components.length >= 150) { setToast('当前工作区最多支持 150 个元件'); return; }
    const def = DEFINITIONS[selectedComponent.kind];
    const names = new Set(project.components.map((c) => c.name));
    let index = 1;
    while (names.has(`${def.prefix}${index}`)) index++;
    const copied = { ...selectedComponent, id: uid('c'), name: `${def.prefix}${index}`, x: selectedComponent.x + 40, y: selectedComponent.y + 40 };
    edit({ ...project, components: [...project.components, copied] }); setSelection({ type: 'component', id: copied.id });
  }, [selectedComponent, project, running, edit]);
  const exportProject = useCallback(() => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${project.name}.easysim.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast('工程文件已导出');
  }, [project]);
  const save = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(project)); setSaveError(false); setToast('工程已保存到此浏览器'); }
    catch { setSaveError(true); setToast('浏览器存储不可用，请导出工程文件'); }
  }, [project]);
  const load = (next: Project) => {
    stopSimulation(); dispatch({ type: 'replace', project: next }); setSelection(null); setDialog(null); setMode('select');
    if (next.wires.length) { setViewMode('split'); setLibraryOpen(false); }
    else { setViewMode('wiring'); setLibraryOpen(true); }
    setFitRevision((v) => v + 1); setToast('工程已载入');
  };
  const requestLoad = (next: Project) => {
    setMenu(null);
    if (project.components.length || project.wires.length) setDialog({ title: '替换当前工作区？', kind: 'replace', project: next });
    else load(next);
  };
  const requestCleanup = () => {
    if (running || (!project.components.length && !project.wires.length)) return;
    setMenu(null); setCleanupScope('all'); setDialog({ title: '清理当前画布？', kind: 'clear' });
  };
  const cleanup = () => {
    if (running || (cleanupScope === 'wires' && !project.wires.length)) return;
    dispatch({ type: 'clear', scope: cleanupScope });
    setSelection(null); setPendingTerminal(null); setDrag(null); setMode('select');
    setControls({}); setRuntime(emptyRuntime()); runtimeRef.current = emptyRuntime();
    setDialog(null);
    if (cleanupScope === 'all') { setViewMode('wiring'); setLibraryOpen(true); setFitRevision((v) => v + 1); }
    setToast(cleanupScope === 'all' ? '画布已清空，可通过撤销恢复' : '接线已清空，元件保留，可通过撤销恢复');
  };
  const navigateHistory = useCallback((type: 'undo' | 'redo') => {
    const target = type === 'undo' ? history.past.at(-1) : history.future[0];
    dispatch({ type }); setPendingTerminal(null);
    if (target && (!history.current.components.length || !target.components.length)) setFitRevision((v) => v + 1);
  }, [history]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;
      if (event.key === 'Escape') { setPendingTerminal(null); setSelection(null); setMenu(null); setDialog(null); }
      if (dialog) return;
      const ctrl = event.ctrlKey || event.metaKey;
      if (ctrl && event.key.toLowerCase() === 's') { event.preventDefault(); save(); }
      if (ctrl && event.key.toLowerCase() === 'o') { event.preventDefault(); if (!running) fileRef.current?.click(); }
      if (running) return;
      if (ctrl && event.key.toLowerCase() === 'z') { event.preventDefault(); navigateHistory(event.shiftKey ? 'redo' : 'undo'); }
      else if (ctrl && event.key.toLowerCase() === 'y') { event.preventDefault(); navigateHistory('redo'); }
      else if (ctrl && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicate(); }
      else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelection(); }
      else if (!ctrl && event.key.toLowerCase() === 'v') { setMode('select'); setPendingTerminal(null); }
      else if (!ctrl && event.key.toLowerCase() === 'w') setMode('wire');
      else if (!ctrl && event.key.toLowerCase() === 'h') { setMode('pan'); setPendingTerminal(null); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [running, dialog, duplicate, deleteSelection, save, navigateHistory]);

  const addComponent = (kind: Kind, position?: { x: number; y: number }) => {
    if (running) return;
    if (project.components.length >= 150) { setToast('当前工作区最多支持 150 个元件'); return; }
    const def = DEFINITIONS[kind];
    const names = new Set(project.components.map((c) => c.name));
    let index = 1;
    while (names.has(`${def.prefix}${index}`)) index++;
    const el = viewportRef.current;
    const center = position ?? { x: ((el?.clientWidth ?? 800) / 2 - view.x) / view.scale - def.width / 2,
      y: ((el?.clientHeight ?? 600) / 2 - view.y) / view.scale - def.height / 2 };
    const c = makeComponent(kind, uid('c'), `${def.prefix}${index}`, clamp(round(center.x), 0, 5000), clamp(round(center.y), 0, 5000));
    edit({ ...project, components: [...project.components, c] }); setSelection({ type: 'component', id: c.id }); setMode('select');
    if (window.innerWidth < 760) setLibraryOpen(false);
  };
  const clickTerminal = (c: Component, p: Port) => {
    if (running) { setSelection({ type: 'component', id: c.id }); setHiddenConnectionsFor(null); setConnectionFocus(null); return; }
    const terminal = terminalId(c.id, p.id);
    if (!pendingTerminal) { setPendingTerminal(terminal); setMode('wire'); return; }
    if (pendingTerminal === terminal) { setPendingTerminal(null); return; }
    if (project.wires.some((w) => (w.from === pendingTerminal && w.to === terminal) || (w.to === pendingTerminal && w.from === terminal))) {
      setToast('这两个端子已连接'); setPendingTerminal(null); return;
    }
    if (project.wires.length >= 1000) { setToast('当前工程最多支持 1000 根导线'); return; }
    edit({ ...project, wires: [...project.wires, { id: uid('w'), from: pendingTerminal, to: terminal, color: wireColor }] });
    setPendingTerminal(null);
  };
  const onComponentDown = (event: ReactPointerEvent, c: Component) => {
    if ((event.target as HTMLElement).closest('button')) return;
    event.stopPropagation();
    if (mode === 'pan') { beginPan(event); return; }
    setSelection({ type: 'component', id: c.id });
    setHiddenConnectionsFor(null); setConnectionFocus(null);
    if (running || mode === 'wire') return;
    viewportRef.current?.setPointerCapture(event.pointerId);
    setDrag({ type: 'component', id: c.id, sx: event.clientX, sy: event.clientY, x: c.x, y: c.y, ox: c.x, oy: c.y });
  };
  const beginPan = (event: ReactPointerEvent) => {
    viewportRef.current?.setPointerCapture(event.pointerId);
    setDrag({ type: 'pan', sx: event.clientX, sy: event.clientY, ox: view.x, oy: view.y });
  };
  const worldPoint = (clientX: number, clientY: number) => {
    const rect = viewportRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left - view.x) / view.scale, y: (clientY - rect.top - view.y) / view.scale };
  };
  const pointerMove = (event: ReactPointerEvent) => {
    if (pendingTerminal) setPointer(worldPoint(event.clientX, event.clientY));
    if (!drag) return;
    if (drag.type === 'pan') setView((v) => ({ ...v, x: drag.ox + event.clientX - drag.sx, y: drag.oy + event.clientY - drag.sy }));
    else setDrag({ ...drag, x: clamp(round(drag.ox + (event.clientX - drag.sx) / view.scale), 0, 5000),
      y: clamp(round(drag.oy + (event.clientY - drag.sy) / view.scale), 0, 5000) });
  };
  const endDrag = () => {
    if (drag?.type === 'component' && (drag.x !== drag.ox || drag.y !== drag.oy)) {
      edit({ ...project, components: project.components.map((c) => c.id === drag.id ? { ...c, x: drag.x, y: drag.y } : c) });
    }
    setDrag(null);
  };
  const wireStroke = (wire: Wire) => {
    if (wire.color !== 'auto') return WIRE_COLORS[wire.color];
    const potential = runtime.potentials[wire.from];
    if (running && potential) return PHASE_COLORS[potential.phase];
    const [id, p] = wire.from.split(':');
    const c = project.components.find((c) => c.id === id);
    const phase = c && DEFINITIONS[c.kind].ports.find((port) => port.id === p)?.phase;
    return phase ? PHASE_COLORS[phase] : '#667b86';
  };
  const componentStatus = (c: Component) => {
    const def = DEFINITIONS[c.kind];
    const active = !!runtime.outputs[c.id];
    if (def.capability === 'wiring') return '仅接线';
    if (def.supply) return '电源就绪';
    if (def.operation === 'trip') return controls[c.id] ? def.family === 'fuse' ? '已熔断' : '已跳闸' : '正常';
    if (def.family === 'breaker') return controls[c.id] ? '已合闸' : '已分闸';
    if (def.family === 'contactor') return controls[c.id] ? runtime.coils[c.id] ? '手动压合 · 线圈得电' : '手动吸合 · 线圈断电' :
      active ? '线圈得电 · 已吸合' : running ? runtime.coilInputs?.[c.id]?.message ?? '未吸合' : '未吸合';
    if (['relay', 'auxiliary'].includes(def.family ?? '')) return active ? '已吸合' : '未吸合';
    if (def.family === 'timer') return runtime.timers[c.id]?.done ? '延时到达' : runtime.coils[c.id] ? `计时 ${((runtime.timers[c.id]?.elapsed ?? 0) / 1000).toFixed(1)} / ${c.delay ?? 3}s` : '未计时';
    if (def.family === 'motor') return runtime.motors[c.id] === 'forward' ? '正转' : runtime.motors[c.id] === 'reverse' ? '反转' : '已停止';
    if (['lamp', 'tower'].includes(def.family ?? '')) return runtime.lamps[c.id] ? '已点亮' : '已熄灭';
    if (def.family === 'sensor') {
      if (running && def.coil && !runtime.coils[c.id]) return '未供电';
      if (c.kind === 'lightCurtain') return controls[c.id] ? '已遮挡' : '未遮挡';
      return controls[c.linkedTo || c.id] ? '已触发' : '未触发';
    }
    if (def.family === 'selector') return ['0 档 · 断开', 'I 档', 'II 档'][Number(controls[c.id] ?? 0)] ?? '断开';
    if (def.family === 'switch') return def.contacts?.some((contact) => contact.when === 'off') ?
      (active ? '已切换' : '初始位置') : active ? '开关已接通' : '全部断开';
    if (def.family === 'target') return controls[c.id] ? '物料到位' : '物料离开';
    if (def.family === 'heater') return active ? '已通电加热' : '未通电';
    if (def.family === 'valve') return active ? '已开启' : '已关闭';
    if (def.family === 'cylinder') return active ? '已伸出' : '已缩回';
    if (def.family === 'thermostat') return active ? '加热输出' : '未输出';
    if (def.family === 'meter') return runtime.readings[c.id] != null ? `${runtime.readings[c.id]!.toFixed(1)} ${def.unit}` : '待测';
    if (def.family === 'terminal' || (def.family === 'socket' && !def.operation)) return '直通端子';
    if (def.family === 'pushbutton') return controls[c.id] ? def.operation === 'toggle' ? '已锁定' : '已按下' : '已释放';
    return active ? '已通电' : '未通电';
  };
  const activeComponent = (c: Component) => !!runtime.outputs[c.id];
  const monitored = project.components.filter((c) => !['source', 'pushbutton', 'switch', 'selector', 'terminal', 'socket', 'target', 'potentiometer'].includes(DEFINITIONS[c.kind].family ?? ''));
  const libraryKinds = (Object.keys(DEFINITIONS) as Kind[]).filter((kind) => {
    const def = DEFINITIONS[kind];
    return (!!search.trim() || def.group === category) &&
      (modelFilter === 'all' || (def.capability ?? 'logic') === modelFilter) &&
      `${def.name} ${def.prefix} ${def.spec} ${def.group}`.toLowerCase().includes(search.trim().toLowerCase());
  });
  const pendingPosition = pendingTerminal && locateTerminal(displayProject, pendingTerminal);
  const diagnostics = runtime.warnings;
  const connectedCount = selectedComponent ? project.wires.filter((w) => w.from.startsWith(`${selectedComponent.id}:`) || w.to.startsWith(`${selectedComponent.id}:`)).length : 0;

  const operate = (id: string, value: boolean | number, channel?: string) => {
    if (!running) return;
    setControls((prev) => ({ ...prev, [channel ? `${id}.${channel}` : id]: value }));
  };
  const tune = (id: string, patch: Partial<Component>) => edit({
    ...project, components: project.components.map((c) => c.id === id ? { ...c, ...patch } : c),
  });
  const visibleExamples = CIRCUIT_EXAMPLES.filter((example) => `${example.name} ${example.tags}`.toLowerCase().includes(exampleSearch.trim().toLowerCase()));
  const focusConnection = (wireId?: string) => setConnectionFocus(selectedComponent && wireId ? { componentId: selectedComponent.id, wireId } : null);
  const locateConnection = (connection: TerminalConnection) => {
    focusConnection(connection.wire.id);
    setPendingTerminal(null);
    setViewMode('wiring');
    setLocateRequest({ terminal: connection.terminal });
  };

  return <div className={`app ${libraryOpen ? '' : 'library-hidden'} ${viewMode !== 'wiring' ? 'has-diagram' : ''} ${connectionsOpen ? 'connections-visible' : ''}`} onPointerDown={(event) => {
    if (!(event.target as HTMLElement).closest('[data-menu]')) setMenu(null);
  }}>
    <header className="app-header">
      <a className="brand" href="/" aria-label="EasySIM 工作台" onClick={(event) => event.preventDefault()}>
        <span className="brand-symbol"><CircuitBoard size={24} strokeWidth={1.8} /></span>
        <span>Easy<span className="brand-sim">SIM</span></span>
      </a>
      <span className="header-divider" />
      <span className="header-name">电工仿真工作台</span>
      <span className="version">PREVIEW 0.2</span>
      <div className="header-right">
        <span className="local-label"><span />本地工作区</span>
        <Tool icon={CircleHelp} label="关于 EasySIM" onClick={() => setDialog({ title: '关于 EasySIM', kind: 'about' })} />
        <span className="avatar">E</span>
      </div>
    </header>

    <div className="project-bar">
      <div className="project-file" data-menu>
        <button className="project-menu-button" onClick={() => setMenu(menu === 'file' ? null : 'file')} aria-label="工程菜单"><FolderOpen size={17} /><ChevronDown size={12} /></button>
        {menu === 'file' && <div className="dropdown file-dropdown">
          <button onClick={() => requestLoad({ version: 1, name: '未命名工程', components: [], wires: [] })}><FilePlus2 size={16} />新建工程</button>
          <button onClick={() => { fileRef.current?.click(); setMenu(null); }} disabled={running}><FolderOpen size={16} />打开工程</button>
          <button onClick={() => { save(); setMenu(null); }}><Save size={16} />保存工程</button>
          <button onClick={() => { exportProject(); setMenu(null); }}><ArrowDownToLine size={16} />导出工程</button>
          <button className="cleanup-menu-item" onClick={requestCleanup} disabled={running || (!project.components.length && !project.wires.length)}><Eraser size={16} />清理画布</button>
        </div>}
        <input className="project-name" aria-label="工程名称" value={project.name} maxLength={80} disabled={running}
          onChange={(event) => edit({ ...project, name: event.target.value || '未命名工程' })} />
        <span className={`save-state ${saveError ? 'save-warning' : ''}`}><CheckCheck size={13} /><span>{saveError ? '未保存' : '已保存'}</span></span>
      </div>
      <div className="project-actions">
        <div data-menu className="example-menu">
          <button className="text-button examples-button" onClick={() => setMenu(menu === 'examples' ? null : 'examples')} disabled={running}><BookOpen size={16} /><span>示例电路</span><ChevronDown size={12} /></button>
          {menu === 'examples' && <div className="dropdown examples-dropdown">
            <div className="examples-heading"><strong>示例电路</strong><span>{CIRCUIT_EXAMPLES.length} 个</span></div>
            <div className="example-search"><Search size={14} /><input aria-label="搜索示例电路" placeholder="搜索电路..." value={exampleSearch} onChange={(event) => setExampleSearch(event.target.value)} /></div>
            {[...new Set(visibleExamples.map((example) => example.category))].map((group) => <div key={group}>
              <span className="dropdown-caption">{group}</span>
              {visibleExamples.filter((example) => example.category === group).map((example) =>
                <button key={example.id} aria-label={example.name} className="example-choice" onClick={() => requestLoad(example.create())}>
                  <CircuitBoard size={16} /><span><strong>{example.name}</strong><small>{example.tags}</small></span><ArrowRight size={14} />
                </button>)}
            </div>)}
            {!visibleExamples.length && <span className="dropdown-caption">没有匹配的电路</span>}
            <button onClick={() => requestLoad(initialProject())}><Unplug size={16} />未接线元件工作区</button>
          </div>}
        </div>
        <span className="toolbar-separator" />
        <Tool icon={FolderOpen} label="打开工程" disabled={running} onClick={() => fileRef.current?.click()} />
        <Tool icon={Save} label="保存工程 (Ctrl+S)" onClick={save} />
        <button className="text-button export-button" onClick={exportProject}><ArrowDownToLine size={16} /><span>导出工程</span></button>
      </div>
    </div>

    <div className="workspace-toolbar">
      <div className="editing-tools">
        <Tool icon={libraryOpen ? PanelLeftClose : PanelLeftOpen} label="切换元件库" onClick={() => setLibraryOpen(!libraryOpen)} />
        <span className="toolbar-separator" />
        <div className="mode-switch" role="group" aria-label="编辑工具">
          <Tool icon={MousePointer2} label="选择 (V)" active={mode === 'select'} onClick={() => { setMode('select'); setPendingTerminal(null); }} />
          <Tool icon={Waypoints} label="导线连接 (W)" active={mode === 'wire'} disabled={running} onClick={() => setMode('wire')} />
          <Tool icon={Hand} label="平移 (H)" active={mode === 'pan'} onClick={() => { setMode('pan'); setPendingTerminal(null); }} />
        </div>
        <span className="toolbar-separator" />
        <Tool icon={Undo2} label="撤销 (Ctrl+Z)" disabled={running || !history.past.length} onClick={() => navigateHistory('undo')} />
        <Tool icon={Redo2} label="重做 (Ctrl+Y)" disabled={running || !history.future.length} onClick={() => navigateHistory('redo')} />
        <Tool icon={Eraser} label="清理画布" className="danger-tool" disabled={running || (!project.components.length && !project.wires.length)} onClick={requestCleanup} />
        <span className="toolbar-separator optional-separator" />
        <div className="wire-palette" aria-label="导线颜色">
          <button className={`auto-color ${wireColor === 'auto' ? 'selected' : ''}`} aria-label="自动导线颜色" title="自动导线颜色" disabled={running} onClick={() => setWireColor('auto')}><Circle size={13} strokeDasharray="2 2" /></button>
          {(Object.keys(WIRE_COLORS) as Exclude<WireColor, 'auto'>[]).map((color) => <button key={color}
            style={{ '--swatch': WIRE_COLORS[color] } as CSSProperties} className={`color-swatch ${wireColor === color ? 'selected' : ''}`}
            aria-label={`${({ yellow: '黄色', green: '绿色', red: '红色', blue: '蓝色', black: '黑色' })[color]}导线`}
            title={`${({ yellow: '黄色', green: '绿色', red: '红色', blue: '蓝色', black: '黑色' })[color]}导线`}
            disabled={running} onClick={() => setWireColor(color)} />)}
        </div>
      </div>
      <div className="simulation-tools">
        <button className="text-button check-button" disabled={running} onClick={() => setDialog({ title: '电路检查', kind: 'check', lines: checkProject(project) })}><ShieldCheck size={16} /><span>检查电路</span></button>
        <span className="toolbar-separator" />
        <button className={`run-button ${running ? 'running' : ''}`} onClick={running ? stopSimulation : startSimulation}>
          {running ? <Square size={14} fill="currentColor" /> : <Play size={15} fill="currentColor" />}<span>{running ? '停止仿真' : '开始仿真'}</span>
        </button>
      </div>
    </div>

    <main className="workspace">
      <aside className="library" aria-label="元件库">
        <div className="panel-heading"><div><Layers2 size={16} /><h2>元件库</h2></div><span>{Object.keys(DEFINITIONS).length}</span></div>
        <div className="search-field"><Search size={15} /><input aria-label="搜索元件" placeholder="搜索元件..." value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌕</kbd></div>
        <div className="library-tabs" role="tablist" aria-label="元件分类">
          {LIBRARY_GROUPS.map((item) => <button key={item} role="tab" aria-label={item} title={item} aria-selected={category === item}
            onClick={() => { setCategory(item); setSearch(''); }}>{item.replace('类', '').replace('控件', '')}<small>{Object.values(DEFINITIONS).filter((def) => def.group === item).length}</small></button>)}
        </div>
        <div className="library-filter"><span>{search.trim() ? '全库检索' : category} · {libraryKinds.length}</span><select aria-label="元件模型筛选" value={modelFilter} onChange={(event) => setModelFilter(event.target.value)}><option value="all">全部模型</option><option value="logic">逻辑仿真</option><option value="wiring">仅接线</option></select></div>
        <div className="library-content">
          {[...new Set(libraryKinds.map((kind) => DEFINITIONS[kind].category))].map((group) => {
            const kinds = libraryKinds.filter((kind) => DEFINITIONS[kind].category === group);
            if (!kinds.length) return null;
            return <section className="library-group" key={group}>
              <button className="group-heading" onClick={() => setCollapsed((prev) => prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group])} aria-expanded={!collapsed.includes(group)}>
                {collapsed.includes(group) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}<span>{group}</span><small>{kinds.length}</small>
              </button>
              {!collapsed.includes(group) && <div className="library-items">{kinds.map((kind) => <button className={`library-item ${DEFINITIONS[kind].capability === 'wiring' ? 'wiring-only-item' : ''}`} key={kind} draggable={!running}
                disabled={running} onClick={() => addComponent(kind)} title={`添加${DEFINITIONS[kind].name} · ${DEFINITIONS[kind].group}${DEFINITIONS[kind].capability === 'wiring' ? ' · 仅接线' : ''}`}
                onDragStart={(event) => { event.dataTransfer.setData('application/easysim-component', kind); event.dataTransfer.effectAllowed = 'copy'; }}>
                <div className="miniature-frame"><Miniature kind={kind} /></div>
                <div className="library-item-text"><span>{DEFINITIONS[kind].name}</span><small>{DEFINITIONS[kind].capability === 'wiring' ? '仅接线' : DEFINITIONS[kind].family === 'contactor' ? DEFINITIONS[kind].spec : DEFINITIONS[kind].spec.split(' · ')[0]}</small></div>
              </button>)}</div>}
            </section>;
          })}
          {!libraryKinds.length && <div className="empty-search"><Search size={24} /><span>没有匹配的元件</span></div>}
        </div>
        <div className="library-bottom"><span className="library-bottom-icon"><CircuitBoard size={19} /></span><div><strong>电工与工控元件</strong><small>{Object.values(DEFINITIONS).filter((def) => def.capability !== 'wiring').length} 个逻辑模型 · {Object.values(DEFINITIONS).filter((def) => def.capability === 'wiring').length} 个接线模型</small></div><ShieldCheck size={15} /></div>
      </aside>

      <section className="work-area">
        <div className="canvas-tabbar">
          <div className="view-tabs" role="tablist" aria-label="电路视图">
            <button role="tab" aria-selected={viewMode === 'wiring'} aria-label="实物接线" onClick={() => setViewMode('wiring')}><CircuitBoard size={14} /><span>实物接线</span></button>
            <button role="tab" aria-selected={viewMode === 'schematic'} aria-label="原理图" onClick={() => { setViewMode('schematic'); setPendingTerminal(null); }}><Waypoints size={14} /><span>原理图</span></button>
            <button role="tab" aria-selected={viewMode === 'split'} aria-label="联动视图" onClick={() => { setViewMode('split'); setPendingTerminal(null); }}><Columns2 size={14} /><span>联动</span></button>
          </div>
          <div className="canvas-info"><span>{project.components.length} 个元件</span><i /><span>{project.wires.length} 根导线</span></div>
          <Tool icon={Unplug} label="接线明细" active={connectionsOpen} disabled={!selectedComponent} aria-pressed={connectionsOpen}
            onClick={() => { setHiddenConnectionsFor(connectionsOpen ? selectedComponent!.id : null); setConnectionFocus(null); }} />
          <Tool icon={Grid2X2} label="显示网格" active={showGrid} onClick={() => setShowGrid(!showGrid)} />
          <Tool icon={Maximize} label="适应画布" onClick={fit} />
        </div>
        <div className="workbench-body">
        <div className={`circuit-views view-${viewMode} ${focusedWireId ? 'single-connection' : ''}`}>
        <div className={`canvas-viewport mode-${mode} ${drag ? 'is-dragging' : ''} ${showGrid ? 'grid-visible' : ''}`} ref={viewportRef}
          aria-label="电路接线画布"
          style={{ '--grid-size': `${20 * view.scale}px`, '--grid-x': `${view.x}px`, '--grid-y': `${view.y}px` } as CSSProperties}
          onPointerDown={(event) => {
            if (event.button === 1 || mode === 'pan') { event.preventDefault(); beginPan(event); return; }
            setSelection(null);
            if (pendingTerminal) setPendingTerminal(null);
          }}
          onPointerMove={pointerMove} onPointerUp={endDrag} onPointerCancel={() => setDrag(null)}
          onDragOver={(event) => { if (!running) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }}
          onDrop={(event) => {
            event.preventDefault();
            const kind = event.dataTransfer.getData('application/easysim-component') as Kind;
            if (Object.hasOwn(DEFINITIONS, kind)) addComponent(kind, worldPoint(event.clientX, event.clientY));
          }}>
          <div className="canvas-watermark"><CircuitBoard size={14} /><span>EasySIM</span></div>
          {running && <div className="live-badge"><span />仿真运行中</div>}
          <div className="canvas-stage" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
            <svg className="wires-layer" width={6500} height={6500} aria-label="导线">
              {displayProject.wires.map((wire, index) => {
                const path = WirePath({ wire, project: displayProject, index });
                const energized = running && showEnergized && !!runtime.potentials[wire.from] && !['N', 'PE', '-'].includes(runtime.potentials[wire.from].phase);
                const related = connectionsOpen && connectedWireIds.has(wire.id);
                return <g key={wire.id} className={`wire-group ${selection?.type === 'wire' && selection.id === wire.id ? 'wire-selected' : ''} ${energized ? 'wire-energized' : ''} ${related ? 'wire-related' : connectionsOpen ? 'wire-unrelated' : ''} ${focusedWireId === wire.id ? 'wire-focused' : ''}`}>
                  {related && <path d={path} className="wire-connection-halo" />}
                  {selection?.id === wire.id && <path d={path} className="wire-selection" />}
                  <path d={path} className="wire-outline" />
                  <path d={path} stroke={wireStroke(wire)} className="wire-line" />
                  {energized && <path d={path} className="wire-flow" />}
                  <path d={path} className="wire-hit" role="button" aria-label={`导线 ${index + 1} ${wire.from} 到 ${wire.to}`} tabIndex={0}
                    onPointerDown={(event) => { event.stopPropagation(); setSelection({ type: 'wire', id: wire.id }); }}
                    onKeyDown={(event) => { if (event.key === 'Enter') setSelection({ type: 'wire', id: wire.id }); }} />
                </g>;
              })}
              {pendingPosition && <path className="pending-wire" d={`M ${pendingPosition.x} ${pendingPosition.y} L ${pendingPosition.x} ${pointer.y} L ${pointer.x} ${pointer.y}`} />}
            </svg>
            {displayProject.components.map((c) => {
              const def = DEFINITIONS[c.kind];
              const active = activeComponent(c);
              const connectionTarget = !!focusedWire && [focusedWire.from, focusedWire.to].some((t) => t.startsWith(`${c.id}:`));
              return <div key={c.id} className={`component kind-${c.kind} family-${def.family} ${def.capability === 'wiring' ? 'wiring-component' : ''} ${selection?.type === 'component' && selection.id === c.id ? 'component-selected' : ''} ${connectionTarget ? 'component-connection-target' : ''} ${active ? 'component-active' : ''}`}
                style={{ left: c.x, top: c.y, width: def.width, height: def.height, transform: `rotate(${c.rotation}deg)` }}
                onPointerDown={(event) => onComponentDown(event, c)} role="group" aria-label={`${c.name} ${def.name}`}>
                <div className="component-caption" title={`${c.name} · ${def.name}`}><span>{c.name}</span><small>{def.name}</small></div>
                <ComponentVisual component={c} active={active} operating={running} pressed={!!controls[c.id]}
                  reverse={runtime.motors[c.id] === 'reverse'}
                  runtime={runtime} controls={controls}
                  onTune={(value) => edit({ ...project, components: project.components.map((item) => item.id === c.id ? { ...item, value } : item) })}
                  onOperate={(pressed, channel) => {
                    if (!running) return;
                    const id = channel ? `${c.id}.${channel}` : c.id;
                    setControls((prev) => ({ ...prev, [id]: pressed ?? !prev[id] }));
                  }} />
                {def.ports.map((p) => {
                  const terminal = terminalId(c.id, p.id);
                  const potential = runtime.potentials[terminal];
                  const connected = project.wires.some((w) => w.from === terminal || w.to === terminal);
                  return <button key={p.id} className={`terminal ${def.family === 'contactor' && ['13', '14', '21', '22'].includes(p.id) ? 'auxiliary-terminal' : ''} ${connected ? 'connected' : ''} ${pendingTerminal === terminal ? 'pending' : ''} ${potential ? 'live-terminal' : ''} ${focusedTerminals.has(terminal) ? 'terminal-inspected' : ''}`}
                    aria-label={`${c.name} 端子 ${p.id}`} title={`${c.name} · ${p.label}${connected ? ' · 已接线' : ''}`}
                    style={{ left: p.x, top: p.y, '--terminal-color': p.phase ? PHASE_COLORS[p.phase] : potential ? PHASE_COLORS[potential.phase] : '#8c9694' } as CSSProperties}
                    onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setPointer(portPosition(c, p.id)); clickTerminal(c, p); }}>
                    <span className="terminal-screw" /><span className="terminal-label">{p.id}</span>
                  </button>;
                })}
                <div className={`component-state ${active ? 'state-active' : ''}`}><span />{c.kind === 'source3' ? `AC ${c.voltage} / ${Math.round(c.voltage / Math.sqrt(3))} V · 50 Hz` :
                  c.kind === 'source1' ? `AC ${c.voltage} V · 50 Hz` : def.supply === 'dc' ? `DC ${c.voltage} V` : componentStatus(c)}</div>
              </div>;
            })}
          </div>
          {!project.components.length && <div className="empty-canvas"><CircuitBoard size={40} strokeWidth={1} /><h3>{project.name}</h3><button className="text-button" onClick={() => load(exampleProject())}><BookOpen size={16} />打开自锁控制示例<ArrowRight size={15} /></button></div>}
          <div className="canvas-bottom-tools">
            <div className="canvas-mode-label">{mode === 'select' ? <MousePointer2 size={14} /> : mode === 'wire' ? <Waypoints size={14} /> : <Hand size={14} />}<span>{pendingTerminal ? '连接中' : mode === 'select' ? '选择' : mode === 'wire' ? '接线' : '平移'}</span></div>
            <div className="zoom-control"><Tool icon={Minus} label="缩小" onClick={() => zoom(1 / 1.15)} /><button className="zoom-percentage" title="适应画布" onClick={fit}>{Math.round(view.scale * 100)}%</button><Tool icon={Plus} label="放大" onClick={() => zoom(1.15)} /><span /><Tool icon={Maximize} label="缩放至全部元件" onClick={fit} /></div>
          </div>
        </div>
        {viewMode !== 'wiring' && <SchematicView project={project} runtime={runtime} controls={controls} running={running}
          selected={selection?.type === 'component' ? selection.id : undefined} showEnergized={showEnergized}
          onSelect={(id) => { setSelection({ type: 'component', id }); setHiddenConnectionsFor(null); setConnectionFocus(null); }} onOperate={operate} onTune={tune} />}
        </div>
        {connectionsOpen && selectedComponent && <ConnectionPanel key={selectedComponent.id} component={selectedComponent} rows={connectionRows}
          focusedWire={focusedWireId} onFocus={focusConnection} onLocate={locateConnection}
          onClose={() => { setHiddenConnectionsFor(selectedComponent.id); setConnectionFocus(null); }} />}
        </div>
        <div className={`monitor ${monitorOpen ? '' : 'monitor-collapsed'}`}>
          <div className="monitor-heading">
            <button onClick={() => setMonitorOpen(!monitorOpen)}><Activity size={15} /><span>运行监视</span><ChevronDown size={13} style={{ transform: monitorOpen ? '' : 'rotate(180deg)' }} /></button>
            <span className={`monitor-status ${running ? 'status-live' : ''}`}><span />{running ? '实时更新' : '仿真已停止'}</span>
          </div>
          {monitorOpen && <div className="monitor-content">
            {monitored.length ? monitored.map((c) => <div className={`monitor-item ${activeComponent(c) ? 'monitor-active' : ''}`} key={c.id}>
              <span className="monitor-icon"><FamilyIcon family={DEFINITIONS[c.kind].family} size={19} /></span>
              <div><strong>{c.name}<small>{DEFINITIONS[c.kind].name.replace('三相异步电动机', '三相电机')}</small></strong><span><i />{componentStatus(c)}</span>
                {running && runtime.coilInputs?.[c.id] && <small className={`coil-reading ${runtime.coilInputs[c.id].issue && runtime.coilInputs[c.id].issue !== 'open' ? 'coil-reading-error' : ''}`}>
                  {DEFINITIONS[c.kind].coil!.a}-{DEFINITIONS[c.kind].coil!.b}：{Math.round(runtime.coilInputs[c.id].voltage)} V / 额定 {c.voltage} V
                </small>}</div>
            </div>) : <span className="monitor-empty">无监视元件</span>}
          </div>}
          {monitorOpen && running && diagnostics.length > 0 && <div className="runtime-warnings"><ShieldCheck size={13} />{diagnostics.join('；')}</div>}
        </div>
      </section>

      <aside className="inspector" aria-label="属性面板">
        <div className="panel-heading"><div><Settings2 size={16} /><h2>{selectedWire ? '导线属性' : selectedComponent ? '元件属性' : '工程概览'}</h2></div><Tool icon={MoreHorizontal} label="查看工程信息" onClick={() => setDialog({ title: '关于 EasySIM', kind: 'about' })} /></div>
        {selectedComponent ? <>
          <div className="inspector-identity">
            <div className="inspector-thumbnail"><Miniature kind={selectedComponent.kind} /></div>
            <div><strong>{DEFINITIONS[selectedComponent.kind].name}</strong><span>{selectedComponent.name}<span className="identity-separator">/</span>{DEFINITIONS[selectedComponent.kind].group}</span></div>
          </div>
          <div className={`model-capability ${DEFINITIONS[selectedComponent.kind].capability === 'wiring' ? 'wiring-capability' : ''}`}>
            <ShieldCheck size={13} /><span>{DEFINITIONS[selectedComponent.kind].capability === 'wiring' ? '仅接线模型' : '逻辑仿真模型'}</span>
            {DEFINITIONS[selectedComponent.kind].limitation && <button title={DEFINITIONS[selectedComponent.kind].limitation} aria-label="模型限制" onClick={() => setDialog({ title: '模型限制', kind: 'about', lines: [DEFINITIONS[selectedComponent.kind].limitation!] })}><CircleHelp size={13} /></button>}
          </div>
          <section className="property-section"><h3>基本信息</h3>
            <label className="property-row"><span>元件标识</span><input aria-label="元件标识" value={selectedComponent.name} maxLength={32} disabled={running} onChange={(event) => changeComponent({ name: event.target.value })} /></label>
            <div className="property-row"><span>元件类型</span><span className="property-value">{DEFINITIONS[selectedComponent.kind].name.replace('三相异步电动机', '三相电机')}</span></div>
            <div className="property-row"><span>运行状态</span><span className={`status-value ${activeComponent(selectedComponent) ? 'on' : ''}`}><i />{componentStatus(selectedComponent)}</span></div>
          </section>
          <section className="property-section"><h3>电气参数</h3>
            <label className="property-row"><span>{DEFINITIONS[selectedComponent.kind].coil ? '线圈电压' : '额定电压'}</span><div className="voltage-input"><input type="number" aria-label="额定电压" min={1} max={1000} value={selectedComponent.voltage} disabled={running || DEFINITIONS[selectedComponent.kind].family === 'motor' || DEFINITIONS[selectedComponent.kind].family === 'breaker'}
              onChange={(event) => { const voltage = Number(event.target.value); if (voltage >= 1 && voltage <= 1000) changeComponent({ voltage }); }} /><span>V</span></div></label>
            {running && runtime.coilInputs?.[selectedComponent.id] && <div className="property-row"><span>线圈实际电压</span><span className="property-value">{Math.round(runtime.coilInputs[selectedComponent.id].voltage)} V</span></div>}
            <div className="property-row"><span>端子数量</span><span className="property-value">{DEFINITIONS[selectedComponent.kind].ports.length} 个</span></div>
            <div className="property-row"><span>已接导线</span><span className="property-value">{connectedCount} 根</span></div>
            {DEFINITIONS[selectedComponent.kind].coil && <div className="contact-map"><span>线圈端子<strong>{DEFINITIONS[selectedComponent.kind].coil!.a} / {DEFINITIONS[selectedComponent.kind].coil!.b}</strong></span><span>电源类型<strong>{DEFINITIONS[selectedComponent.kind].coil!.supply.toUpperCase()}</strong></span></div>}
            {DEFINITIONS[selectedComponent.kind].family === 'timer' && <label className="property-row"><span>通电延时</span><div className="voltage-input"><input type="number" aria-label="通电延时秒数" min={0.1} max={3600} step={0.1} value={selectedComponent.delay ?? 3} disabled={running} onChange={(event) => { const delay = Number(event.target.value); if (delay >= 0.1 && delay <= 3600) changeComponent({ delay }); }} /><span>s</span></div></label>}
            {DEFINITIONS[selectedComponent.kind].family === 'potentiometer' && <label className="property-row"><span>调节位置</span><div className="voltage-input"><input type="number" aria-label="调节位置" min={0} max={100} value={selectedComponent.value ?? 50} onChange={(event) => changeComponent({ value: clamp(Number(event.target.value), 0, 100) })} /><span>%</span></div></label>}
            {DEFINITIONS[selectedComponent.kind].family === 'thermostat' && <><label className="property-row"><span>输入温度</span><input type="number" aria-label="输入温度" min={-100} max={1000} value={selectedComponent.value ?? 25} onChange={(event) => changeComponent({ value: clamp(Number(event.target.value), -100, 1000) })} /></label><label className="property-row"><span>目标温度</span><input type="number" aria-label="目标温度" min={-100} max={1000} value={selectedComponent.setpoint ?? 30} onChange={(event) => changeComponent({ setpoint: clamp(Number(event.target.value), -100, 1000) })} /></label></>}
            {DEFINITIONS[selectedComponent.kind].follow && <label className="property-row"><span>{DEFINITIONS[selectedComponent.kind].follow === 'coil' ? '关联线圈' : '关联物料'}</span><select aria-label="关联元件" value={selectedComponent.linkedTo ?? ''} disabled={running} onChange={(event) => changeComponent({ linkedTo: event.target.value })}><option value="">{DEFINITIONS[selectedComponent.kind].follow === 'coil' ? '未关联' : '手动触发'}</option>{project.components.filter((c) => c.id !== selectedComponent.id && (DEFINITIONS[selectedComponent.kind].follow === 'coil' ? !!DEFINITIONS[c.kind].coil && DEFINITIONS[c.kind].capability !== 'wiring' : DEFINITIONS[c.kind].family === 'target')).map((c) => <option value={c.id} key={c.id}>{c.name} · {DEFINITIONS[c.kind].name}</option>)}</select></label>}
          </section>
          <section className="property-section terminal-section"><div className="section-heading"><h3>端子状态</h3><span>{DEFINITIONS[selectedComponent.kind].ports.length}</span></div>
            <div className="terminal-list">{DEFINITIONS[selectedComponent.kind].ports.map((p) => {
              const terminal = terminalId(selectedComponent.id, p.id);
              const wires = project.wires.filter((w) => w.from === terminal || w.to === terminal);
              const coil = DEFINITIONS[selectedComponent.kind].coil;
              return <div className="terminal-row" key={p.id}><span className="port-id">{p.id}</span><span>{coil && [coil.a, coil.b].includes(p.id) ? '线圈 / 电源' : p.label.includes('NO') ? '常开触点' : p.label.includes('NC') ? '常闭触点' : p.phase === 'PE' || p.id === 'PE' ? '保护接地' : p.id === 'N' ? '中性线' : '接线端子'}</span><span className={wires.length ? 'port-connected' : 'port-unconnected'}>{wires.length ? <><i />已连接</> : '未连接'}</span></div>;
            })}</div>
          </section>
          <section className="property-section position-section"><h3>画布位置</h3><div className="position-inputs">
            <label><span>X</span><input type="number" aria-label="元件 X 坐标" value={selectedComponent.x} min={0} max={5000} disabled={running} onChange={(event) => changeComponent({ x: clamp(Number(event.target.value), 0, 5000) })} /></label>
            <label><span>Y</span><input type="number" aria-label="元件 Y 坐标" value={selectedComponent.y} min={0} max={5000} disabled={running} onChange={(event) => changeComponent({ y: clamp(Number(event.target.value), 0, 5000) })} /></label>
          </div></section>
          <div className="selection-actions"><Tool icon={RotateCw} label="旋转元件" disabled={running} onClick={() => changeComponent({ rotation: (selectedComponent.rotation + 90) % 360 })} /><Tool icon={Copy} label="复制元件 (Ctrl+D)" disabled={running} onClick={duplicate} /><span /><Tool icon={Trash2} label="删除元件" className="danger-tool" disabled={running} onClick={deleteSelection} /></div>
        </> : selectedWire ? <>
          <div className="wire-identity"><Waypoints size={28} /><strong>连接导线</strong><span>{selectedWire.from}<ArrowDownToLine size={13} />{selectedWire.to}</span></div>
          <section className="property-section"><h3>导线设置</h3><label className="property-row"><span>线色</span><select value={selectedWire.color} disabled={running} aria-label="所选导线颜色" onChange={(event) => edit({ ...project, wires: project.wires.map((w) => w.id === selectedWire.id ? { ...w, color: event.target.value as WireColor } : w) })}>
            <option value="auto">自动</option><option value="yellow">黄色</option><option value="green">绿色</option><option value="red">红色</option><option value="blue">蓝色</option><option value="black">黑色</option>
          </select></label><div className="property-row"><span>导线状态</span><span className="property-value">{runtime.potentials[selectedWire.from] ? '已带电' : '未带电'}</span></div></section>
          <div className="selection-actions"><Tool icon={Trash2} label="删除导线" className="danger-tool" disabled={running} onClick={deleteSelection} /></div>
        </> : <>
          <div className="overview-identity"><CircuitBoard size={32} strokeWidth={1.3} /><strong>{project.name}</strong><span>接线工程 / 本地</span></div>
          <section className="property-section"><h3>工程统计</h3><div className="property-row"><span>元件</span><span>{project.components.length} 个</span></div><div className="property-row"><span>导线</span><span>{project.wires.length} 根</span></div><div className="property-row"><span>端子</span><span>{project.components.reduce((n, c) => n + DEFINITIONS[c.kind].ports.length, 0)} 个</span></div></section>
          <section className="property-section"><h3>工程操作</h3><button className="overview-action" onClick={() => setDialog({ title: '电路检查', kind: 'check', lines: checkProject(project) })}><ShieldCheck size={17} />检查电路<ChevronRight size={14} /></button><button className="overview-action" onClick={exportProject}><ArrowDownToLine size={17} />导出工程<ChevronRight size={14} /></button></section>
        </>}
        <div className="inspector-footer"><label><input type="checkbox" checked={showEnergized} onChange={(event) => setShowEnergized(event.target.checked)} /><Zap size={14} /><span>显示带电状态</span></label></div>
      </aside>
    </main>
    <footer className="statusbar">
      <div><span className={`global-status-dot ${running ? 'live' : ''}`} /><strong>{running ? '仿真运行中' : '就绪'}</strong><span className="statusbar-divider" /><span className="statusbar-mode">{pendingTerminal ? `连接：${pendingTerminal}` : '逻辑仿真'}</span></div>
      <div className="statusbar-center"><ShieldCheck size={12} /><span>教学仿真 · 非施工依据</span></div>
      <div><span>本地存储</span><span className="statusbar-divider" /><span>EasySIM 0.2</span></div>
    </footer>

    <input ref={fileRef} type="file" hidden accept=".json,.easysim" aria-label="导入工程文件" onChange={async (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      if (file.size > 2_000_000) { setToast('工程文件不能超过 2 MB'); return; }
      try { const next = parseProject(await file.text()); requestLoad(next); }
      catch (error) { setToast(error instanceof Error ? error.message : '无法读取工程'); }
    }} />
    {toast && <div className="toast" role="status"><CircleHelp size={17} /><span>{toast}</span><button aria-label="关闭通知" onClick={() => setToast('')}><X size={14} /></button></div>}
    {dialog && <div className="modal-backdrop" onPointerDown={() => setDialog(null)}>
      <section className="dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-label={dialog.title} onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
          const first = buttons[0];
          const last = buttons[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}>
        <div className="dialog-heading"><h2>{dialog.title}</h2><Tool icon={X} label="关闭对话框" onClick={() => setDialog(null)} /></div>
        {dialog.kind === 'clear' ? <>
          <fieldset className="cleanup-options"><legend>清理范围</legend>
            <label><input type="radio" name="cleanup-scope" value="wires" checked={cleanupScope === 'wires'} disabled={!project.wires.length} onChange={() => setCleanupScope('wires')} />
              <span><strong>只清空接线</strong><small>移除 {project.wires.length} 根导线，保留所有元件及参数</small></span></label>
            <label><input type="radio" name="cleanup-scope" value="all" checked={cleanupScope === 'all'} onChange={() => setCleanupScope('all')} />
              <span><strong>清空全部</strong><small>移除 {project.components.length} 个元件和 {project.wires.length} 根导线</small></span></label>
          </fieldset>
          <p>保留工程名称。清理后可通过撤销恢复，已导出的工程文件不受影响。</p>
          <div className="dialog-actions"><button className="text-button" onClick={exportProject}><ArrowDownToLine size={15} />导出备份</button>
            <button className="secondary-button" onClick={() => setDialog(null)}>取消</button>
            <button className="primary-button destructive-button" disabled={running || (cleanupScope === 'wires' && !project.wires.length)} onClick={cleanup}><Eraser size={15} />{cleanupScope === 'wires' ? '清空接线' : '清空画布'}</button></div>
        </> : dialog.kind === 'replace' ? <><p>将载入「{dialog.project?.name}」。当前工程可先导出备份，替换后也可通过撤销恢复。</p><div className="dialog-actions"><button className="text-button" onClick={exportProject}><ArrowDownToLine size={15} />导出当前工程</button><button className="secondary-button" onClick={() => setDialog(null)}>取消</button><button className="primary-button" onClick={() => dialog.project && load(dialog.project)}>载入工程</button></div></> :
          dialog.kind === 'check' ? <><div className={`check-summary ${dialog.lines?.length ? 'has-issues' : ''}`}><ShieldCheck size={27} /><div><strong>{dialog.lines?.length ? `发现 ${dialog.lines.length} 项待检查` : '基础接线检查通过'}</strong><span>静态接线与电源短接检查</span></div></div>
            {!!dialog.lines?.length && <ul className="check-list">{dialog.lines.map((line, index) => <li key={index}><Circle size={7} /><span>{line}</span></li>)}</ul>}
            <p className="check-disclaimer">通过检查不代表电路符合施工或安全规范。当前版本不计算真实电流、过载、接地故障电流或机械负载。</p>
            <div className="dialog-actions"><button className="primary-button" onClick={() => setDialog(null)}><Check size={15} />完成</button></div></> :
            dialog.lines ? <><p>{dialog.lines[0]}</p><p className="check-disclaimer">端子编号采用本软件的通用映射，不可直接套用到实物设备。仅供教学仿真，不作为施工依据。</p><div className="dialog-actions"><button className="primary-button" onClick={() => setDialog(null)}>关闭</button></div></> :
            <><div className="about-brand"><span className="brand-symbol"><CircuitBoard size={30} /></span><div><strong>EasySIM</strong><span>电工仿真工作台 · Preview 0.2</span></div></div><p>{Object.keys(DEFINITIONS).length} 种元件，分为电源、通用、交流与直流四类。元件按实际支持情况区分为逻辑仿真模型与仅接线模型。</p><p>变频器、软启动器、控制器、安全继电器、变压器及部分仪表当前仅支持端子接线，不模拟内部功能。不含精确电流、热学、机械或安全等级验证，也不兼容 ESim 专有工程格式。</p><p className="check-disclaimer">仅供学习与软件演示，不作为带电操作、选型或施工依据。未使用原软件源码或图片。</p><div className="dialog-actions"><button className="primary-button" onClick={() => setDialog(null)}>关闭</button></div></>}
      </section>
    </div>}
    <button className="mobile-back" aria-label="关闭元件库" onClick={() => setLibraryOpen(false)}><ArrowLeft size={18} /></button>
  </div>;
}
