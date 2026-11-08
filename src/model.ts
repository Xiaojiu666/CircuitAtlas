import { EXTRA_DEFINITIONS } from './catalog';

export type Kind = 'source3' | 'source1' | 'dc' | 'breaker' | 'contactor' | 'buttonNO' | 'buttonNC' | 'lamp' | 'motor' | keyof typeof EXTRA_DEFINITIONS;
export type LibraryGroup = '电源类' | '通用类' | '交流控件' | '直流控件';
export const LIBRARY_GROUPS: LibraryGroup[] = ['电源类', '通用类', '交流控件', '直流控件'];
export type Family = 'source' | 'breaker' | 'contactor' | 'pushbutton' | 'switch' | 'selector' | 'relay' | 'timer' |
  'sensor' | 'terminal' | 'socket' | 'lamp' | 'tower' | 'buzzer' | 'motor' | 'heater' | 'valve' |
  'meter' | 'transformer' | 'drive' | 'thermal' | 'fuse' | 'potentiometer' | 'thermostat' | 'auxiliary' | 'target' | 'controller' | 'cylinder';
export type ContactWhen = 'always' | 'on' | 'off' | 'coilOn' | 'coilOff' | 'timedOn' | 'timedOff' |
  'position1' | 'position2' | 'poweredOn' | 'poweredOff' | 'temperature' | 'level';
