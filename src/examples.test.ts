import { describe, expect, it } from 'vitest';
import { CIRCUIT_EXAMPLES } from './examples';
import { DEFINITIONS, parseProject } from './model';
import { checkProject, simulate } from './simulation';
import { branchConducting, buildSchematic, rungActive, terminalState } from './schematic';
import type { Controls, Runtime } from './simulation';

const example = (id: string) => CIRCUIT_EXAMPLES.find((item) => item.id === id)!.create();

describe('runnable example library', () => {
  it.each(CIRCUIT_EXAMPLES.filter((item) => !item.referenceId).map((item) => [item.id, item.create] as const))('%s persists valid wiring and produces a dynamic diagram', (_, create) => {
    const p = create();
    expect(parseProject(JSON.stringify(p))).toEqual(p);
    expect(checkProject(p)).toEqual([]);
    expect(simulate(p, {}, undefined, 0).fault).toBeNull();
    const diagram = buildSchematic(p);
    expect(diagram.rungs.length).toBeGreaterThan(0);
    expect(diagram.rungs.every((rung) => rung.branches.length > 0)).toBe(true);
    expect(diagram.truncated).toBe(false);
  });
  it('keeps every example device clear of neighboring component bodies', () => {
    for (const item of CIRCUIT_EXAMPLES) {
      const p = item.create();
      for (const [i, a] of p.components.entries()) for (const b of p.components.slice(i + 1)) {
        const da = DEFINITIONS[a.kind], db = DEFINITIONS[b.kind];
        const overlap = a.x < b.x + db.width && a.x + da.width > b.x &&
          a.y < b.y + db.height && a.y + da.height > b.y;
        expect(overlap, `${item.id}: ${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it('starts from either station and stops from either stop button', () => {
    const p = example('two-station');
    for (const start of ['start', 'start2']) {
      const started = simulate(p, { breaker: true, [start]: true }, undefined, 0);
      expect(started.motors.motor).toBe('forward');
      const held = simulate(p, { breaker: true }, started, 10);
      expect(held.coils.contactor).toBe(true);
      for (const stop of ['stop', 'stop2']) {
        expect(simulate(p, { breaker: true, [stop]: true }, held, 20).coils.contactor).toBe(false);
      }
    }
  });

  it('provides an unwired practice workspace matching the multi-station reference', () => {
    const item = CIRCUIT_EXAMPLES.find((e) => e.id === 'multi-station-practice')!;
    const practice = item.create(), reference = example(item.referenceId!);
    expect(practice.components).toEqual(reference.components);
    expect(practice.wires).toEqual([]);
    expect(parseProject(JSON.stringify(practice))).toEqual(practice);
    const state = simulate(practice, { breaker: true, start: true, start2: true, start3: true });
    expect(state.coils.contactor).toBe(false);
    expect(state.motors.motor).toBe('stopped');
    expect(state.fault).toBeNull();
  });

  it.each(['start', 'start2', 'start3'])('starts and self-holds from %s and stops from all three locations', (start) => {
    const p = example('multi-station');
    const idle = simulate(p, { breaker: true }, undefined, 0);
    expect(idle.coils.contactor).toBe(false);
    const started = simulate(p, { breaker: true, [start]: true }, idle, 10);
    expect(started.fault).toBeNull();
    expect(started.coilInputs.contactor.issue).toBeNull();
    expect(started.motors.motor).toBe('forward');
    expect(started.lamps.lamp).toBe(true);
    const held = simulate(p, { breaker: true }, started, 20);
    expect(held.coils.contactor).toBe(true);
    const rung = buildSchematic(p).rungs.find((r) => r.id === 'contactor:coil:0')!;
    expect(rung.branches).toHaveLength(4);
    expect(rungActive(rung, held)).toBe(true);
    for (const stop of ['stop', 'stop2', 'stop3']) {
      const stopped = simulate(p, { breaker: true, [stop]: true }, held, 30);
      expect(stopped.coils.contactor).toBe(false);
      expect(stopped.motors.motor).toBe('stopped');
      expect(stopped.lamps.lamp).toBe(false);
      expect(rungActive(rung, stopped)).toBe(false);
      expect(simulate(p, { breaker: true }, stopped, 40).coils.contactor).toBe(false);
      const simultaneous = simulate(p, { breaker: true, start: true, start2: true, start3: true, [stop]: true }, held, 50);
      expect(simultaneous.coils.contactor).toBe(false);
      expect(simultaneous.fault).toBeNull();
    }
    const powerOff = simulate(p, {}, held, 30);
    expect(powerOff.motors.motor).toBe('stopped');
    expect(simulate(p, { breaker: true }, powerOff, 40).coils.contactor).toBe(false);
  });

  it('reverses after releasing the forward coil and never energizes both directions', () => {
    const p = example('reversing');
    const forward = simulate(p, { q: true, forward: true }, undefined, 0);
    expect(forward.fault).toBeNull();
    expect(forward.coils.f).toBe(true);
    expect(forward.coils.r).toBe(false);
    expect(forward.motors.m).toBe('forward');
    const held = simulate(p, { q: true }, forward, 10);
    expect(held.coils.f).toBe(true);
    const reversed = simulate(p, { q: true, reverse: true }, held, 20);
    expect(reversed.fault).toBeNull();
    expect(reversed.coils.f).toBe(false);
    expect(reversed.coils.r).toBe(true);
    expect(reversed.motors.m).toBe('reverse');
    const both = simulate(p, { q: true, forward: true, reverse: true }, reversed, 30);
    expect(both.fault).toBeNull();
    expect(both.coils.f).toBe(false);
    expect(both.coils.r).toBe(false);
    expect(simulate(p, { q: true, stop: true }, reversed, 40).motors.m).toBe('stopped');
  });

  it('drops self-holding on a thermal trip and requires another start after resetting', () => {
    const p = example('thermal');
    const started = simulate(p, { breaker: true, start: true }, undefined, 0);
    expect(started.motors.motor).toBe('forward');
    const tripped = simulate(p, { breaker: true, thermal: true }, started, 10);
    expect(tripped.motors.motor).toBe('stopped');
    expect(tripped.lamps.alarm).toBe(true);
    expect(simulate(p, { breaker: true }, tripped, 20).coils.contactor).toBe(false);
  });

  it('enforces first-motor permission for sequential starting', () => {
    const p = example('sequence');
    expect(simulate(p, { q: true, start2: true }, undefined, 0).coils.k2).toBe(false);
    const first = simulate(p, { q: true, start1: true }, undefined, 10);
    expect(first.motors.m1).toBe('forward');
    const both = simulate(p, { q: true, start2: true }, first, 20);
    expect(both.motors.m2).toBe('forward');
    const held = simulate(p, { q: true }, both, 30);
    expect(held.coils.k1 && held.coils.k2).toBe(true);
    const stopped = simulate(p, { q: true, stop: true }, held, 40);
    expect(stopped.coils.k1 || stopped.coils.k2).toBe(false);
  });

  it('acts in two timed stages and resets both stages when the switch opens', () => {
    const p = example('delayed-sequence');
    const started = simulate(p, { start: true }, undefined, 0);
    expect(started.lamps.l1).toBe(true);
    expect(started.lamps.l2).toBe(false);
    const done = simulate(p, { start: true }, started, 3000);
    expect(done.lamps.l2).toBe(true);
    const off = simulate(p, {}, done, 3100);
    expect(off.coils.k1 || off.coils.k2).toBe(false);
    expect(off.timers.timer.done).toBe(false);
  });

  it('switches the staircase light from either wall control', () => {
    const p = example('staircase');
    for (const [a, b, lit] of [[false, false, true], [true, false, false], [true, true, true], [false, true, false]]) {
      expect(simulate(p, { q: true, 'a.1': a, 'b.1': b }, undefined, 0).lamps.lamp).toBe(lit);
    }
  });

  it('cuts the relay and lights the alarm when emergency is latched', () => {
    const p = example('emergency');
    const started = simulate(p, { start: true }, undefined, 0);
    expect(started.lamps.run).toBe(true);
    const stopped = simulate(p, { start: true, e: true }, started, 10);
    expect(stopped.lamps.run).toBe(false);
    expect(stopped.lamps.alarm).toBe(true);
  });

  it('cuts a filling valve at the float threshold and switches a heater at setpoint', () => {
    const p = example('float-valve');
    expect(simulate(p, {}, undefined, 0).outputs.valve).toBe(true);
    expect(simulate(p, { level: true }, undefined, 0).outputs.valve).toBe(false);
    const q = example('thermostat');
    expect(simulate(q, { q: true }, undefined, 0).outputs.heat).toBe(true);
    q.components.find((c) => c.id === 'tc')!.value = 30;
    expect(simulate(q, { q: true }, undefined, 0).outputs.heat).toBe(false);
  });
});

describe('schematic and simulation consistency', () => {
  it('keeps a held direction indicator lit after releasing its illuminated start button', () => {
    const p = example('reversing');
    const started = simulate(p, { q: true, forward: true }, undefined, 0);
    const held = simulate(p, { q: true }, started, 10);
    expect(held.outputs.forward).toBe(false);
    const rung = buildSchematic(p).rungs.find((rung) => rung.id === 'forward:load:0')!;
    expect(rungActive(rung, held)).toBe(true);
    expect(rungActive(rung, simulate(p, { q: true, stop: true }, held, 20))).toBe(false);
  });
  it('keeps reversing paths free of contradictory contacts and mutually interlocked cross-feeds', () => {
    const diagram = buildSchematic(example('reversing'));
    for (const coil of ['f', 'r']) {
      expect(diagram.rungs.find((rung) => rung.id === `${coil}:coil:0`)!.branches).toHaveLength(2);
    }
    for (const rung of diagram.rungs.filter((rung) => rung.type === 'phase')) {
      expect(rung.branches).toHaveLength(2);
    }
    for (const rung of diagram.rungs) for (const branch of rung.branches) {
      const contacts = [...branch.before, ...branch.after];
      const on = contacts.filter((ref) => ref.contact.when === 'coilOn').map((ref) => ref.component.id);
      const off = contacts.filter((ref) => ref.contact.when === 'coilOff').map((ref) => ref.component.id);
      expect(on.some((id) => off.includes(id))).toBe(false);
      expect(on.includes('f') && on.includes('r')).toBe(false);
    }
  });

  it('draws both start and holding branches and uses actual contact state', () => {
    const p = example('self-hold');
    const diagram = buildSchematic(p);
    const rung = diagram.rungs.find((item) => item.id === 'contactor:coil:0')!;
    expect(rung.branches.length).toBe(2);
    const startBranch = rung.branches.find((b) => b.before.some((ref) => ref.component.id === 'start'))!;
    const holdBranch = rung.branches.find((b) => b.before.some((ref) => ref.component.id === 'contactor'))!;
    const started = simulate(p, { breaker: true, start: true }, undefined, 0);
    const held = simulate(p, { breaker: true }, started, 10);
    expect(branchConducting(startBranch, { breaker: true }, held)).toBe(false);
    expect(branchConducting(holdBranch, { breaker: true }, held)).toBe(true);
    expect(terminalState('start:13', held)).toBe('live');
    expect(terminalState('contactor:A2', held)).toBe('return');
    expect(terminalState('motor:PE', held)).toBe('earth');
  });

  it('retains the NPN output on the return side of the coil', () => {
    const diagram = buildSchematic(example('npn'));
    const rung = diagram.rungs.find((item) => item.id === 'output:coil:0')!;
    expect(rung.branches.some((branch) => branch.after.some((ref) => ref.component.id === 'control'))).toBe(true);
  });

  it('rebuilds from changed wiring rather than retaining the original example diagram', () => {
    const p = example('self-hold');
    p.wires = p.wires.filter((w) => w.to !== 'contactor:A2');
    expect(buildSchematic(p).rungs.find((rung) => rung.id === 'contactor:coil:0')!.branches).toHaveLength(0);
  });
  it('retains real star and delta bridge nets independently of motor runtime', () => {
    const p = example('self-hold');
    const star = buildSchematic(p).terminalNets;
    expect(star['motor:U2']).toBe(star['motor:V2']);
    expect(star['motor:U2']).not.toBe(star['motor:U1']);
    p.wires = p.wires.filter((w) => !w.from.startsWith('motor:'));
    [['U1', 'W2'], ['V1', 'U2'], ['W1', 'V2']].forEach(([a, b], i) => {
      p.wires.push({ id: `delta${i}`, from: `motor:${a}`, to: `motor:${b}`, color: 'auto' });
    });
    const delta = buildSchematic(p).terminalNets;
    expect(delta['motor:U1']).toBe(delta['motor:W2']);
    expect(delta['motor:V1']).toBe(delta['motor:U2']);
    expect(delta['motor:W1']).toBe(delta['motor:V2']);
  });

  it.each(CIRCUIT_EXAMPLES.map((item) => [item.id, item.create] as const))('%s shows a conducting branch for every powered control load', (_, create) => {
    const p = create();
    const diagram = buildSchematic(p);
    const controls: Controls = Object.fromEntries(p.components.filter((c) => ['breaker', 'q', 'start', 'start1', 'forward', 'trigger'].includes(c.id)).map((c) => [c.id, true]));
    const first = simulate(p, controls, undefined, 0);
    const state: Runtime = simulate(p, controls, first, 4000);
    expect(state.fault).toBeNull();
    for (const rung of diagram.rungs.filter((rung) => rung.type !== 'phase')) {
      const active = rungActive(rung, state);
      if (active) expect(rung.branches.some((branch) => branchConducting(branch, controls, state))).toBe(true);
    }
  });
});
