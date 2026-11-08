import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Activity, Download, Hand, Maximize, Minus, Plus, Power, RotateCcw } from 'lucide-react';
import { DEFINITIONS, terminalId } from './model';
import type { Component, Project } from './model';
import { isContactClosed } from './simulation';
import type { Controls, Runtime } from './simulation';
import { branchConducting, buildSchematic, rungActive, terminalState } from './schematic';
import type { DiagramBranch, DiagramContact, DiagramRung } from './schematic';
import { FamilyIcon } from './DeviceVisual';
import { buildCircuitSheet, layoutCircuitSheet } from './schematicLayout';
import type { CircuitSheet } from './schematicLayout';
import type { Schematic } from './schematic';

function UnifiedCircuit({ sheet, diagram, runtime, controls, selected, onSelect }: {
  sheet: CircuitSheet; diagram: Schematic; runtime: Runtime; controls: Controls;
  selected?: string; onSelect: (id: string) => void;
}) {
  const flowingPorts = new Set<string>();
  for (const rung of diagram.rungs) {
    if (!rungActive(rung, runtime)) continue;
    for (const branch of rung.branches.filter((b) => branchConducting(b, controls, runtime))) {
      for (const ref of [...branch.before, ...branch.after]) {
        flowingPorts.add(`contact:${ref.component.id}:${ref.index}:a`);
        flowingPorts.add(`contact:${ref.component.id}:${ref.index}:b`);
      }
      flowingPorts.add(`load:${rung.id}:a`); flowingPorts.add(`load:${rung.id}:b`);
      flowingPorts.add(`feed:${branch.supply}:port`);
      flowingPorts.add(`feed:${branch.return}:port`);
    }
  }
  const symbols = new Map(sheet.symbols.map((s) => [s.id, s]));
  const connections = new Map(sheet.connections.map((c) => [c.id, c]));
  return <g className="schematic-unified" data-layout="unified">
    {sheet.graph.edges?.map((edge) => {
      const wire = connections.get(edge.id)!;
      const flow = [wire.source, wire.target].every((id) => id.startsWith('junction:') || flowingPorts.has(id));
      return <g key={edge.id} className={`schematic-wire potential-${terminalState(wire.terminal, runtime)}`} data-net={wire.net}>
        {edge.sections?.map((section, i) => {
          const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
          const d = points.map((p, j) => `${j ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
          return <g key={i}><path d={d} />{flow && <path d={d} className="schematic-flow" />}</g>;
        })}
      </g>;
    })}
    {sheet.graph.children?.map((node) => {
      const symbol = symbols.get(node.id)!;
      const x = node.x ?? 0, y = node.y ?? 0, cx = (node.width ?? 0) / 2;
      if (symbol.contact) return <g key={node.id} transform={`translate(${x + cx},${y + 48})`}>
        <Wire a={[-cx, 0]} b={[-40, 0]} terminal={symbol.contact.from} runtime={runtime} />
        <ContactSymbol ref={symbol.contact} x={0} y={0} runtime={runtime} controls={controls} selected={selected} onSelect={onSelect} />
        <Wire a={[40, 0]} b={[cx, 0]} terminal={symbol.contact.to} runtime={runtime} />
      </g>;
      if (symbol.rung) {
        const a = terminalId(symbol.rung.component.id, symbol.rung.input.a);
        const b = terminalId(symbol.rung.component.id, symbol.rung.input.b);
        return <g key={node.id} transform={`translate(${x + cx},${y + 48})`} data-rung={symbol.rung.id}>
          <Wire a={[-cx, 0]} b={[-40, 0]} terminal={a} runtime={runtime} />
          <LoadSymbol rung={symbol.rung} x={0} y={0} runtime={runtime} selected={selected} onSelect={onSelect} />
          <Wire a={[40, 0]} b={[cx, 0]} terminal={b} runtime={runtime} />
          <text className="symbol-terminal" x={-34} y={16}>{symbol.rung.input.a}</text>
          <text className="symbol-terminal" x={34} y={16}>{symbol.rung.input.b}</text>
        </g>;
      }
      const terminal = symbol.terminal!;
      if (symbol.net !== undefined) return <g key={node.id} data-junction={symbol.net}>
        <Wire a={[x, y + 4]} b={[x + 8, y + 4]} terminal={terminal} runtime={runtime} />
        <circle className={`schematic-junction potential-${terminalState(terminal, runtime)}`} cx={x + 4} cy={y + 4} r={4} />
      </g>;
      return <g key={node.id} className="schematic-feed" data-terminal={terminal}>
        <Wire a={[x, y + 25]} b={[x + (node.width ?? 0), y + 25]} terminal={terminal} runtime={runtime} />
        <text className="rail-label" x={x} y={y + 12}>{symbol.label}</text>
      </g>;
    })}
  </g>;
}

function Wire({ a, b, terminal, runtime, flow = false }: {
  a: [number, number]; b: [number, number]; terminal: string; runtime: Runtime; flow?: boolean;
}) {
  const d = `M${a[0]},${a[1]} L${b[0]},${b[1]}`;
  return <g className={`schematic-wire potential-${terminalState(terminal, runtime)}`}>
    <path d={d} />
    {flow && <path d={d} className="schematic-flow" />}
  </g>;
}
function ContactSymbol({ ref: item, x, y, runtime, controls, selected, onSelect }: {
  ref: DiagramContact; x: number; y: number; runtime: Runtime; controls: Controls;
  selected?: string; onSelect: (id: string) => void;
}) {
  const closed = isContactClosed(item.component, item.contact, controls, runtime);
  const normal = ['off', 'coilOff', 'timedOff', 'poweredOff'].includes(item.contact.when) ? 'NC' : 'NO';
  const timed = item.contact.when.startsWith('timed');
  const phase = terminalState(item.from, runtime);
  const a = item.from.split(':')[1], b = item.to.split(':')[1];
  return <g className={`schematic-contact ${closed ? 'contact-closed' : 'contact-open'} potential-${phase} ${selected === item.component.id ? 'symbol-selected' : ''}`}
    transform={`translate(${x},${y})`} role="button" tabIndex={0}
    aria-label={`${item.component.name} ${a}-${b} ${closed ? '闭合' : '断开'}`}
    data-component={item.component.id} data-contact={item.index} data-closed={closed}
    onClick={() => onSelect(item.component.id)} onKeyDown={(event) => { if (event.key === 'Enter') onSelect(item.component.id); }}>
    <title>{item.component.name} · {a}/{b} · {timed ? '延时 ' : ''}{normal} · {closed ? '闭合' : '断开'}</title>
    <rect className="symbol-hit" x={-48} y={-36} width={96} height={70} rx={3} />
    <text className="symbol-name" x={0} y={-25}>{item.component.name}</text>
    <Wire a={[-40, 0]} b={[-17, 0]} terminal={item.from} runtime={runtime} />
    <Wire a={[17, 0]} b={[40, 0]} terminal={item.to} runtime={runtime} />
    <g className={`contact-terminal potential-${terminalState(item.from, runtime)}`}><circle cx={-17} cy={0} r={2.5} /></g>
    <g className={`contact-terminal potential-${terminalState(item.to, runtime)}`}><circle cx={17} cy={0} r={2.5} /></g>
    <path className="contact-blade" d={closed ? 'M-17,0 H17' : 'M-17,0 L14,-14'} />
    <text className="symbol-terminal" x={-32} y={16}>{a}</text><text className="symbol-terminal" x={32} y={16}>{b}</text>
    <text className="symbol-detail" x={0} y={32}>{timed ? 't · ' : ''}{normal}</text>
  </g>;
}
function LoadSymbol({ rung, x, y, runtime, selected, onSelect }: {
  rung: DiagramRung; x: number; y: number; runtime: Runtime; selected?: string; onSelect: (id: string) => void;
}) {
  const c = rung.component, def = DEFINITIONS[c.kind];
  const active = rungActive(rung, runtime);
  const motor = def.family === 'motor' && rung.type !== 'phase';
  const lamp = ['lamp', 'tower', 'pushbutton'].includes(def.family ?? '') && rung.type === 'load';
  const timer = def.family === 'timer';
  const detail = timer ? `${((runtime.timers[c.id]?.elapsed ?? 0) / 1000).toFixed(1)} / ${c.delay ?? 3} s` :
    def.family === 'contactor' && !active && runtime.engaged[c.id] ? '手动 · 线圈断电' :
    rung.type === 'coil' && runtime.coilInputs?.[c.id] ?
      `${Math.round(runtime.coilInputs[c.id].voltage)}/${c.voltage} V · ${runtime.coilInputs[c.id].issue === 'open' ? '断电' :
        runtime.coilInputs[c.id].issue === 'undervoltage' ? '欠压' : runtime.coilInputs[c.id].issue === 'overvoltage' ? '过压' :
        runtime.coilInputs[c.id].issue ? '异常' : '通电'}` :
    rung.type === 'phase' ? `${rung.input.a} / ${rung.input.b} · ${runtime.motors[c.id] === 'reverse' ? '反转' : active ? '正转' : '停止'}` :
    def.family === 'thermostat' ? `${c.value ?? 25} / ${c.setpoint ?? 30} °C` :
    def.family === 'sensor' ? '传感器电源' : `${active ? '通电' : '断电'}${rung.channel ? ` · ${rung.channel}` : ''}`;
  return <g className={`schematic-load ${active ? 'load-active' : ''} ${selected === c.id ? 'symbol-selected' : ''}`}
    transform={`translate(${x},${y})`} role="button" tabIndex={0} aria-label={`${c.name} ${detail}`}
    data-component={c.id} data-active={active}
    onClick={() => onSelect(c.id)} onKeyDown={(event) => { if (event.key === 'Enter') onSelect(c.id); }}>
    <title>{c.name} · {def.name} · {detail}</title>
    <rect className="symbol-hit" x={-55} y={-38} width={110} height={78} rx={3} />
    <text className="symbol-name" x={0} y={-26}>{c.name}</text>
    <path className="symbol-lead" d="M-40,0 H-20 M20,0 H40" />
    {lamp || motor ? <><circle className="load-body" r={19} />
      {lamp ? <path d="M-13,-13 L13,13 M-13,13 L13,-13" /> : <text className="motor-symbol" y={6}>M</text>}</> :
      <><rect className="load-body" x={-20} y={-17} width={40} height={34} rx={timer || rung.type === 'phase' ? 1 : 9} />
        <text className="coil-symbol" y={5}>{rung.type === 'phase' ? '~' : timer ? 't' : rung.type === 'coil' ? def.family === 'contactor' || def.family === 'relay' ? '' : 'P' : '~'}</text></>}
    <text className="symbol-detail" x={0} y={38}>{detail}</text>
  </g>;
}
function branchKey(branch: DiagramBranch) {
  return `${branch.supply}|${branch.return}|${branch.after.map((ref) => `${ref.component.id}.${ref.index}.${ref.from}`).join(',')}`;
}
interface RungGroup { rung: DiagramRung; branches: DiagramBranch[]; y: number; height: number; before: number; after: number }
function layout(rungs: DiagramRung[]) {
  const groups: RungGroup[] = [];
  let y = 110;
  for (const rung of rungs) {
    const partitions = new Map<string, DiagramBranch[]>();
    for (const branch of rung.branches) {
      const key = rung.type === 'phase' ? 'phase' : branchKey(branch);
      partitions.set(key, [...(partitions.get(key) ?? []), branch]);
    }
    if (!partitions.size) partitions.set('unwired', []);
    for (const branches of partitions.values()) {
      const height = Math.max(1, branches.length) * 82 + 38;
      groups.push({ rung, branches, y, height, before: Math.max(1, ...branches.map((b) => b.before.length)),
        after: Math.max(0, ...branches.map((b) => b.after.length)) });
      y += height;
    }
  }
  const phaseBefore = Math.max(1, ...groups.filter((g) => g.rung.type === 'phase').map((g) => g.before));
  groups.filter((g) => g.rung.type === 'phase').forEach((g) => { g.before = phaseBefore; });
  return { groups, height: Math.max(250, y + 30),
    width: Math.max(640, ...groups.map((g) => (g.rung.type === 'phase' ? 500 : 360) + (g.before + g.after) * 130)) };
}
function Rung({ group, runtime, controls, selected, onSelect, index }: {
  group: RungGroup; runtime: Runtime; controls: Controls; selected?: string; onSelect: (id: string) => void; index: number;
}) {
  const { rung, branches, before, y, height } = group;
  const c = rung.component;
  const inputA = terminalId(c.id, rung.input.a), inputB = terminalId(c.id, rung.input.b);
  const coilX = 180 + before * 130;
  const middle = y + (Math.max(1, branches.length) - 1) * 41;
  const first = branches[0];
  const after = first?.after ?? [];
  const endX = coilX + 100 + after.length * 130;
  const energized = rungActive(rung, runtime);
  const flowing = energized && branches.some((branch) => branchConducting(branch, controls, runtime));
  const sharedSupply = new Set(branches.map((branch) => branch.supply)).size <= 1;
  let prefixLength = 0;
  if (sharedSupply && branches.length > 1) {
    while (branches.every((branch) => {
      const a = first.before[prefixLength], b = branch.before[prefixLength];
      return a && b && a.component.id === b.component.id && a.index === b.index && a.from === b.from;
    })) prefixLength++;
  }
  const splitX = prefixLength ? 75 + prefixLength * 130 : 65;
  const splitTerminal = prefixLength ? first.before[prefixLength - 1].to : first?.supply ?? '';
  return <g className="schematic-rung" data-rung={rung.id}>
    <text className="rung-number" x={20} y={y - 38}>{String(index + 1).padStart(2, '0')}</text>
    {!branches.length ? <>
      <Wire a={[65, middle]} b={[coilX - 40, middle]} terminal="" runtime={runtime} />
      <text className="rung-unwired" x={90} y={middle - 18}>未形成电源回路</text>
    </> : <>
      {sharedSupply && <><text className="rail-label" x={58} y={(prefixLength ? middle : y) - 25}>{first.supply.split(':')[1]}</text>
        {first.before.slice(0, prefixLength).map((ref, i) => {
          const x = 145 + i * 130;
          return <g key={`common:${i}`}>
            <Wire a={[i ? x - 90 : 65, middle]} b={[x - 40, middle]} terminal={ref.from} runtime={runtime} flow={flowing} />
            <ContactSymbol ref={ref} x={x} y={middle} runtime={runtime} controls={controls} selected={selected} onSelect={onSelect} />
          </g>;
        })}
        {prefixLength > 0 && <Wire a={[splitX - 20, middle]} b={[splitX, middle]} terminal={splitTerminal} runtime={runtime} flow={flowing} />}
        <Wire a={[splitX, y]} b={[splitX, y + (branches.length - 1) * 82]} terminal={splitTerminal} runtime={runtime} flow={false} /></>}
      {branches.map((branch, row) => {
        const lineY = y + row * 82;
        const conductive = energized && branchConducting(branch, controls, runtime);
        let tail = splitX, terminal = prefixLength ? splitTerminal : branch.supply;
        return <g key={row} data-branch-conducting={conductive}>
          {!sharedSupply && <text className="rail-label" x={48} y={lineY - 16}>{branch.supply.split(':')[1]}</text>}
          {branch.before.slice(prefixLength).map((ref, index) => {
            const i = index + prefixLength;
            const x = 145 + i * 130, previousTail = tail, previousTerminal = terminal;
            tail = x + 40; terminal = ref.to;
            return <g key={`${ref.component.id}:${ref.index}:${i}`}>
              <Wire a={[previousTail, lineY]} b={[x - 40, lineY]} terminal={previousTerminal} runtime={runtime} flow={conductive} />
              <ContactSymbol ref={ref} x={x} y={lineY} runtime={runtime} controls={controls} selected={selected} onSelect={onSelect} />
            </g>;
          })}
          <Wire a={[tail, lineY]} b={[coilX - 65, lineY]} terminal={terminal} runtime={runtime} flow={conductive} />
          <Wire a={[coilX - 65, lineY]} b={[coilX - 65, middle]} terminal={inputA} runtime={runtime} flow={conductive} />
          <circle className={`schematic-junction potential-${terminalState(sharedSupply ? splitTerminal : branch.supply, runtime)}`} cx={splitX} cy={lineY} r={3} />
        </g>;
      })}
      <Wire a={[coilX - 65, middle]} b={[coilX - 40, middle]} terminal={inputA} runtime={runtime} flow={flowing} />
    </>}
    <LoadSymbol rung={rung} x={coilX} y={middle} runtime={runtime} selected={selected} onSelect={onSelect} />
    {after.map((ref, i) => {
      const x = coilX + 110 + i * 130;
      return <g key={`${ref.component.id}:${ref.index}`}>
        <Wire a={[i ? x - 90 : coilX + 40, middle]} b={[x - 40, middle]} terminal={ref.from} runtime={runtime} flow={flowing} />
        <ContactSymbol ref={ref} x={x} y={middle} runtime={runtime} controls={controls} selected={selected} onSelect={onSelect} />
      </g>;
    })}
    <Wire a={[after.length ? coilX + 150 + (after.length - 1) * 130 : coilX + 40, middle]}
      b={[endX, middle]} terminal={after.length ? after[after.length - 1].to : inputB} runtime={runtime} flow={flowing} />
    <text className="rail-label" x={endX + 10} y={middle + 4}>{rung.type === 'phase' ? rung.input.b : first?.return.split(':')[1] ?? '—'}</text>
    <line className="rung-divider" x1={20} x2={endX + 35} y1={y + height - 53} y2={y + height - 53} />
  </g>;
}

function WindingBridges({ groups, nets, runtime }: { groups: RungGroup[]; nets: Record<string, number>; runtime: Runtime }) {
  const phases = groups.filter((g) => g.rung.type === 'phase');
  const endpoints = phases.flatMap((g) => ['a', 'b'].map((side) => ({
    terminal: terminalId(g.rung.component.id, side === 'a' ? g.rung.input.a : g.rung.input.b), side,
    x: (side === 'a' ? 140 : 280) + g.before * 130, y: g.y + (Math.max(1, g.branches.length) - 1) * 41,
  })));
  const byNet = new Map<number, typeof endpoints>();
  endpoints.forEach((point) => byNet.set(nets[point.terminal], [...(byNet.get(nets[point.terminal]) ?? []), point]));
  const bridges = [...byNet.entries()].filter(([, points]) => points.length > 1 && points.some((point) => point.side === 'b'));
  const right = Math.max(0, ...endpoints.map((point) => point.x));
  return <g aria-label="绕组桥接">
    {bridges.map(([net, points], i) => {
      const x = right + 80 + i % 3 * 24;
      const height = (point: typeof endpoints[number]) => point.y + (point.side === 'a' ? 52 : 0);
      return <g key={net}>
        {points.map((point) => <g key={point.terminal}>
          {point.side === 'a' && <Wire a={[point.x, point.y]} b={[point.x, height(point)]} terminal={point.terminal} runtime={runtime} />}
          <Wire a={[point.x, height(point)]} b={[x, height(point)]} terminal={point.terminal} runtime={runtime} />
          <circle className={`schematic-junction potential-${terminalState(point.terminal, runtime)}`} cx={x} cy={height(point)} r={3} />
        </g>)}
        <Wire a={[x, Math.min(...points.map(height))]} b={[x, Math.max(...points.map(height))]} terminal={points[0].terminal} runtime={runtime} />
      </g>;
    })}
  </g>;
}

function Operator({ component: c, channel, runtime, controls, running, onOperate }: {
  component: Component; channel?: string; runtime: Runtime; controls: Controls; running: boolean;
  onOperate: (id: string, value: boolean | number, channel?: string) => void;
}) {
  const def = DEFINITIONS[c.kind], momentary = def.operation === 'momentary';
  const key = channel ? `${c.id}.${channel}` : c.id;
  const active = !!controls[key];
  const label = `${c.name} ${def.family === 'contactor' ? '手动吸合（按住）' : def.name}${channel ? ` ${channel}` : ''}`;
  const update = (value: boolean | number) => onOperate(c.id, value, channel);
  return <button className={`circuit-operator ${active ? 'operator-active' : ''}`} aria-label={label} aria-pressed={active}
    title={label} disabled={!running || !!c.linkedTo} style={{ '--operator-color': def.color ?? '#23866f' } as CSSProperties}
    onPointerDown={(event) => { if (momentary) { event.currentTarget.setPointerCapture(event.pointerId); update(true); } }}
    onPointerUp={() => { if (momentary) update(false); }} onPointerCancel={() => { if (momentary) update(false); }}
    onLostPointerCapture={() => { if (momentary) update(false); }}
    onKeyDown={(event) => { if (momentary && [' ', 'Enter'].includes(event.key)) { event.preventDefault(); update(true); } }}
    onKeyUp={(event) => { if (momentary && [' ', 'Enter'].includes(event.key)) update(false); }}
    onBlur={() => { if (momentary && active) update(false); }}
    onClick={() => { if (!momentary) update(def.operation === 'selector' ? (Number(controls[key] ?? 0) + 1) % 3 : !active); }}>
    <span className="operator-icon">{def.family === 'contactor' ? <Hand size={17} /> : def.operation === 'trip' ? <RotateCcw size={15} /> : <Power size={15} />}</span>
    <span><strong>{c.name}{channel ? ` · ${channel}` : ''}</strong><small>{def.operation === 'selector' ? ['0', 'I', 'II'][Number(controls[key] ?? 0)] :
      def.family === 'contactor' ? active ? '手动压合' : runtime.coils[c.id] ? '线圈吸合' : '手动吸合' :
      def.operation === 'trip' ? active ? '复位' : '试验跳闸' : def.family === 'sensor' ? active ? '已触发' : '未触发' :
      def.family === 'target' ? active ? '到位' : '离开' : active ? '已操作' : def.name.replace(' · 绿色', '').replace(' · 红色', '')}</small></span>
    <i className={runtime.outputs[c.id] ? 'operator-led-on' : ''} />
  </button>;
}

export function SchematicView({ project, runtime, controls, running, selected, showEnergized, onSelect, onOperate, onTune }: {
  project: Project; runtime: Runtime; controls: Controls; running: boolean; selected?: string; showEnergized: boolean;
  onSelect: (id: string) => void; onOperate: (id: string, value: boolean | number, channel?: string) => void;
  onTune: (id: string, patch: Partial<Component>) => void;
}) {
  const diagram = useMemo(() => buildSchematic(project), [project]);
  const geometry = useMemo(() => layout(diagram.rungs), [diagram]);
  const [drawingMode, setDrawingMode] = useState<'unified' | 'branches'>('unified');
  const [sheetState, setSheetState] = useState<{ diagram: Schematic; sheet: CircuitSheet | null; failed?: boolean } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ width: 800, height: 500 });
  const [fit, setFit] = useState(false);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    let cancelled = false;
    layoutCircuitSheet(buildCircuitSheet(project, diagram)).then((sheet) => {
      if (!cancelled) setSheetState({ diagram, sheet });
    }).catch(() => { if (!cancelled) setSheetState({ diagram, sheet: null, failed: true }); });
    return () => { cancelled = true; };
  }, [project, diagram]);
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setFrame({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const sheet = sheetState?.diagram === diagram ? sheetState.sheet : null;
  const unified = drawingMode === 'unified' && sheet !== null;
  const dimensions = unified ? { width: Math.max(640, sheet.graph.width ?? 0), height: Math.max(250, sheet.graph.height ?? 0) } : geometry;
  const scale = (fit ? Math.min(1, frame.width / dimensions.width, frame.height / dimensions.height) : 1) * zoom;
  const pendingLayout = drawingMode === 'unified' && sheetState?.diagram !== diagram;
  const visibleRuntime = showEnergized ? runtime : { ...runtime, potentials: {} };
  const operators = project.components.filter((c) => DEFINITIONS[c.kind].operation && DEFINITIONS[c.kind].capability !== 'wiring');
  const unused = diagram.contacts.filter((ref) => !diagram.rungs.some((rung) => rung.branches.some((branch) =>
    [...branch.before, ...branch.after].some((other) => other.component.id === ref.component.id && other.index === ref.index))));
  const download = () => {
    const svg = document.querySelector('.schematic-svg');
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.removeAttribute('style');
    clone.setAttribute('width', String(dimensions.width)); clone.setAttribute('height', String(dimensions.height));
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = [...document.styleSheets].flatMap((sheet) => {
      try { return [...sheet.cssRules].map((rule) => rule.cssText).filter((text) => /schematic|symbol-|load-|rung-|rail-|contact-blade|coil-symbol|motor-symbol|@keyframes flow/.test(text)); }
      catch { return []; }
    }).join('\n');
    clone.prepend(style);
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${project.name}-原理图.svg`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="schematic-panel" aria-label="实时原理图">
    <div className="schematic-heading"><strong><Activity size={14} />原理图</strong>
      <span className={`schematic-sync ${running ? 'sync-running' : ''}`}><i />{running ? '实时联动' : '已停止'}</span>
      <div className="schematic-modes" role="group" aria-label="原理图布局">
        <button aria-pressed={drawingMode === 'unified'} onClick={() => { setDrawingMode('unified'); setFit(false); setZoom(1); }}>整图</button>
        <button aria-pressed={drawingMode === 'branches'} onClick={() => { setDrawingMode('branches'); setFit(false); setZoom(1); }}>支路</button>
      </div>
      <div className="schematic-tools">
        <button title="缩小原理图" aria-label="缩小原理图" onClick={() => setZoom((z) => Math.max(.25, z / 1.2))}><Minus size={18} /></button>
        <button title="原理图适应宽度" aria-label="原理图适应宽度" onClick={() => { setFit(false); setZoom(Math.min(1, frame.width / dimensions.width)); }}>{Math.round(scale * 100)}%</button>
        <button title="放大原理图" aria-label="放大原理图" onClick={() => setZoom((z) => Math.min(4, z * 1.2))}><Plus size={18} /></button>
        <button title="适应整张电路图" aria-label="适应整张电路图" onClick={() => { setFit(true); setZoom(1); }}><Maximize size={14} /></button>
        <button title="导出当前原理图" aria-label="导出当前原理图" disabled={pendingLayout} onClick={download}><Download size={14} /></button>
      </div>
    </div>
    <div className="schematic-legend"><span><i className="legend-live" />相线 / 正极带电</span><span><i className="legend-return" />N / 0V</span><span><i className="legend-flow" />负载通电回路</span></div>
    <div className="schematic-scroll" ref={scrollRef}>
      {pendingLayout && <div className="schematic-layout-status" role="status">排版中...</div>}
      {drawingMode === 'unified' && sheetState?.diagram === diagram && sheetState.failed && <div className="schematic-limit">整图排版暂不可用，已显示支路图。</div>}
      <svg className="schematic-svg" viewBox={`0 0 ${dimensions.width} ${dimensions.height}`} role="group" aria-label={`${project.name} 动态控制原理图`}
        style={{ width: `${Math.max(1, dimensions.width * scale)}px`, height: `${Math.max(1, dimensions.height * scale)}px`, display: pendingLayout ? 'none' : undefined }}>
        <rect className="schematic-paper" width={dimensions.width} height={dimensions.height} />
        <text className="schematic-title" x={22} y={28} textLength={project.name.length > 38 ? dimensions.width - 44 : undefined} lengthAdjust="spacingAndGlyphs">{project.name}</text>
        <text className="schematic-subtitle" x={22} y={49}>{unified ? '完整电路' : '控制回路'} / {diagram.rungs.length} 支路 · {running ? '运行中' : '停止'}</text>
        {unified ? <UnifiedCircuit sheet={sheet} diagram={diagram} runtime={visibleRuntime} controls={controls} selected={selected} onSelect={onSelect} /> :
          <>{geometry.groups.map((group, i) => <Rung key={`${group.rung.id}:${i}`} group={group} index={i} runtime={visibleRuntime} controls={controls} selected={selected} onSelect={onSelect} />)}
            <WindingBridges groups={geometry.groups} nets={diagram.terminalNets} runtime={visibleRuntime} /></>}
        {!diagram.rungs.length && <text className="rung-unwired" x={22} y={100}>无负载或线圈回路</text>}
      </svg>
      {unused.length > 0 && <details className="unused-contacts"><summary>其他触点 · {unused.length}</summary>
        <div>{unused.map((ref) => <button key={`${ref.component.id}:${ref.index}`} onClick={() => onSelect(ref.component.id)}>
          <span>{ref.component.name} · {ref.contact.a}/{ref.contact.b}</span>
          <strong>{isContactClosed(ref.component, ref.contact, controls, runtime) ? '闭合' : '断开'}</strong>
        </button>)}</div></details>}
      {diagram.truncated && <div className="schematic-limit">复杂支路已截取，完整接线以实物接线视图为准。</div>}
      <div className="schematic-footnote">开关逻辑等效 · 不计算真实电流或机械负载</div>
    </div>
    <div className="circuit-operators" aria-label="控制台">
      <div className="operators-title"><FamilyIcon family="pushbutton" size={14} /><strong>控制台</strong><span>{operators.length} 个操作元件</span></div>
      <div className="operators-list">{operators.map((c) => (DEFINITIONS[c.kind].channels ?? [undefined]).map((channel) =>
        <Operator key={`${c.id}:${channel}`} component={c} channel={channel} controls={controls} runtime={runtime} running={running} onOperate={onOperate} />))}
        {project.components.filter((c) => DEFINITIONS[c.kind].family === 'thermostat').map((c) => <div className="operator-temperature" key={c.id}>
          <strong>{c.name}</strong><label>输入温度<input type="number" aria-label={`${c.name} 输入温度`} min={-100} max={1000} value={c.value ?? 25}
            onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value)) onTune(c.id, { value: Math.max(-100, Math.min(1000, value)) }); }} /></label>
          <label>设定温度<input type="number" aria-label={`${c.name} 设定温度`} min={-100} max={1000} value={c.setpoint ?? 30}
            onChange={(event) => { const setpoint = Number(event.target.value); if (Number.isFinite(setpoint)) onTune(c.id, { setpoint: Math.max(-100, Math.min(1000, setpoint)) }); }} /></label>
        </div>)}
        {project.components.filter((c) => DEFINITIONS[c.kind].family === 'timer').map((c) => <div className="operator-temperature" key={c.id}>
          <strong>{c.name}</strong><label>通电延时<input type="number" aria-label={`${c.name} 通电延时`} min={0.1} max={3600} step={0.1} disabled={running} value={c.delay ?? 3}
            onChange={(event) => { const delay = Number(event.target.value); if (Number.isFinite(delay) && delay >= .1 && delay <= 3600) onTune(c.id, { delay }); }} />s</label>
        </div>)}
      </div>
    </div>
  </section>;
}
