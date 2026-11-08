import { describe, expect, it } from 'vitest';
import { CIRCUIT_EXAMPLES } from './examples';
import { buildSchematic } from './schematic';
import { buildCircuitSheet, layoutCircuitSheet } from './schematicLayout';

const example = (id: string) => CIRCUIT_EXAMPLES.find((e) => e.id === id)!.create();

describe('unified circuit sheet', () => {
  it('draws shared contacts once and joins coil and lamp at their actual common nets', () => {
    const p = example('self-hold');
    const d = buildSchematic(p), sheet = buildCircuitSheet(p, d);
    const contacts = sheet.symbols.filter((s) => s.contact);
    expect(new Set(contacts.map((s) => s.id)).size).toBe(contacts.length);
    expect(contacts.filter((s) => s.contact!.component.id === 'breaker' && s.contact!.index === 0)).toHaveLength(1);
    const common = d.terminalNets['contactor:A1'];
    expect(common).toBe(d.terminalNets['lamp:X1']);
    expect(sheet.symbols.find((s) => s.net === common)).toBeDefined();
    const junction = `junction:${common}:out`;
    expect(sheet.connections.some((c) => c.source === junction && c.target === 'load:contactor:coil:0:a')).toBe(true);
    expect(sheet.connections.some((c) => c.source === junction && c.target === 'load:lamp:load:0:a')).toBe(true);
  });

  it('never connects terminals from different static nets', () => {
    for (const e of CIRCUIT_EXAMPLES) {
      const p = e.create(), d = buildSchematic(p), sheet = buildCircuitSheet(p, d);
      for (const wire of sheet.connections) {
        expect(d.terminalNets[wire.terminal]).toBe(wire.net);
        const endpoints = [wire.source, wire.target].map((id) => {
          const symbolId = id.replace(/:(a|b|port|in|out)$/, '');
          const s = sheet.symbols.find((s) => s.id === symbolId)!;
          return s.contact ? id.endsWith(':a') ? s.contact.from : s.contact.to :
            s.rung ? `${s.rung.component.id}:${id.endsWith(':a') ? s.rung.input.a : s.rung.input.b}` : s.terminal!;
        });
        expect(d.terminalNets[endpoints[0]], `${e.id}: ${wire.id}`).toBe(d.terminalNets[endpoints[1]]);
      }
    }
  });

  it('preserves NPN return-side contacts and star bridges without adding a neutral to the motor', () => {
    const p = example('npn'), sheet = buildCircuitSheet(p, buildSchematic(p));
    expect(sheet.symbols.some((s) => s.contact?.component.id === 'control')).toBe(true);
    const q = example('self-hold'), d = buildSchematic(q), motorSheet = buildCircuitSheet(q, d);
    const star = motorSheet.connections.filter((c) => c.net === d.terminalNets['motor:U2']);
    expect(star).toHaveLength(3);
    expect(star.every((c) => c.source.startsWith('load:motor:phase:'))).toBe(true);
    expect(star.every((c) => !c.target.startsWith('feed:'))).toBe(true);
  });

  it.each(CIRCUIT_EXAMPLES.map((e) => [e.id, e.create] as const))('%s lays out non-overlapping symbols and orthogonal wiring', async (_, create) => {
    const p = create(), sheet = await layoutCircuitSheet(buildCircuitSheet(p, buildSchematic(p)));
    expect(sheet.graph.width).toBeGreaterThan(0);
    expect(sheet.graph.height).toBeGreaterThan(0);
    const nodes = sheet.graph.children!;
    for (const [i, a] of nodes.entries()) {
      expect(a.x! >= 0 && a.y! >= 0).toBe(true);
      expect(a.x! + a.width!).toBeLessThanOrEqual(sheet.graph.width!);
      expect(a.y! + a.height!).toBeLessThanOrEqual(sheet.graph.height!);
      for (const b of nodes.slice(i + 1)) {
        const overlap = a.x! < b.x! + b.width! && a.x! + a.width! > b.x! &&
          a.y! < b.y! + b.height! && a.y! + a.height! > b.y!;
        expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
    for (const edge of sheet.graph.edges!) {
      expect(edge.sections?.length).toBeGreaterThan(0);
      for (const section of edge.sections!) {
        const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
        points.slice(1).forEach((point, i) => expect(point.x === points[i].x || point.y === points[i].y).toBe(true));
      }
    }
  });
});