export interface Contact { a: string; b: string; when: ContactWhen; channel?: string }
export interface InputPair { a: string; b: string; supply: 'ac' | 'dc' | 'either'; channel?: string }
export type Phase = 'L1' | 'L2' | 'L3' | 'N' | 'PE' | 'L' | '+' | '-';
export type WireColor = 'auto' | 'yellow' | 'green' | 'red' | 'blue' | 'black';
export interface Component {
  id: string;
  kind: Kind;
  name: string;
  x: number;
  y: number;
  rotation: number;
  voltage: number;
  delay?: number;
  value?: number;
  setpoint?: number;
  linkedTo?: string;
}
export interface Wire {
  id: string;
  from: string;
  to: string;
  color: WireColor;
}
export interface Project {
  version: 1;
  name: string;
  components: Component[];
  wires: Wire[];
}
export interface Port { id: string; x: number; y: number; label: string; phase?: Phase }
export interface Definition {
  name: string;
  category: string;
  prefix: string;
  width: number;
  height: number;
  ports: Port[];
  voltage: number;
  spec: string;
  image?: string;
  family?: Family;
  group?: LibraryGroup;
  supply?: 'ac3' | 'ac1' | 'dc';
  contacts?: Contact[];
  coil?: InputPair;
  loads?: InputPair[];
  operation?: 'toggle' | 'momentary' | 'selector' | 'trip';
  channels?: string[];
  capability?: 'logic' | 'wiring';
  limitation?: string;
  poles?: number;
  color?: string;
  unit?: string;
  follow?: 'coil' | 'target';
}
const port = (id: string, x: number, y: number, label = id, phase?: Phase): Port => ({ id, x, y, label, phase });
export const DEFINITIONS: Record<Kind, Definition> = {
  source3: {
    family: 'source', group: '电源类', supply: 'ac3',
    name: '三相电源', category: '电源', prefix: 'X', width: 242, height: 108, voltage: 380,
    spec: 'AC 380 / 220 V · 50 Hz',
    ports: [port('L1', 29, 80, 'L1', 'L1'), port('L2', 75, 80, 'L2', 'L2'), port('L3', 121, 80, 'L3', 'L3'), port('N', 167, 80, 'N', 'N'), port('PE', 213, 80, 'PE', 'PE')],
  },
  source1: {
    family: 'source', group: '电源类', supply: 'ac1',
    name: '单相电源', category: '电源', prefix: 'X', width: 174, height: 108, voltage: 220,
    spec: 'AC 220 V · 50 Hz',
    ports: [port('L', 35, 80, 'L', 'L'), port('N', 87, 80, 'N', 'N'), port('PE', 139, 80, 'PE', 'PE')],
  },
  dc: {
    family: 'source', group: '电源类', supply: 'dc',
    name: '直流电源', category: '电源', prefix: 'DC', width: 150, height: 108, voltage: 24,
    spec: 'DC 24 V',
    ports: [port('+', 43, 80, '+', '+'), port('-', 107, 80, '−', '-')],
  },
  breaker: {
    family: 'breaker', group: '通用类', operation: 'toggle', poles: 3,
    contacts: [{ a: '1', b: '2', when: 'on' }, { a: '3', b: '4', when: 'on' }, { a: '5', b: '6', when: 'on' }],
    name: '三极断路器', category: '断路与保护', prefix: 'QF', width: 144, height: 232, voltage: 380,
    spec: '3P · C16 · AC 400 V', image: '/assets/breaker.webp',
    ports: [port('1', 28, 32, '1 / L1'), port('3', 72, 32, '3 / L2'), port('5', 116, 32, '5 / L3'), port('2', 28, 204, '2 / T1'), port('4', 72, 204, '4 / T2'), port('6', 116, 204, '6 / T3')],
  },
  contactor: {
    family: 'contactor', group: '交流控件', operation: 'momentary', coil: { a: 'A1', b: 'A2', supply: 'ac' },
    contacts: [{ a: '1', b: '2', when: 'coilOn' }, { a: '3', b: '4', when: 'coilOn' }, { a: '5', b: '6', when: 'coilOn' },
      { a: '13', b: '14', when: 'coilOn' }, { a: '21', b: '22', when: 'coilOff' }],
    name: '交流接触器', category: '接触器与继电器', prefix: 'KM', width: 204, height: 252, voltage: 220,
    spec: '3P + 1NO + 1NC · AC 220 V', image: '/assets/contactor.webp',
    ports: [
      port('A1', 34, 12), port('A2', 121, 12),
      port('1', 32, 66, '1 / L1'), port('3', 75, 66, '3 / L2'), port('5', 118, 66, '5 / L3'),
      port('2', 32, 216, '2 / T1'), port('4', 75, 216, '4 / T2'), port('6', 118, 216, '6 / T3'),
      port('13', 181, 60, '13 / NO'), port('14', 181, 106, '14 / NO'),
      port('21', 181, 158, '21 / NC'), port('22', 181, 204, '22 / NC'),
    ],
  },
  buttonNO: {
    family: 'pushbutton', group: '通用类', operation: 'momentary', color: '#278566',
    contacts: [{ a: '13', b: '14', when: 'on' }],
    name: '启动按钮', category: '按钮与选择', prefix: 'SB', width: 112, height: 140, voltage: 220,
    spec: '瞬时按钮 · 常开 NO',
    ports: [port('13', 23, 22, '13 / NO'), port('14', 89, 22, '14 / NO')],
  },
  buttonNC: {
    family: 'pushbutton', group: '通用类', operation: 'momentary', color: '#c85b52',
    contacts: [{ a: '21', b: '22', when: 'off' }],
    name: '停止按钮', category: '按钮与选择', prefix: 'SB', width: 112, height: 140, voltage: 220,
    spec: '瞬时按钮 · 常闭 NC',
    ports: [port('21', 23, 22, '21 / NC'), port('22', 89, 22, '22 / NC')],
  },
  lamp: {
    family: 'lamp', group: '交流控件', color: '#46a26a', loads: [{ a: 'X1', b: 'X2', supply: 'ac' }],
    name: '指示灯', category: '灯光与声响', prefix: 'HL', width: 100, height: 136, voltage: 220,
    spec: '绿色 · AC 220 V',
    ports: [port('X1', 20, 22), port('X2', 80, 22)],
  },
  motor: {
    family: 'motor', group: '交流控件',
    name: '三相异步电动机', category: '电机与执行', prefix: 'M', width: 230, height: 252, voltage: 380,
    spec: '三相 · 六端子 · Y / Δ', image: '/assets/motor.webp',
    ports: [port('W2', 30, 22), port('U2', 108, 22), port('V2', 186, 22), port('U1', 30, 73), port('V1', 108, 73), port('W1', 186, 73), port('PE', 218, 212, 'PE', 'PE')],
  },
  ...EXTRA_DEFINITIONS,
};
export const WIRE_COLORS: Record<Exclude<WireColor, 'auto'>, string> = {
  yellow: '#d9ad16', green: '#248b55', red: '#d95c56', blue: '#4e83c9', black: '#505b64',
};
export const PHASE_COLORS: Record<Phase, string> = {
  L1: '#d9ad16', L2: '#248b55', L3: '#d95c56', N: '#4e83c9', PE: '#80a938',
  L: '#d9ad16', '+': '#d95c56', '-': '#4e83c9',
};
export const terminalId = (id: string, portId: string) => `${id}:${portId}`;
export function portPosition(component: Component, portId: string) {
  const def = DEFINITIONS[component.kind];
  const p = def.ports.find((item) => item.id === portId)!;
  const angle = component.rotation * Math.PI / 180;
  const dx = p.x - def.width / 2;
  const dy = p.y - def.height / 2;
  return { x: component.x + def.width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle), y: component.y + def.height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle) };
}
export function locateTerminal(project: Project, terminal: string) {
  const [id, portId] = terminal.split(':');
  const component = project.components.find((item) => item.id === id);
  if (!component || !DEFINITIONS[component.kind].ports.some((p) => p.id === portId)) return null;
  return portPosition(component, portId);
}
export function makeComponent(kind: Kind, id: string, name: string, x: number, y: number): Component {
  const def = DEFINITIONS[kind];
  return { id, kind, name, x, y, rotation: 0, voltage: def.voltage,
    ...(def.family === 'timer' ? { delay: 3 } : {}),
    ...(['potentiometer', 'thermostat'].includes(def.family ?? '') ? { value: def.family === 'thermostat' ? 25 : 50 } : {}),
    ...(def.family === 'thermostat' ? { setpoint: 30 } : {}) };
}
export function initialProject(): Project {
  return {
    version: 1,
    name: '三相电机接线',
    components: [
      makeComponent('source3', 'source', 'X1', 55, 90),
      makeComponent('breaker', 'breaker', 'QF1', 385, 90),
      makeComponent('contactor', 'contactor', 'KM1', 665, 90),
      makeComponent('motor', 'motor', 'M1', 465, 425),
    ],
    wires: [],
  };
}
export function exampleProject(latching = true): Project {
  const project = initialProject();
  project.name = latching ? '三相电机自锁控制' : '三相电机点动控制';
  project.components = [
    makeComponent('source3', 'source', 'X1', 35, 65),
    makeComponent('breaker', 'breaker', 'QF1', 355, 60),
    makeComponent('contactor', 'contactor', 'KM1', 630, 60),
    makeComponent('motor', 'motor', 'M1', 920, 90),
    makeComponent('buttonNC', 'stop', 'SB1', 355, 455),
    makeComponent('buttonNO', 'start', 'SB2', 630, 455),
    makeComponent('lamp', 'lamp', 'HL1', 930, 455),
  ];
  const links = [
    ['source:L1', 'breaker:1'], ['source:L2', 'breaker:3'], ['source:L3', 'breaker:5'],
    ['breaker:2', 'contactor:1'], ['breaker:4', 'contactor:3'], ['breaker:6', 'contactor:5'],
    ['contactor:2', 'motor:U1'], ['contactor:4', 'motor:V1'], ['contactor:6', 'motor:W1'],
    ['motor:W2', 'motor:U2'], ['motor:U2', 'motor:V2'], ['source:PE', 'motor:PE'],
    ['breaker:2', 'stop:21'], ['stop:22', 'start:13'], ['start:14', 'contactor:A1'],
    ['source:N', 'contactor:A2'], ['contactor:A1', 'lamp:X1'], ['source:N', 'lamp:X2'],
  ];
  if (latching) links.push(['stop:22', 'contactor:13'], ['start:14', 'contactor:14']);
  project.wires = links.map(([from, to], i) => ({ id: `w${i + 1}`, from, to, color: 'auto' }));
  return project;
}
export function controlExample(mode: 'timer' | 'sensor'): Project {
  const timer = mode === 'timer';
  const project: Project = {
    version: 1, name: timer ? '通电延时指示灯' : 'PNP 传感器继电控制',
    components: [
      makeComponent('dc', 's', 'DC1', 40, 70),
      makeComponent(timer ? 'latchGreen' : 'target', 'trigger', timer ? 'SB1' : 'OBJ1', 310, 75),
      { ...makeComponent(timer ? 'timerDC' : 'photoPNP', 'control', timer ? 'KT1' : 'SQ1', 570, 75),
        ...(timer ? {} : { linkedTo: 'trigger' }) },
      makeComponent(timer ? 'lampGreenDC' : 'relay8DC', 'output', timer ? 'HL1' : 'KA1', 840, 75),
      ...(!timer ? [makeComponent('lampGreenDC', 'lamp', 'HL1', 1100, 75)] : []),
    ], wires: [],
  };
  const links = timer ? [
    ['s:+', 'trigger:13'], ['trigger:14', 'control:A1'], ['s:-', 'control:A2'],
    ['s:+', 'control:15'], ['control:18', 'output:X1'], ['s:-', 'output:X2'],
  ] : [
    ['s:+', 'control:V+'], ['s:-', 'control:0V'], ['control:OUT', 'output:2'],
    ['s:-', 'output:7'], ['s:+', 'output:1'], ['output:4', 'lamp:X1'], ['s:-', 'lamp:X2'],
  ];
  project.wires = links.map(([from, to], i) => ({ id: `w${i + 1}`, from, to, color: 'auto' }));
  return project;
}
export function parseProject(text: string): Project {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object') throw new Error('无效的工程文件');
  const p = value as Project;
  if (p.version !== 1 || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 80 ||
      !Array.isArray(p.components) || !Array.isArray(p.wires) ||
      p.components.length > 150 || p.wires.length > 1000) throw new Error('工程格式或数量超出限制');
  const ids = new Set<string>();
  const terminals = new Set<string>();
  for (const c of p.components) {
    if (!c || typeof c.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(c.id) || ids.has(c.id) ||
        !Object.hasOwn(DEFINITIONS, c.kind) || typeof c.name !== 'string' || c.name.length > 32 ||
        ![c.x, c.y, c.rotation, c.voltage].every(Number.isFinite) ||
        c.x < 0 || c.y < 0 || c.x > 5000 || c.y > 5000 ||
        ![0, 90, 180, 270].includes(c.rotation) || c.voltage < 1 || c.voltage > 1000) throw new Error('元件数据无效');
    if ((c.delay !== undefined && (!Number.isFinite(c.delay) || c.delay < 0.1 || c.delay > 3600)) ||
        (c.value !== undefined && (!Number.isFinite(c.value) || c.value < -100 || c.value > 1000)) ||
        (c.setpoint !== undefined && (!Number.isFinite(c.setpoint) || c.setpoint < -100 || c.setpoint > 1000)) ||
        (c.linkedTo !== undefined && (typeof c.linkedTo !== 'string' || !/^[a-zA-Z0-9_-]{0,80}$/.test(c.linkedTo)))) throw new Error('元件参数无效');
    ids.add(c.id);
    DEFINITIONS[c.kind].ports.forEach((port) => terminals.add(terminalId(c.id, port.id)));
  }
  const wireIds = new Set<string>();
  const pairs = new Set<string>();
  for (const w of p.wires) {
    const pair = w && [w.from, w.to].sort().join('|');
    if (!w || typeof w.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(w.id) ||
        wireIds.has(w.id) || !terminals.has(w.from) || !terminals.has(w.to) || w.from === w.to ||
        pairs.has(pair) || !['auto', ...Object.keys(WIRE_COLORS)].includes(w.color)) throw new Error('导线数据无效');
    wireIds.add(w.id);
    pairs.add(pair);
  }
  return { version: 1, name: p.name, components: p.components.map((c) => ({
    id: c.id, kind: c.kind, name: c.name, x: c.x, y: c.y, rotation: c.rotation, voltage: c.voltage,
    ...(c.delay !== undefined ? { delay: c.delay } : {}),
    ...(c.value !== undefined ? { value: c.value } : {}),
    ...(c.setpoint !== undefined ? { setpoint: c.setpoint } : {}),
    ...(c.linkedTo !== undefined ? { linkedTo: c.linkedTo } : {}),
  })), wires: p.wires.map((w) => ({ id: w.id, from: w.from, to: w.to, color: w.color })) };
}
