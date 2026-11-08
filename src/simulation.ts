import Graph from 'graphology';
import { connectedComponents } from 'graphology-components';
import { DEFINITIONS, terminalId } from './model';
import type { Component, Contact, InputPair, Phase, Project } from './model';

export interface Controls { [id: string]: boolean | number }
export interface Potential { source: string; phase: Phase; voltage: number; kind: 'source3' | 'source1' | 'dc' }
export interface TimerState { since: number | null; elapsed: number; done: boolean }
export interface CoilInput {
  voltage: number;
  issue: 'open' | 'samePotential' | 'invalidSupply' | 'undervoltage' | 'overvoltage' | 'reversed' | null;
  message: string;
}
export interface Runtime {
  coils: Record<string, boolean>;
  coilInputs: Record<string, CoilInput>;
  engaged: Record<string, boolean>;
  lamps: Record<string, boolean>;
  lampChannels: Record<string, Record<string, boolean>>;
  motors: Record<string, 'forward' | 'reverse' | 'stopped'>;
  outputs: Record<string, boolean>;
  readings: Record<string, number | null>;
  timers: Record<string, TimerState>;
  timeMs: number;
  potentials: Record<string, Potential>;
  nets: Record<string, number>;
  fault: string | null;
  warnings: string[];
}
export const emptyRuntime = (): Runtime => ({
  coils: {}, coilInputs: {}, engaged: {}, lamps: {}, lampChannels: {}, motors: {}, outputs: {}, readings: {}, timers: {}, timeMs: 0,
  potentials: {}, nets: {}, fault: null, warnings: [],
});

function controlValue(c: Component, controls: Controls, channel?: string) {
  const def = DEFINITIONS[c.kind];
  const id = def.follow === 'target' && c.linkedTo ? c.linkedTo : c.id;
  return controls[channel ? `${id}.${channel}` : id] ?? 0;
}

function contactClosed(c: Component, contact: Contact, controls: Controls, coils: Runtime['coils'], delayed: Record<string, boolean>) {
  const value = controlValue(c, controls, contact.channel);
  const coilId = DEFINITIONS[c.kind].follow === 'coil' && c.linkedTo ? c.linkedTo : c.id;
  const coil = !!coils[coilId];
  switch (contact.when) {
    case 'always': return true;
    case 'on': return !!value;
    case 'off': return !value;
    case 'coilOn': return coil;
    case 'coilOff': return !coil;
    case 'timedOn': return !!delayed[c.id];
    case 'timedOff': return !delayed[c.id];
    case 'position1': return Number(value) === 1;
    case 'position2': return Number(value) === 2;
    case 'poweredOn': return coil && !!value;
    case 'poweredOff': return coil && !value;
    case 'temperature': return coil && (c.value ?? 25) < (c.setpoint ?? 30);
    case 'level': return (c.value ?? 50) > 0;
  }
}

export function isContactClosed(c: Component, contact: Contact, controls: Controls, runtime: Runtime) {
  return contactClosed(c, contact, controls, { ...runtime.coils, ...runtime.engaged },
    Object.fromEntries(Object.entries(runtime.timers).map(([id, timer]) => [id, timer.done])));
}

function network(project: Project, controls: Controls, coils: Runtime['coils'], delayed: Record<string, boolean>) {
  const graph = new Graph({ type: 'undirected', allowSelfLoops: false });
  project.components.forEach((c) => DEFINITIONS[c.kind].ports.forEach((p) => graph.addNode(terminalId(c.id, p.id))));
  const connect = (a: string, b: string) => { if (a !== b && !graph.hasEdge(a, b)) graph.addEdge(a, b); };
  project.wires.forEach((w) => connect(w.from, w.to));
  for (const c of project.components) {
    for (const contact of DEFINITIONS[c.kind].contacts ?? []) {
      if (contactClosed(c, contact, controls, coils, delayed)) connect(terminalId(c.id, contact.a), terminalId(c.id, contact.b));
    }
  }
  const potentials: Runtime['potentials'] = {};
  const nets: Runtime['nets'] = {};
  const sources = new Map<string, Potential>();
  for (const c of project.components) {
    const def = DEFINITIONS[c.kind];
    if (!def.supply) continue;
    for (const p of def.ports) {
      const phase = p.phase ?? (p.id.startsWith('+') ? '+' : p.id.startsWith('-') ? '-' : p.id as Phase);
      sources.set(terminalId(c.id, p.id), {
        source: c.id, phase, voltage: c.voltage,
        kind: def.supply === 'dc' ? 'dc' : def.supply === 'ac1' ? 'source1' : 'source3',
      });
    }
  }
  let fault: string | null = null;
  connectedComponents(graph).forEach((net, index) => {
    const feeds = net.map((t) => sources.get(t)).filter((p): p is Potential => !!p);
    const distinct = new Set(feeds.map((p) => `${p.source}:${p.phase}`));
    if (distinct.size > 1) fault = `检测到电源端短接（${[...new Set(feeds.map((p) => p.phase))].join(' / ')}），仿真已保护`;
    for (const t of net) {
      nets[t] = index;
      if (feeds.length) potentials[t] = feeds[0];
    }
  });
  return { potentials, nets, fault };
}

