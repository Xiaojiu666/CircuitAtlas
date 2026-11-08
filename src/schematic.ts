import Graph from 'graphology';
import { connectedComponents } from 'graphology-components';
import { DEFINITIONS, terminalId } from './model';
import type { Component, Contact, InputPair, Phase, Project } from './model';
import { isContactClosed, voltageBetween } from './simulation';
import type { Controls, Potential, Runtime } from './simulation';

export interface DiagramContact {
  component: Component;
  contact: Contact;
  index: number;
  from: string;
  to: string;
}
interface Feed { terminal: string; net: number; potential: Potential }
interface Route { contacts: DiagramContact[]; nets: number[] }
export interface DiagramBranch {
  supply: string;
  return: string;
  before: DiagramContact[];
  after: DiagramContact[];
}
export interface DiagramRung {
  id: string;
  component: Component;
  type: 'coil' | 'load' | 'phase';
  input: { a: string; b: string };
  channel?: string;
  branches: DiagramBranch[];
}
export interface Schematic {
  rungs: DiagramRung[];
  contacts: DiagramContact[];
  terminalNets: Record<string, number>;
  truncated: boolean;
}

function contactRequirements(refs: DiagramContact[]): Map<string, number> | null {
  const requirements = new Map<string, number>();
  const require = (key: string, mask: number) => {
    const allowed = (requirements.get(key) ?? 7) & mask;
    requirements.set(key, allowed);
    return allowed !== 0;
  };
  for (const { component: c, contact } of refs) {
    const def = DEFINITIONS[c.kind];
    const coil = `coil:${def.follow === 'coil' && c.linkedTo ? c.linkedTo : c.id}`;
    const control = `control:${def.follow === 'target' && c.linkedTo ? c.linkedTo : c.id}:${contact.channel ?? ''}`;
    let valid = true;
    switch (contact.when) {
      case 'coilOn': valid = require(coil, 2); break;
      case 'coilOff': valid = require(coil, 1); break;
      case 'on': valid = require(control, 6); break;
      case 'off': valid = require(control, 1); break;
      case 'position1': valid = require(control, 2); break;
      case 'position2': valid = require(control, 4); break;
      case 'poweredOn': valid = require(coil, 2) && require(control, 6); break;
      case 'poweredOff': valid = require(coil, 2) && require(control, 1); break;
      case 'temperature': valid = require(coil, 2); break;
      case 'timedOn': valid = require(`timer:${c.id}`, 2); break;
      case 'timedOff': valid = require(`timer:${c.id}`, 1); break;
    }
    if (!valid) return null;
  }
  return requirements;
}

