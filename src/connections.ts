import { DEFINITIONS, terminalId } from './model';
import type { Component, Port, Project, Wire } from './model';

export interface TerminalConnection {
  wire: Wire;
  terminal: string;
  component?: Component;
  port?: Port;
  portId: string;
}

export interface ConnectedPort {
  port: Port;
  terminal: string;
  connections: TerminalConnection[];
}

// Only physical wires count here, not internal contacts or indirect same-net paths.
export function componentConnections(project: Project, componentId: string): ConnectedPort[] {
  const component = project.components.find((c) => c.id === componentId);
  if (!component) return [];
  const components = new Map(project.components.map((c) => [c.id, c]));
  const rows = DEFINITIONS[component.kind].ports.map((port) => ({
    port, terminal: terminalId(component.id, port.id), connections: [] as TerminalConnection[],
  }));
  const terminals = new Map(rows.map((row) => [row.terminal, row]));
  for (const wire of project.wires) {
    for (const [local, remote] of [[wire.from, wire.to], [wire.to, wire.from]]) {
      const row = terminals.get(local);
      if (!row || (wire.from === wire.to && row.connections.some((c) => c.wire.id === wire.id))) continue;
      const [remoteId, portId] = remote.split(':');
      const target = components.get(remoteId);
      row.connections.push({
        wire, terminal: remote, component: target, portId,
        port: target ? DEFINITIONS[target.kind].ports.find((p) => p.id === portId) : undefined,
      });
    }
  }
  return rows;
}