export function voltageBetween(a?: Potential, b?: Potential) {
  if (!a || !b || a.source !== b.source || a.phase === b.phase || a.phase === 'PE' || b.phase === 'PE') return 0;
  if (a.kind === 'dc') return new Set([a.phase, b.phase]).has('+') && new Set([a.phase, b.phase]).has('-') ? a.voltage : 0;
  if (a.kind === 'source1') return a.voltage;
  if ([a.phase, b.phase].includes('N')) return a.voltage / Math.sqrt(3);
  return a.voltage;
}

function inputPowered(c: Component, input: InputPair, potentials: Runtime['potentials']) {
  const a = potentials[terminalId(c.id, input.a)];
  const b = potentials[terminalId(c.id, input.b)];
  const voltage = voltageBetween(a, b);
  if (!a || !b || voltage < c.voltage * 0.85 || voltage > c.voltage * 1.1) return false;
  if (input.supply === 'ac') return a.kind !== 'dc';
  if (input.supply === 'dc') return a.kind === 'dc' && a.phase === '+' && b.phase === '-';
  return true;
}

function coilInput(c: Component, potentials: Runtime['potentials']): CoilInput {
  const input = DEFINITIONS[c.kind].coil!;
  const a = potentials[terminalId(c.id, input.a)], b = potentials[terminalId(c.id, input.b)];
  const voltage = voltageBetween(a, b);
  if (!a || !b) return { voltage, issue: 'open', message: '线圈回路未接通' };
  if (a.source !== b.source || a.phase === 'PE' || b.phase === 'PE') {
    return { voltage, issue: 'invalidSupply', message: '线圈电源接法无效' };
  }
  if (input.supply === 'ac' && a.kind === 'dc') return { voltage, issue: 'invalidSupply', message: '交流线圈不能使用直流电源' };
  if (input.supply === 'dc' && a.kind !== 'dc') return { voltage, issue: 'invalidSupply', message: '线圈需要直流电源' };
  if (input.supply === 'dc' && a.phase !== '+') return { voltage, issue: 'reversed', message: '直流线圈极性接反' };
  if (!voltage) return { voltage, issue: 'samePotential', message: '线圈两端同电位' };
  if (voltage < c.voltage * .85) return { voltage, issue: 'undervoltage', message: '线圈欠压，无法吸合' };
  if (voltage > c.voltage * 1.1) return { voltage, issue: 'overvoltage', message: '线圈过压，无法吸合' };
  return { voltage, issue: null, message: '线圈得电' };
}

function motorState(c: Component, runtime: Runtime): 'forward' | 'reverse' | 'stopped' {
  const { potentials, nets } = runtime;
  const get = (p: string) => potentials[terminalId(c.id, p)];
  const net = (p: string) => nets[terminalId(c.id, p)];
  const phaseIndex = (p: Potential | undefined) => p && p.kind === 'source3' ? ['L1', 'L2', 'L3'].indexOf(p.phase) : -1;
  const starts = ['U1', 'V1', 'W1'];
  const ends = ['U2', 'V2', 'W2'];
  const distinctPhases = (ports: string[]) => {
    const phases = ports.map((p) => phaseIndex(get(p)));
    const feeds = ports.map(get);
    return phases.every((v) => v >= 0) && new Set(phases).size === 3 && new Set(feeds.map((p) => p?.source)).size === 1;
  };
  const star = (ports: string[]) => ports.every((p) => net(p) === net(ports[0])) &&
    (!get(ports[0]) || get(ports[0]).phase === 'N');
  let driven: string[] | null = null;
  if (distinctPhases(starts) && star(ends)) driven = starts;
  else if (distinctPhases(ends) && star(starts)) driven = ends;
  else if (distinctPhases(starts) && distinctPhases(ends) && starts.every((p, i) => voltageBetween(get(p), get(ends[i])) > 0)) {
    const differences = starts.map((p, i) => (phaseIndex(get(ends[i])) - phaseIndex(get(p)) + 3) % 3);
    if (new Set(differences).size === 1) driven = starts;
  }
  if (!driven) return 'stopped';
  const feed = get(driven[0]);
  if (!feed || feed.voltage < c.voltage * 0.85 || feed.voltage > c.voltage * 1.1) return 'stopped';
  const phases = driven.map((p) => phaseIndex(get(p)));
  return (phases[1] - phases[0] + 3) % 3 === 1 ? 'forward' : 'reverse';
}

