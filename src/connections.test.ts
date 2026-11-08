import { describe, expect, it } from 'vitest';
import { componentConnections } from './connections';
import { DEFINITIONS, exampleProject, makeComponent } from './model';
import type { Project } from './model';

function fixture(): Project {
  return {
    version: 1, name: 'connections', components: [
      makeComponent('contactor', 'km', 'KM1', 0, 0),
      makeComponent('contactor', 'km2', 'KM2', 300, 0),
      makeComponent('buttonNO', 'sb', 'SB1', 0, 300),
      makeComponent('lamp', 'hl', 'HL1', 300, 300),
    ],
    wires: [
      { id: 'w1', from: 'sb:14', to: 'km:A1', color: 'auto' },
      { id: 'w2', from: 'km:A1', to: 'hl:X1', color: 'red' },
      { id: 'w3', from: 'km2:A2', to: 'hl:X2', color: 'blue' },
    ],
  };
}

describe('component terminal connections', () => {
  it('lists every defined port, including unwired ones, in device order', () => {
    const rows = componentConnections(fixture(), 'km');
    expect(rows.map((r) => r.port.id)).toEqual(DEFINITIONS.contactor.ports.map((p) => p.id));
    expect(rows.find((r) => r.port.id === 'A2')?.connections).toEqual([]);
    expect(rows.every((r) => r.terminal === `km:${r.port.id}`)).toBe(true);
  });

  it('lists multiple wires at one terminal regardless of wire direction', () => {
    const a1 = componentConnections(fixture(), 'km').find((r) => r.port.id === 'A1')!;
    expect(a1.connections.map((c) => [c.wire.id, c.component?.name, c.portId, c.port?.id])).toEqual([
      ['w1', 'SB1', '14', '14'], ['w2', 'HL1', 'X1', 'X1'],
    ]);
  });

  it('does not confuse similarly prefixed IDs or add indirect/internal connections', () => {
    const p = fixture();
    p.wires.push({ id: 'w4', from: 'hl:X1', to: 'km2:A1', color: 'auto' });
    const connections = componentConnections(p, 'km').flatMap((r) => r.connections);
    expect(connections.map((c) => c.wire.id)).toEqual(['w1', 'w2']);
    expect(connections.some((c) => c.terminal === 'sb:13' || c.terminal.startsWith('km2:'))).toBe(false);
  });

  it('shows a same-device jumper at both of its terminals', () => {
    const p = fixture();
    p.wires.push({ id: 'jumper', from: 'km:13', to: 'km:1', color: 'auto' });
    const rows = componentConnections(p, 'km');
    expect(rows.find((r) => r.port.id === '13')?.connections[0].terminal).toBe('km:1');
    expect(rows.find((r) => r.port.id === '1')?.connections[0].terminal).toBe('km:13');
  });

  it('reflects wire edits and removed devices without stale entries or mutation', () => {
    const p = fixture();
    const before = JSON.stringify(p);
    componentConnections(p, 'km');
    expect(JSON.stringify(p)).toBe(before);
    p.wires = p.wires.filter((w) => w.id !== 'w1');
    expect(componentConnections(p, 'km')[0].connections.map((c) => c.wire.id)).toEqual(['w2']);
    expect(componentConnections(p, 'missing')).toEqual([]);
    p.components = p.components.filter((c) => c.id !== 'hl');
    expect(componentConnections(p, 'km')[0].connections[0]).toMatchObject({
      component: undefined, port: undefined, terminal: 'hl:X1', portId: 'X1',
    });
  });

  it('matches all KM1 direct wires in the self-hold example', () => {
    const rows = componentConnections(exampleProject(), 'contactor');
    const destinations = (port: string) => rows.find((r) => r.port.id === port)!.connections.map((c) => c.terminal);
    expect(destinations('A1')).toEqual(['start:14', 'lamp:X1']);
    expect(destinations('A2')).toEqual(['source:N']);
    expect(destinations('13')).toEqual(['stop:22']);
    expect(destinations('14')).toEqual(['start:14']);
    expect(destinations('21')).toEqual([]);
    expect(destinations('22')).toEqual([]);
    expect(new Set(rows.flatMap((r) => r.connections.map((c) => c.wire.id))).size).toBe(11);
  });
});
