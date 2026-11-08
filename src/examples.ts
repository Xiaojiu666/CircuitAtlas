import { controlExample, exampleProject, makeComponent } from './model';
import type { Component, Kind, Project } from './model';

export interface CircuitExample {
  id: string;
  name: string;
  category: string;
  tags: string;
  create: () => Project;
  referenceId?: string;
}
function circuit(name: string, devices: [Kind, string, string][], links: string[][]): Project {
  return {
    version: 1, name,
    components: devices.map(([kind, id, label], i) => makeComponent(kind, id, label, 60 + i % 4 * 300, 80 + Math.floor(i / 4) * 390)),
    wires: links.map(([from, to], i) => ({ id: `w${i + 1}`, from, to, color: 'auto' })),
  };
}
function extend(p: Project, kind: Kind, id: string, name: string): Component {
  const i = p.components.length;
  const c = makeComponent(kind, id, name, 60 + i % 4 * 300, 80 + Math.floor(i / 4) * 390);
  p.components.push(c);
  return c;
}
function link(p: Project, from: string, to: string) {
  let i = p.wires.length + 1;
  while (p.wires.some((w) => w.id === `w${i}`)) i++;
  p.wires.push({ id: `w${i}`, from, to, color: 'auto' });
}
function arrange(p: Project) {
  p.components.forEach((c, i) => { c.x = 60 + i % 4 * 300; c.y = 80 + Math.floor(i / 4) * 390; });
  return p;
}
function twoStation() {
  const p = exampleProject();
  p.name = '两地启停控制';
  extend(p, 'buttonNO', 'start2', 'SB4');
  extend(p, 'buttonNC', 'stop2', 'SB3');
  p.wires = p.wires.filter((w) => !(w.from === 'breaker:2' && w.to === 'stop:21'));
  link(p, 'breaker:2', 'stop2:21'); link(p, 'stop2:22', 'stop:21');
  link(p, 'start:13', 'start2:13'); link(p, 'start:14', 'start2:14');
  return arrange(p);
}
function multiStation(practice = false) {
  const p = exampleProject();
  p.name = practice ? '三相电机多地控制 · 接线实操' : '三相电机多地控制 · 参考接线';
  for (const [kind, id, name] of [
    ['buttonNC', 'stop2', 'SB3'], ['buttonNO', 'start2', 'SB4'],
    ['buttonNC', 'stop3', 'SB5'], ['buttonNO', 'start3', 'SB6'],
  ] as const) extend(p, kind, id, name);
  p.wires = p.wires.filter((w) => !(w.from === 'breaker:2' && w.to === 'stop:21'));
  link(p, 'breaker:2', 'stop:21');
  link(p, 'stop:22', 'stop2:21');
  link(p, 'stop2:22', 'stop3:21');
  // All start buttons and the holding contact must be downstream of every stop.
  for (const wire of p.wires) {
    if (wire.from === 'stop:22' && ['start:13', 'contactor:13'].includes(wire.to)) wire.from = 'stop3:22';
  }
  for (const station of [2, 3]) {
    link(p, 'start:13', `start${station}:13`);
    link(p, 'start:14', `start${station}:14`);
  }
  const positions: Record<string, [number, number]> = {
    source: [60, 80], breaker: [360, 80], contactor: [660, 80], motor: [1030, 80],
    stop: [150, 500], start: [330, 500],
    stop2: [570, 500], start2: [750, 500],
    stop3: [990, 500], start3: [1170, 500], lamp: [1330, 500],
  };
  p.components.forEach((c) => { [c.x, c.y] = positions[c.id]; });
  if (practice) p.wires = [];
  return p;
}
function thermal() {
  const p = exampleProject();
  p.name = '电机热继电器保护';
  extend(p, 'thermalRelay', 'thermal', 'FR1');
  p.wires = p.wires.filter((w) => !w.to.startsWith('motor:') || !['motor:U1', 'motor:V1', 'motor:W1'].includes(w.to));
  ['1', '3', '5'].forEach((port, i) => {
    link(p, `contactor:${Number(port) + 1}`, `thermal:${port}`);
    link(p, `thermal:${Number(port) + 1}`, `motor:${['U1', 'V1', 'W1'][i]}`);
  });
  p.wires = p.wires.filter((w) => !(w.from === 'breaker:2' && w.to === 'stop:21'));
  link(p, 'breaker:2', 'thermal:95'); link(p, 'thermal:96', 'stop:21');
  extend(p, 'lampRedAC', 'alarm', 'HL2');
  link(p, 'breaker:2', 'thermal:97'); link(p, 'thermal:98', 'alarm:X1'); link(p, 'source:N', 'alarm:X2');
  return arrange(p);
}
function reversing() {
  const p = circuit('正反转双重互锁', [
    ['source3', 's', 'X1'], ['breaker', 'q', 'QF1'],
    ['contactor', 'f', 'KM1'], ['contactor', 'r', 'KM2'],
    ['buttonNC', 'stop', 'SB1'], ['illuminatedMomentaryGreen', 'forward', 'SB2'],
    ['illuminatedMomentaryRed', 'reverse', 'SB3'], ['motor', 'm', 'M1'],
  ], [
    ['s:L1', 'q:1'], ['s:L2', 'q:3'], ['s:L3', 'q:5'],
    ['q:2', 'f:1'], ['q:4', 'f:3'], ['q:6', 'f:5'],
    ['q:2', 'r:5'], ['q:4', 'r:3'], ['q:6', 'r:1'],
    ['f:2', 'm:U1'], ['f:4', 'm:V1'], ['f:6', 'm:W1'],
    ['r:2', 'm:U1'], ['r:4', 'm:V1'], ['r:6', 'm:W1'],
    ['m:U2', 'm:V2'], ['m:V2', 'm:W2'], ['s:PE', 'm:PE'],
    ['q:2', 'stop:21'], ['stop:22', 'reverse:21'], ['reverse:22', 'r:21'],
    ['r:22', 'forward:13'], ['forward:14', 'f:A1'],
    ['r:22', 'f:13'], ['f:14', 'f:A1'],
    ['stop:22', 'forward:21'], ['forward:22', 'f:21'], ['f:22', 'reverse:13'],
    ['reverse:14', 'r:A1'], ['f:22', 'r:13'], ['r:14', 'r:A1'],
    ['s:N', 'f:A2'], ['s:N', 'r:A2'],
    ['f:A1', 'forward:X1'], ['s:N', 'forward:X2'], ['r:A1', 'reverse:X1'], ['s:N', 'reverse:X2'],
  ]);
  return p;
}
function sequence() {
  const p = circuit('两台电机顺序启动', [
    ['source3', 's', 'X1'], ['breaker', 'q', 'QF1'],
    ['contactor', 'k1', 'KM1'], ['contactor', 'k2', 'KM2'],
    ['buttonNC', 'stop', 'SB1'], ['buttonNO', 'start1', 'SB2'], ['buttonNO', 'start2', 'SB3'],
    ['auxiliary', 'enable', 'KA1'], ['motor', 'm1', 'M1'], ['motor', 'm2', 'M2'],
  ], [
    ['s:L1', 'q:1'], ['s:L2', 'q:3'], ['s:L3', 'q:5'],
    ['q:2', 'stop:21'], ['stop:22', 'start1:13'], ['start1:14', 'k1:A1'],
    ['stop:22', 'k1:13'], ['k1:14', 'k1:A1'], ['s:N', 'k1:A2'],
    ['stop:22', 'enable:13'], ['enable:14', 'start2:13'], ['start2:14', 'k2:A1'],
    ['enable:14', 'k2:13'], ['k2:14', 'k2:A1'], ['s:N', 'k2:A2'],
  ]);
  p.components.find((c) => c.id === 'enable')!.linkedTo = 'k1';
  ['1', '2'].forEach((i) => {
    ['1', '3', '5'].forEach((port, phase) => {
      link(p, `q:${Number(port) + 1}`, `k${i}:${port}`);
      link(p, `k${i}:${Number(port) + 1}`, `m${i}:${['U1', 'V1', 'W1'][phase]}`);
    });
    link(p, `m${i}:U2`, `m${i}:V2`); link(p, `m${i}:V2`, `m${i}:W2`); link(p, 's:PE', `m${i}:PE`);
  });
  return p;
}
function npn() {
  const p = controlExample('sensor');
  p.name = 'NPN 传感器继电控制';
  p.components.find((c) => c.id === 'control')!.kind = 'photoNPN';
  p.wires = p.wires.filter((w) => !['output:2', 'output:7'].includes(w.to));
  link(p, 's:+', 'output:2'); link(p, 'control:OUT', 'output:7');
  return p;
}
function lighting(twoWay: boolean) {
  return circuit(twoWay ? '楼梯双控照明' : '单开照明控制', [
    ['source1', 's', 'X1'], ['breaker1', 'q', 'QF1'],
    ['wallSingle', 'a', 'SA1'], ...(twoWay ? [['wallSingle', 'b', 'SA2'] as [Kind, string, string]] : []),
    ['bulb', 'lamp', 'HL1'],
  ], [
    ['s:L', 'q:1'], ['q:2', 'a:L1'], ['s:N', 'lamp:X2'],
    ...(twoWay ? [['a:1A', 'b:1A'], ['a:1B', 'b:1B'], ['b:L1', 'lamp:X1']] : [['a:1B', 'lamp:X1']]),
  ]);
}
function emergency() {
  return circuit('急停与运行状态指示', [
    ['dc', 's', 'DC1'], ['emergency', 'e', 'SB1'], ['latchGreen', 'start', 'SB2'],
    ['relay8DC', 'k', 'KA1'], ['lampGreenDC', 'run', 'HL1'], ['lampRedDC', 'alarm', 'HL2'],
  ], [
    ['s:+', 'e:21'], ['e:22', 'start:13'], ['start:14', 'k:2'], ['s:-', 'k:7'],
    ['s:+', 'k:1'], ['k:4', 'run:X1'], ['s:-', 'run:X2'],
    ['s:+', 'e:13'], ['e:14', 'alarm:X1'], ['s:-', 'alarm:X2'],
  ]);
}
function floatValve() {
  return circuit('浮球液位补水控制', [
    ['dc', 's', 'DC1'], ['floatSwitch', 'level', 'SQ1'], ['valveDC', 'valve', 'YV1'], ['lampGreenDC', 'lamp', 'HL1'],
  ], [
    ['s:+', 'level:11'], ['level:12', 'valve:A1'], ['s:-', 'valve:A2'],
    ['valve:A1', 'lamp:X1'], ['s:-', 'lamp:X2'],
  ]);
}
function thermostat() {
  return circuit('恒温加热控制', [
    ['source1', 's', 'X1'], ['breaker1', 'q', 'QF1'], ['thermostat', 'tc', 'TC1'],
    ['heater220', 'heat', 'EH1'], ['lamp', 'lamp', 'HL1'],
  ], [
    ['s:L', 'q:1'], ['q:2', 'tc:L'], ['s:N', 'tc:N'], ['q:2', 'tc:COM'],
    ['tc:NO', 'heat:A1'], ['s:N', 'heat:A2'], ['tc:NO', 'lamp:X1'], ['s:N', 'lamp:X2'],
  ]);
}
function delayedSequence() {
  return circuit('继电器延时顺序动作', [
    ['dc', 's', 'DC1'], ['latchGreen', 'start', 'SB1'], ['relay8DC', 'k1', 'KA1'],
    ['timerDC', 'timer', 'KT1'], ['relay8DC', 'k2', 'KA2'], ['lampGreenDC', 'l1', 'HL1'], ['lampYellowDC', 'l2', 'HL2'],
  ], [
    ['s:+', 'start:13'], ['start:14', 'k1:2'], ['s:-', 'k1:7'],
    ['s:+', 'k1:1'], ['k1:4', 'timer:A1'], ['s:-', 'timer:A2'],
    ['k1:4', 'l1:X1'], ['s:-', 'l1:X2'], ['k1:4', 'timer:15'],
    ['timer:18', 'k2:2'], ['s:-', 'k2:7'], ['s:+', 'k2:1'], ['k2:4', 'l2:X1'], ['s:-', 'l2:X2'],
  ]);
}