export function simulate(project: Project, controls: Controls, previous: Runtime = emptyRuntime(), nowMs = performance.now()): Runtime {
  const result = emptyRuntime();
  const now = Math.max(previous.timeMs, nowMs);
  result.timeMs = now;
  const actuators = project.components.filter((c) => DEFINITIONS[c.kind].coil && DEFINITIONS[c.kind].capability !== 'wiring');
  const timed = actuators.filter((c) => DEFINITIONS[c.kind].family === 'timer');
  let coils: Runtime['coils'] = Object.fromEntries(actuators.map((c) => [c.id, previous.coils[c.id] ?? false]));
  let delayed = Object.fromEntries(timed.map((c) => [c.id, previous.timers[c.id]?.done ?? false]));
  const seen = new Set<string>();
  const limit = Math.max(32, actuators.length * 2 + 4);
  // Resolve contact feedback at one time instant; timer clocks advance only between calls.
  for (let pass = 0; pass < limit; pass++) {
    // Mechanical pressure closes contacts without pretending that the coil has power.
    const engaged = Object.fromEntries(actuators.map((c) => [c.id,
      !!coils[c.id] || (DEFINITIONS[c.kind].family === 'contactor' && !!controls[c.id]),
    ]));
    const net = network(project, controls, engaged, delayed);
    Object.assign(result, net);
    if (net.fault) return { ...emptyRuntime(), fault: net.fault, nets: net.nets, timeMs: now };
    const next = Object.fromEntries(actuators.map((c) => [c.id, inputPowered(c, DEFINITIONS[c.kind].coil!, net.potentials)]));
    const timers: Runtime['timers'] = {};
    for (const c of timed) {
      const since = next[c.id] ? previous.timers[c.id]?.since ?? now : null;
      const elapsed = since === null ? 0 : Math.max(0, now - since);
      timers[c.id] = { since, elapsed, done: since !== null && elapsed >= (c.delay ?? 3) * 1000 };
    }
    const nextDelayed = Object.fromEntries(timed.map((c) => [c.id, timers[c.id].done]));
    if (actuators.every((c) => next[c.id] === coils[c.id]) && timed.every((c) => nextDelayed[c.id] === delayed[c.id])) {
      result.coils = next;
      result.engaged = engaged;
      result.timers = timers;
      break;
    }
    const key = JSON.stringify([next, nextDelayed]);
    if (seen.has(key)) return { ...emptyRuntime(), fault: '触点反馈无法稳定，检查常闭触点与线圈接线', timeMs: now };
    seen.add(key);
    coils = next;
    delayed = nextDelayed;
    if (pass === limit - 1) return { ...emptyRuntime(), fault: '电路未收敛，仿真已停止', timeMs: now };
  }

  for (const c of project.components) {
    const def = DEFINITIONS[c.kind];
    result.outputs[c.id] = !!result.coils[c.id];
    if (def.family === 'contactor') result.outputs[c.id] = !!result.engaged[c.id];
    if (def.capability === 'wiring') {
      result.outputs[c.id] = false;
      if (def.family === 'meter') result.readings[c.id] = null;
      continue;
    }
    if (def.coil) {
      const input = coilInput(c, result.potentials);
      result.coilInputs[c.id] = input;
      if (input.issue && input.issue !== 'open') {
        result.warnings.push(`${c.name} ${input.message}（${def.coil.a}-${def.coil.b} 约 ${Math.round(input.voltage)} V / 额定 ${c.voltage} V）`);
      }
    }
    if (def.loads?.length) {
      const channels: Record<string, boolean> = {};
      def.loads.forEach((input, i) => { channels[input.channel ?? String(i)] = inputPowered(c, input, result.potentials); });
      const active = Object.values(channels).some(Boolean);
      result.outputs[c.id] = active;
      if (['lamp', 'tower', 'pushbutton'].includes(def.family ?? '')) {
        result.lamps[c.id] = active;
        result.lampChannels[c.id] = channels;
      }
      if (def.family === 'motor') result.motors[c.id] = active ? 'forward' : 'stopped';
      for (const input of def.loads) {
        const v = voltageBetween(result.potentials[terminalId(c.id, input.a)], result.potentials[terminalId(c.id, input.b)]);
        if (v > c.voltage * 1.1) result.warnings.push(`${c.name} 负载过压`);
      }
    }
    if (def.family === 'timer') result.outputs[c.id] = !!result.timers[c.id]?.done;
    if (def.family === 'auxiliary') result.outputs[c.id] = !!(c.linkedTo && result.engaged[c.linkedTo]);
    if (def.family === 'sensor') {
      const trigger = !!controlValue(c, controls);
      result.outputs[c.id] = def.coil ? !!result.coils[c.id] && (c.kind === 'lightCurtain' ? !trigger : trigger) : trigger;
    }
    if (def.family === 'thermostat') result.outputs[c.id] = !!result.coils[c.id] && (c.value ?? 25) < (c.setpoint ?? 30);
    if (['switch', 'selector', 'breaker', 'target', 'pushbutton'].includes(def.family ?? '')) {
      result.outputs[c.id] = def.channels ? def.channels.some((channel) => !!controlValue(c, controls, channel)) : !!controlValue(c, controls);
    }
    if (def.family === 'potentiometer') result.outputs[c.id] = (c.value ?? 50) > 0;
    if (def.family === 'meter' && def.unit === 'V') {
      const a = result.potentials[terminalId(c.id, 'V+')];
      const b = result.potentials[terminalId(c.id, 'V-')];
      result.readings[c.id] = a && b && a.source === b.source && a.phase !== 'PE' && b.phase !== 'PE' ? voltageBetween(a, b) : null;
    }
    if (c.kind === 'motor') {
      result.motors[c.id] = motorState(c, result);
      result.outputs[c.id] = result.motors[c.id] !== 'stopped';
      const windingPorts = ['U1', 'V1', 'W1', 'U2', 'V2', 'W2'];
      const supply = windingPorts.map((p) => result.potentials[terminalId(c.id, p)]).find((p) => p && ['L1', 'L2', 'L3'].includes(p.phase));
      const mismatched = supply && (supply.voltage < c.voltage * 0.85 || supply.voltage > c.voltage * 1.1);
      if (mismatched) result.warnings.push(`${c.name} 电源电压与额定电压不匹配`);
      else if (supply && result.motors[c.id] === 'stopped') result.warnings.push(`${c.name} 缺相或绕组接线不完整`);
    }
    if (def.family === 'motor') {
      const pe = result.potentials[terminalId(c.id, 'PE')];
      if (pe?.phase !== 'PE') result.warnings.push(`${c.name} 保护接地未连接`);
    }
  }
  return result;
}

