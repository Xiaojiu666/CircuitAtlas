import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api';
import { DEFINITIONS, terminalId } from './model';
import type { Project } from './model';
import type { DiagramContact, DiagramRung, Schematic } from './schematic';

export interface SheetSymbol {
  id: string;
  contact?: DiagramContact;
  rung?: DiagramRung;
  terminal?: string;
  label?: string;
  net?: number;
}
export interface SheetConnection {
  id: string;
  net: number;
  terminal: string;
  source: string;
  target: string;
}
export interface CircuitSheet {
  graph: ElkNode;
  symbols: SheetSymbol[];
  connections: SheetConnection[];
}
interface Endpoint { port: string; terminal: string; output: boolean }

export function buildCircuitSheet(project: Project, schematic: Schematic): CircuitSheet {
  const nodes: ElkNode[] = [], symbols: SheetSymbol[] = [], connections: SheetConnection[] = [];
  const nets = new Map<number, Endpoint[]>();
  const endpoint = (port: string, terminal: string, output: boolean) => {
    const net = schematic.terminalNets[terminal];
    nets.set(net, [...(nets.get(net) ?? []), { port, terminal, output }]);
  };
  const twoPort = (symbol: SheetSymbol, a: string, b: string) => {
    const width = symbol.rung ? 148 : 120, height = 104;
    nodes.push({ id: symbol.id, width, height, layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
      ports: [
        { id: `${symbol.id}:a`, x: 0, y: 48, width: 0, height: 0, layoutOptions: { 'elk.port.side': 'WEST' } },
        { id: `${symbol.id}:b`, x: width, y: 48, width: 0, height: 0, layoutOptions: { 'elk.port.side': 'EAST' } },
      ] });
    symbols.push(symbol);
    endpoint(`${symbol.id}:a`, a, false);
    endpoint(`${symbol.id}:b`, b, true);
  };
  const contacts = new Map<string, DiagramContact>();
  for (const rung of schematic.rungs) for (const branch of rung.branches) {
    for (const ref of [...branch.before, ...branch.after]) {
      const id = `contact:${ref.component.id}:${ref.index}`;
      if (!contacts.has(id)) contacts.set(id, ref);
    }
  }
  contacts.forEach((contact, id) => twoPort({ id, contact }, contact.from, contact.to));
  for (const rung of schematic.rungs) {
    twoPort({ id: `load:${rung.id}`, rung }, terminalId(rung.component.id, rung.input.a), terminalId(rung.component.id, rung.input.b));
  }
  for (const c of project.components) {
    const def = DEFINITIONS[c.kind];
    if (!def.supply) continue;
    for (const port of def.ports) {
      const terminal = terminalId(c.id, port.id), net = schematic.terminalNets[terminal];
      if (!nets.has(net)) continue;
      const returning = ['N', '-', 'PE'].includes(port.phase ?? port.id);
      const id = `feed:${terminal}`, width = 62;
      nodes.push({ id, width, height: 50, layoutOptions: {
        'elk.portConstraints': 'FIXED_POS',
        'elk.layered.layering.layerConstraint': returning ? 'LAST' : 'FIRST',
      }, ports: [{ id: `${id}:port`, width: 0, height: 0, x: returning ? 0 : width, y: 25,
        layoutOptions: { 'elk.port.side': returning ? 'WEST' : 'EAST' } }] });
      symbols.push({ id, terminal, label: `${c.name} / ${port.label}` });
      endpoint(`${id}:port`, terminal, !returning);
    }
  }
  const connect = (a: Endpoint, b: Endpoint, net: number) => {
    connections.push({ id: `wire:${connections.length}`, net, terminal: a.terminal, source: a.port, target: b.port });
  };
  for (const [net, endpoints] of nets) {
    const outputs = endpoints.filter((e) => e.output), inputs = endpoints.filter((e) => !e.output);
    if (endpoints.length === 2) {
      const a = outputs[0] ?? endpoints[0], b = endpoints.find((e) => e !== a)!;
      connect(a, b, net);
    } else if (endpoints.length > 2) {
      const id = `junction:${net}`;
      nodes.push({ id, width: 8, height: 8, layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
        ports: [{ id: `${id}:in`, x: 0, y: 4, width: 0, height: 0, layoutOptions: { 'elk.port.side': 'WEST' } },
          { id: `${id}:out`, x: 8, y: 4, width: 0, height: 0, layoutOptions: { 'elk.port.side': 'EAST' } }] });
      symbols.push({ id, net, terminal: endpoints[0].terminal });
      outputs.forEach((e) => connect(e, { port: `${id}:in`, terminal: e.terminal, output: false }, net));
      inputs.forEach((e) => connect({ port: `${id}:out`, terminal: e.terminal, output: true }, e, net));
    }
  }
  const edges: ElkExtendedEdge[] = connections.map((c) => ({ id: c.id, sources: [c.source], targets: [c.target] }));
  return { symbols, connections, graph: { id: 'circuit', children: nodes, edges, layoutOptions: {
    'elk.algorithm': 'layered',
    'elk.direction': 'RIGHT',
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.padding': '[top=85,left=30,bottom=35,right=30]',
    'elk.spacing.nodeNode': '24',
    'elk.layered.spacing.nodeNodeBetweenLayers': '36',
    'elk.layered.spacing.edgeNodeBetweenLayers': '22',
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    'elk.separateConnectedComponents': 'true',
    'elk.spacing.componentComponent': '55',
  } } };
}

let engine: Promise<InstanceType<typeof import('elkjs/lib/elk.bundled.js').default>> | undefined;
export async function layoutCircuitSheet(sheet: CircuitSheet): Promise<CircuitSheet> {
  engine ??= import('elkjs/lib/elk.bundled.js').then(({ default: ELK }) => new ELK());
  return { ...sheet, graph: await (await engine).layout(sheet.graph) };
}