// Collapse only physical wiring and straight-through terminals. Switch positions
// stay as graph edges so every potential path remains visible while operating.
export function buildSchematic(project: Project): Schematic {
  const graph = new Graph({ type: 'undirected', allowSelfLoops: false });
  for (const c of project.components) for (const p of DEFINITIONS[c.kind].ports) graph.addNode(terminalId(c.id, p.id));
  const connect = (a: string, b: string) => { if (a !== b && !graph.hasEdge(a, b)) graph.addEdge(a, b); };
  project.wires.forEach((wire) => connect(wire.from, wire.to));
  for (const c of project.components) for (const contact of DEFINITIONS[c.kind].contacts ?? []) {
    if (contact.when === 'always') connect(terminalId(c.id, contact.a), terminalId(c.id, contact.b));
  }
  const nets = new Map<string, number>();
  connectedComponents(graph).forEach((terminals, i) => terminals.forEach((terminal) => nets.set(terminal, i)));
  const edges = new Map<number, { next: number; contact: DiagramContact }[]>();
  const contacts: DiagramContact[] = [];
  for (const c of project.components) (DEFINITIONS[c.kind].contacts ?? []).forEach((contact, index) => {
    const from = terminalId(c.id, contact.a), to = terminalId(c.id, contact.b);
    const ref = { component: c, contact, index, from, to };
    contacts.push(ref);
    if (contact.when === 'always' || nets.get(from) === nets.get(to)) return;
    const a = nets.get(from)!, b = nets.get(to)!;
    edges.set(a, [...(edges.get(a) ?? []), { next: b, contact: ref }]);
    edges.set(b, [...(edges.get(b) ?? []), { next: a, contact: { ...ref, from: to, to: from } }]);
  });
  const feeds: Feed[] = [];
  for (const c of project.components) {
    const def = DEFINITIONS[c.kind];
    if (!def.supply) continue;
    for (const port of def.ports) {
      const phase = port.phase ?? (port.id.startsWith('+') ? '+' : port.id.startsWith('-') ? '-' : port.id as Phase);
      const net = nets.get(terminalId(c.id, port.id))!;
      if (feeds.some((feed) => feed.net === net && feed.potential.source === c.id && feed.potential.phase === phase)) continue;
      feeds.push({ terminal: terminalId(c.id, port.id), net,
        potential: { source: c.id, phase, voltage: c.voltage, kind: def.supply === 'dc' ? 'dc' : def.supply === 'ac1' ? 'source1' : 'source3' } });
    }
  }
  const sourceNets = new Set(feeds.map((feed) => feed.net));
  let truncated = false;
  function routes(start: number, target: number): Route[] {
    const result: Route[] = [];
    let visits = 0;
    const walk = (net: number, visited: Set<number>, path: DiagramContact[]) => {
      if (++visits > 2500 || result.length >= 8 || path.length > 14) { truncated = true; return; }
      if (net === target) { result.push({ contacts: path, nets: [...visited] }); return; }
      for (const edge of edges.get(net) ?? []) {
        if (visited.has(edge.next) || (sourceNets.has(edge.next) && edge.next !== target)) continue;
        const nextPath = [...path, edge.contact];
        if (contactRequirements(nextPath)) walk(edge.next, new Set([...visited, edge.next]), nextPath);
      }
    };
    walk(start, new Set([start]), []);
    return result;
  }
  const cache = new Map<string, Route[]>();
  const find = (start: number, target: number) => {
    const key = `${start}:${target}`;
    if (!cache.has(key)) cache.set(key, routes(start, target));
    return cache.get(key)!;
  };
  const rungs: DiagramRung[] = [];
  const addInput = (c: Component, type: 'coil' | 'load', input: InputPair, index: number) => {
    const branches: DiagramBranch[] = [];
    for (const supply of feeds) for (const back of feeds) {
      const voltage = voltageBetween(supply.potential, back.potential);
      if (voltage < c.voltage * 0.85 || voltage > c.voltage * 1.1) continue;
      if (input.supply === 'dc' && (supply.potential.kind !== 'dc' || supply.potential.phase !== '+' || back.potential.phase !== '-')) continue;
      if (input.supply === 'ac' && supply.potential.kind === 'dc') continue;
      if (['N', 'PE', '-'].includes(supply.potential.phase)) continue;
      for (const left of find(supply.net, nets.get(terminalId(c.id, input.a))!)) {
        for (const right of find(nets.get(terminalId(c.id, input.b))!, back.net)) {
          if (left.nets.some((net) => right.nets.includes(net))) continue;
          if (!contactRequirements([...left.contacts, ...right.contacts])) continue;
          if (branches.length >= 12) { truncated = true; continue; }
          branches.push({ supply: supply.terminal, return: back.terminal, before: left.contacts, after: right.contacts });
        }
      }
    }
    rungs.push({ id: `${c.id}:${type}:${index}`, component: c, type, input, channel: input.channel, branches });
  };
  for (const c of project.components) {
    const def = DEFINITIONS[c.kind];
    if (def.capability === 'wiring') continue;
    if (def.coil) addInput(c, 'coil', def.coil, 0);
    def.loads?.forEach((input, i) => addInput(c, 'load', input, i));
    if (c.kind === 'motor') {
      ['U1', 'V1', 'W1'].forEach((port, i) => {
        const branches: DiagramBranch[] = [];
        for (const feed of feeds.filter((feed) => feed.potential.kind === 'source3' && ['L1', 'L2', 'L3'].includes(feed.potential.phase))) {
          for (const route of find(feed.net, nets.get(terminalId(c.id, port))!)) {
            branches.push({ supply: feed.terminal, return: '', before: route.contacts, after: [] });
          }
        }
        rungs.push({ id: `${c.id}:phase:${i}`, component: c, type: 'phase', input: { a: port, b: ['U2', 'V2', 'W2'][i] }, branches });
      });
    }
  }
  // Reciprocal NC interlocks make the corresponding coils mutually exclusive.
  // Prune hypothetical main-pole cross-feeds that require both coils at once.
  const requiredOff = new Map<string, Set<string>>();
  for (const rung of rungs.filter((rung) => rung.type === 'coil' && rung.branches.length > 0)) {
    const constraints = rung.branches.map((b) => contactRequirements([...b.before, ...b.after])!);
    requiredOff.set(`coil:${rung.component.id}`, new Set([...constraints[0]]
      .filter(([key, mask]) => key.startsWith('coil:') && mask === 1 && constraints.every((c) => c.get(key) === 1))
      .map(([key]) => key)));
  }
  for (const rung of rungs) rung.branches = rung.branches.filter((branch) => {
    const constraints = contactRequirements([...branch.before, ...branch.after])!;
    const on = [...constraints].filter(([key, mask]) => key.startsWith('coil:') && mask === 2).map(([key]) => key);
    return !on.some((a) => on.some((b) => requiredOff.get(a)?.has(b) && requiredOff.get(b)?.has(a)));
  });
  rungs.sort((a, b) => Number(a.type === 'phase') - Number(b.type === 'phase'));
  return { rungs, contacts, terminalNets: Object.fromEntries(nets), truncated };
}

export function branchConducting(branch: DiagramBranch, controls: Controls, runtime: Runtime) {
  return [...branch.before, ...branch.after].every((ref) => isContactClosed(ref.component, ref.contact, controls, runtime));
}
export function rungActive(rung: DiagramRung, runtime: Runtime) {
  if (rung.type === 'coil') return !!runtime.coils[rung.component.id];
  const lamps = runtime.lampChannels[rung.component.id];
  return rung.type === 'load' && lamps ? !!lamps[rung.channel ?? '0'] : !!runtime.outputs[rung.component.id];
}
export function terminalState(terminal: string, runtime: Runtime): 'live' | 'return' | 'earth' | 'off' {
  const phase = runtime.potentials[terminal]?.phase;
  if (!phase) return 'off';
  return phase === 'PE' ? 'earth' : phase === 'N' || phase === '-' ? 'return' : 'live';
}