export function checkProject(project: Project) {
  const issues: string[] = [];
  const counts = new Map<string, number>();
  project.wires.forEach((w) => { counts.set(w.from, (counts.get(w.from) ?? 0) + 1); counts.set(w.to, (counts.get(w.to) ?? 0) + 1); });
  if (!project.components.some((c) => DEFINITIONS[c.kind].supply)) issues.push('工程中没有电源');
  if (!project.wires.length) issues.push('尚未连接导线');
  for (const c of project.components) {
    const def = DEFINITIONS[c.kind];
    if (def.ports.length && !def.ports.some((p) => counts.has(terminalId(c.id, p.id)))) issues.push(`${c.name} 尚未接线`);
    if (def.coil && (!counts.has(terminalId(c.id, def.coil.a)) || !counts.has(terminalId(c.id, def.coil.b)))) issues.push(`${c.name} 线圈端子未完整连接`);
    if (def.family === 'motor' && !counts.has(terminalId(c.id, 'PE'))) issues.push(`${c.name} 保护接地未连接`);
    if (def.capability === 'wiring') issues.push(`${c.name} 为仅接线模型，不参与内部功能仿真`);
    if (def.follow === 'coil' && (!c.linkedTo || !project.components.some((target) => target.id === c.linkedTo && DEFINITIONS[target.kind].coil))) issues.push(`${c.name} 尚未关联有效线圈`);
    if (def.follow === 'target' && c.linkedTo && !project.components.some((target) => target.id === c.linkedTo && DEFINITIONS[target.kind].family === 'target')) issues.push(`${c.name} 关联物料不存在`);
  }
  const safety = simulate(project, Object.fromEntries(project.components.filter((c) => DEFINITIONS[c.kind].family === 'breaker').map((c) => [c.id, true])));
  if (safety.fault) issues.push(safety.fault);
  return [...new Set(issues)];
}