export const CIRCUIT_EXAMPLES: CircuitExample[] = [
  { id: 'self-hold', name: '三相电机自锁控制', category: '电机控制', tags: '自锁 / 启停', create: () => exampleProject() },
  { id: 'jog', name: '三相电机点动控制', category: '电机控制', tags: '点动 / 释放停机', create: () => exampleProject(false) },
  { id: 'two-station', name: '两地启停控制', category: '电机控制', tags: '多地启动 / 串联停止', create: twoStation },
  { id: 'multi-station', name: '三相电机多地控制 · 参考接线', category: '电机控制', tags: '三地启停 / 自锁 / 220 V 线圈', create: () => multiStation() },
  { id: 'multi-station-practice', name: '三相电机多地控制 · 接线实操', category: '接线实操', tags: '三地启停 / 空白接线 / 配套参考', create: () => multiStation(true), referenceId: 'multi-station' },
  { id: 'reversing', name: '正反转双重互锁', category: '电机控制', tags: '按钮互锁 / 接触器互锁', create: reversing },
  { id: 'thermal', name: '电机热继电器保护', category: '电机控制', tags: '手动跳闸 / 故障指示', create: thermal },
  { id: 'sequence', name: '两台电机顺序启动', category: '电机控制', tags: '顺序许可 / 联锁停止', create: sequence },
  { id: 'timer', name: '通电延时指示灯', category: '继电与计时', tags: '通电延时 / 断电复位', create: () => controlExample('timer') },
  { id: 'delayed-sequence', name: '继电器延时顺序动作', category: '继电与计时', tags: '延时启动 / 两级动作', create: delayedSequence },
  { id: 'emergency', name: '急停与运行状态指示', category: '继电与计时', tags: '自锁急停 / 状态灯', create: emergency },
  { id: 'pnp', name: 'PNP 传感器继电控制', category: '传感与过程', tags: 'PNP / 物料联动', create: () => controlExample('sensor') },
  { id: 'npn', name: 'NPN 传感器继电控制', category: '传感与过程', tags: 'NPN / 物料联动', create: npn },
  { id: 'float-valve', name: '浮球液位补水控制', category: '传感与过程', tags: '液位开关 / 电磁阀', create: floatValve },
  { id: 'thermostat', name: '恒温加热控制', category: '传感与过程', tags: '温度设定 / 加热输出', create: thermostat },
  { id: 'lighting', name: '单开照明控制', category: '照明控制', tags: '断路器 / 开关 / 灯泡', create: () => lighting(false) },
  { id: 'staircase', name: '楼梯双控照明', category: '照明控制', tags: '双控开关 / 换向触点', create: () => lighting(true) },
];
