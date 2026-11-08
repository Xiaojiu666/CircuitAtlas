import { describe, expect, it } from 'vitest';
import { DEFINITIONS, exampleProject, initialProject, makeComponent, parseProject, portPosition } from './model';
import type { Project } from './model';
import { checkProject, isContactClosed, simulate } from './simulation';
import { buildSchematic, rungActive } from './schematic';

const addWire = (p: Project, from: string, to: string) =>
  p.wires.push({ id: `test-${p.wires.length}`, from, to, color: 'auto' });

describe('contactor and control circuits', () => {
  it('starts de-energized and stops with the breaker open', () => {
    const state = simulate(exampleProject(), {});
    expect(state.fault).toBeNull();
    expect(state.coils.contactor).toBe(false);
    expect(state.motors.motor).toBe('stopped');
  });
  it('closing the breaker alone does not start the motor', () => {
    const state = simulate(exampleProject(), { breaker: true });
    expect(state.coils.contactor).toBe(false);
    expect(state.motors.motor).toBe('stopped');
  });
  it('pressing start energizes the coil, main poles, NO auxiliary and lamp', () => {
    const state = simulate(exampleProject(), { breaker: true, start: true });
    expect(state.fault).toBeNull();
    expect(state.coils.contactor).toBe(true);
    expect(state.motors.motor).toBe('forward');
    expect(state.lamps.lamp).toBe(true);
    expect(state.nets['contactor:13']).toBe(state.nets['contactor:14']);
    expect(state.nets['contactor:21']).not.toBe(state.nets['contactor:22']);
  });
  it('maintains a self-holding circuit after the start button is released', () => {
    const p = exampleProject();
    const started = simulate(p, { breaker: true, start: true });
    const released = simulate(p, { breaker: true }, started);
    expect(released.coils.contactor).toBe(true);
    expect(released.motors.motor).toBe('forward');
  });
  it('stop releases a held coil and opens the main poles', () => {
    const p = exampleProject();
    const started = simulate(p, { breaker: true, start: true });
    const stopped = simulate(p, { breaker: true, stop: true }, started);
    expect(stopped.coils.contactor).toBe(false);
    expect(stopped.lamps.lamp).toBe(false);
    expect(stopped.motors.motor).toBe('stopped');
    const released = simulate(p, { breaker: true }, stopped);
    expect(released.coils.contactor).toBe(false);
  });
  it('breaker opening drops the held circuit and restoring power does not auto restart', () => {
    const p = exampleProject();
    const started = simulate(p, { breaker: true, start: true });
    const opened = simulate(p, {}, started);
    expect(opened.coils.contactor).toBe(false);
    expect(simulate(p, { breaker: true }, opened).coils.contactor).toBe(false);
  });
  it('jog circuit runs only while the start button is pressed', () => {
    const p = exampleProject(false);
    const started = simulate(p, { breaker: true, start: true });
    expect(started.motors.motor).toBe('forward');
    const released = simulate(p, { breaker: true }, started);
    expect(released.coils.contactor).toBe(false);
    expect(released.motors.motor).toBe('stopped');
  });
  it('stop has priority when start and stop are both pressed', () => {
    const state = simulate(exampleProject(), { breaker: true, start: true, stop: true });
    expect(state.coils.contactor).toBe(false);
  });
  it('refuses a phase-to-neutral short', () => {
    const p = exampleProject();
    addWire(p, 'source:L1', 'source:N');
    expect(simulate(p, {}).fault).toContain('短接');
  });
  it('refuses phase-to-phase and phase-to-earth shorts', () => {
    for (const to of ['source:L2', 'source:PE']) {
      const p = exampleProject();
      addWire(p, 'source:L1', to);
      expect(simulate(p, {}).fault).toContain('短接');
    }
  });
  it('detects a short downstream only when the breaker closes', () => {
    const p = exampleProject();
    addWire(p, 'breaker:2', 'breaker:4');
    expect(simulate(p, {}).fault).toBeNull();
    expect(simulate(p, { breaker: true }).fault).not.toBeNull();
    expect(checkProject(p).join()).toContain('短接');
  });
  it('does not use protective earth as a coil return', () => {
    const p = exampleProject();
    p.wires = p.wires.filter((w) => w.to !== 'contactor:A2');
    addWire(p, 'source:PE', 'contactor:A2');
    expect(simulate(p, { breaker: true, start: true }).coils.contactor).toBe(false);
  });
  it('does not energize a 220 V coil with a 380 V phase-to-phase supply', () => {
    const p = exampleProject();
    p.wires = p.wires.filter((w) => w.to !== 'contactor:A2');
    addWire(p, 'source:L2', 'contactor:A2');
    const state = simulate(p, { breaker: true, start: true });
    expect(state.coils.contactor).toBe(false);
    expect(state.warnings.join()).toContain('过压');
  });
  it('supports a single-phase supply for an AC coil', () => {
    const p: Project = { version: 1, name: 'test', components: [
      makeComponent('source1', 's', 'X1', 0, 0), makeComponent('contactor', 'c', 'KM1', 200, 0),
    ], wires: [] };
    addWire(p, 's:L', 'c:A1'); addWire(p, 's:N', 'c:A2');
    expect(simulate(p, {}).coils.c).toBe(true);
  });
  it('does not accept DC as an AC coil supply even with matching voltage', () => {
    const p: Project = { version: 1, name: 'test', components: [
      { ...makeComponent('dc', 's', 'X1', 0, 0), voltage: 220 }, makeComponent('contactor', 'c', 'KM1', 200, 0),
    ], wires: [] };
    addWire(p, 's:+', 'c:A1'); addWire(p, 's:-', 'c:A2');
    const state = simulate(p, {});
    expect(state.coils.c).toBe(false);
    expect(state.warnings.join()).toContain('直流');
  });
  it('detects non-convergent NC coil feedback', () => {
    const p: Project = { version: 1, name: 'oscillator', components: [
      makeComponent('source1', 's', 'X1', 0, 0), makeComponent('contactor', 'c', 'KM1', 200, 0),
    ], wires: [] };
    addWire(p, 's:L', 'c:21'); addWire(p, 'c:22', 'c:A1'); addWire(p, 's:N', 'c:A2');
    expect(simulate(p, {}).fault).toContain('无法稳定');
  });
});

describe('coil supply diagnostics', () => {
  const pushbuttonCircuit = (voltage = 380, returnPort = 'N') => {
    const p: Project = { version: 1, name: 'button-controlled coil', components: [
      makeComponent('source3', 'source', 'X1', 0, 0),
      makeComponent('breaker2', 'q', 'QF3', 200, 0),
      makeComponent('buttonNC', 'stop', 'SB2', 400, 0),
      makeComponent('buttonNO', 'start', 'SB1', 600, 0),
      { ...makeComponent('contactor380', 'km', 'KM1', 800, 0), voltage },
    ], wires: [] };
    for (const [from, to] of [
      ['source:L3', 'q:1'], [`source:${returnPort}`, 'q:3'],
      ['q:2', 'stop:21'], ['stop:22', 'start:13'], ['start:14', 'km:A1'], ['q:4', 'km:A2'],
    ]) addWire(p, from, to);
    return p;
  };

  it('explains why a 380 V coil stays released on a phase-to-neutral button circuit', () => {
    const p = pushbuttonCircuit();
    const idle = simulate(p, { q: true });
    expect(idle.coilInputs.km.issue).toBe('open');
    expect(idle.warnings).toEqual([]);
    const pressed = simulate(p, { q: true, start: true }, idle);
    expect(pressed.outputs.start).toBe(true);
    expect(pressed.coils.km).toBe(false);
    expect(pressed.coilInputs.km.voltage).toBeCloseTo(380 / Math.sqrt(3));
    expect(pressed.coilInputs.km.issue).toBe('undervoltage');
    expect(pressed.warnings.join()).toContain('欠压');
    expect(pressed.warnings.join()).toContain('219 V / 额定 380 V');
    const released = simulate(p, { q: true }, pressed);
    expect(released.coilInputs.km.issue).toBe('open');
    expect(released.warnings).toEqual([]);
  });

  it.each([[220, 'N'], [380, 'L2']] as const)(
    'energizes a %i V coil with a compatible %s return only while start is held', (voltage, returnPort) => {
      const p = pushbuttonCircuit(voltage, returnPort);
      const started = simulate(p, { q: true, start: true });
      expect(started.coils.km).toBe(true);
      expect(started.coilInputs.km.issue).toBeNull();
      expect(started.warnings).toEqual([]);
      const released = simulate(p, { q: true }, started);
      expect(released.coils.km).toBe(false);
      expect(released.coilInputs.km.issue).toBe('open');
      expect(simulate(p, { q: true, start: true, stop: true }, started).coils.km).toBe(false);
    });

  it('reports a live terminal with a missing return as open, not undervoltage', () => {
    const p = pushbuttonCircuit();
    p.wires = p.wires.filter((w) => w.to !== 'km:A2');
    const state = simulate(p, { q: true, start: true });
    expect(state.potentials['km:A1'].phase).toBe('L3');
    expect(state.coilInputs.km).toMatchObject({ voltage: 0, issue: 'open' });
    expect(state.warnings).toEqual([]);
  });

  it('distinguishes same-potential wiring from a valid powered coil', () => {
    const p = pushbuttonCircuit(380, 'L3');
    const state = simulate(p, { q: true, start: true });
    expect(state.coils.km).toBe(false);
    expect(state.coilInputs.km).toMatchObject({ voltage: 0, issue: 'samePotential' });
    expect(state.warnings.join()).toContain('同电位');
  });

  it('reports overvoltage without bypassing the rated coil voltage', () => {
    const p = pushbuttonCircuit(220, 'L2');
    const state = simulate(p, { q: true, start: true });
    expect(state.coils.km).toBe(false);
    expect(state.coilInputs.km).toMatchObject({ voltage: 380, issue: 'overvoltage' });
  });

  it('keeps manual engagement distinct from electrical undervoltage', () => {
    const p = pushbuttonCircuit();
    const pressed = simulate(p, { q: true, start: true, km: true });
    expect(pressed.engaged.km).toBe(true);
    expect(pressed.coils.km).toBe(false);
    expect(pressed.coilInputs.km.issue).toBe('undervoltage');
  });
});

describe('manual contactor pressure', () => {
  it.each((Object.keys(DEFINITIONS) as (keyof typeof DEFINITIONS)[]).filter((kind) => DEFINITIONS[kind].family === 'contactor'))(
    'engages %s without claiming that its coil is powered', (kind) => {
      const c = makeComponent(kind, 'km', 'KM1', 0, 0);
      const p: Project = { version: 1, name: 'manual', components: [c], wires: [] };
      const pressed = simulate(p, { km: true });
      expect(pressed.fault).toBeNull();
      expect(pressed.coils.km).toBe(false);
      expect(pressed.engaged.km).toBe(true);
      expect(pressed.outputs.km).toBe(true);
      for (const contact of DEFINITIONS[kind].contacts!) {
        expect(isContactClosed(c, contact, { km: true }, pressed)).toBe(contact.when === 'coilOn');
        expect(pressed.nets[`km:${contact.a}`] === pressed.nets[`km:${contact.b}`]).toBe(contact.when === 'coilOn');
      }
      const released = simulate(p, {}, pressed);
      expect(released.engaged.km).toBe(false);
      expect(released.outputs.km).toBe(false);
    });

  it('runs main power with an open coil return, then releases when pressure ends', () => {
    const p = exampleProject();
    p.wires = p.wires.filter((w) => w.to !== 'contactor:A2');
    const pressed = simulate(p, { breaker: true, contactor: true });
    expect(pressed.coils.contactor).toBe(false);
    expect(pressed.motors.motor).toBe('forward');
    const diagram = buildSchematic(p);
    expect(rungActive(diagram.rungs.find((r) => r.type === 'coil')!, pressed)).toBe(false);
    const released = simulate(p, { breaker: true }, pressed);
    expect(released.motors.motor).toBe('stopped');
    expect(released.engaged.contactor).toBe(false);
  });

  it('lets a wired holding contact power the coil and maintain it after release', () => {
    const p = exampleProject();
    const pressed = simulate(p, { breaker: true, contactor: true });
    expect(pressed.coils.contactor).toBe(true);
    const released = simulate(p, { breaker: true }, pressed);
    expect(released.engaged.contactor).toBe(true);
    expect(released.motors.motor).toBe('forward');
    const stopped = simulate(p, { breaker: true, stop: true }, released);
    expect(stopped.engaged.contactor).toBe(false);
    expect(stopped.motors.motor).toBe('stopped');
  });

  it('does not latch a jog circuit or invent motor power with its breaker open', () => {
    const p = exampleProject(false);
    const pressed = simulate(p, { breaker: true, contactor: true });
    expect(pressed.coils.contactor).toBe(false);
    expect(pressed.motors.motor).toBe('forward');
    expect(simulate(p, { breaker: true }, pressed).motors.motor).toBe('stopped');
    const unpowered = simulate(p, { contactor: true });
    expect(unpowered.engaged.contactor).toBe(true);
    expect(unpowered.motors.motor).toBe('stopped');
  });

  it('keeps mechanical pressure independent of a stop button opening the coil circuit', () => {
    const p = exampleProject();
    const pressed = simulate(p, { breaker: true, stop: true, contactor: true });
    expect(pressed.coils.contactor).toBe(false);
    expect(pressed.engaged.contactor).toBe(true);
    expect(pressed.motors.motor).toBe('forward');
    expect(simulate(p, { breaker: true, stop: true }, pressed).motors.motor).toBe('stopped');
  });

  it('moves linked auxiliary contacts with the armature while their coil remains off', () => {
    const p = exampleProject(false);
    const auxiliary = { ...makeComponent('auxiliary', 'aux', 'KA1', 0, 0), linkedTo: 'contactor' };
    p.components.push(auxiliary);
    const pressed = simulate(p, { contactor: true });
    expect(pressed.coils.contactor).toBe(false);
    expect(pressed.outputs.aux).toBe(true);
    for (const contact of DEFINITIONS.auxiliary.contacts!) {
      expect(isContactClosed(auxiliary, contact, { contactor: true }, pressed)).toBe(contact.when === 'coilOn');
    }
    const released = simulate(p, {}, pressed);
    expect(released.outputs.aux).toBe(false);
  });

  it('still detects shorts introduced by manually closing the main contacts', () => {
    const p = exampleProject(false);
    addWire(p, 'contactor:2', 'breaker:4');
    expect(simulate(p, { breaker: true }).fault).toBeNull();
    const pressed = simulate(p, { breaker: true, contactor: true });
    expect(pressed.fault).toContain('短接');
    expect(pressed.engaged).toEqual({});
    expect(pressed.outputs).toEqual({});
  });
});

describe('motor winding connections', () => {
  it('swapping two phases reverses rotation', () => {
    const p = exampleProject();
    p.wires = p.wires.map((w) => ({ ...w, to: w.to === 'motor:U1' ? 'motor:V1' : w.to === 'motor:V1' ? 'motor:U1' : w.to }));
    expect(simulate(p, { breaker: true, start: true }).motors.motor).toBe('reverse');
  });
  it('does not run with unconnected winding ends', () => {
    const p = exampleProject();
    p.wires = p.wires.filter((w) => !w.from.startsWith('motor:'));
    const state = simulate(p, { breaker: true, start: true });
    expect(state.motors.motor).toBe('stopped');
    expect(state.warnings.join()).toContain('绕组');
  });
  it('supports delta winding bridges', () => {
    const p = exampleProject();
    p.wires = p.wires.filter((w) => !w.from.startsWith('motor:'));
    addWire(p, 'motor:U1', 'motor:W2');
    addWire(p, 'motor:V1', 'motor:U2');
    addWire(p, 'motor:W1', 'motor:V2');
    expect(simulate(p, { breaker: true, start: true }).motors.motor).toBe('forward');
  });
  it('does not rotate if one incoming phase is missing', () => {
    const p = exampleProject();
    p.wires = p.wires.filter((w) => w.to !== 'motor:W1');
    expect(simulate(p, { breaker: true, start: true }).motors.motor).toBe('stopped');
  });
  it('warns about absent protective earth', () => {
    const p = exampleProject();
    p.wires = p.wires.filter((w) => w.to !== 'motor:PE');
    expect(simulate(p, { breaker: true }).warnings.join()).toContain('保护接地');
  });
  it('does not rotate a 380 V motor on an incompatible supply', () => {
    const p = exampleProject();
    p.components.find((c) => c.id === 'source')!.voltage = 220;
    p.components.find((c) => c.id === 'contactor')!.voltage = 127;
    p.components.find((c) => c.id === 'lamp')!.voltage = 127;
    const state = simulate(p, { breaker: true, start: true });
    expect(state.coils.contactor).toBe(true);
    expect(state.motors.motor).toBe('stopped');
    expect(state.warnings.join()).toContain('电源电压');
  });
});

describe('engineering files and editor geometry', () => {
  it('round-trips examples without changing connections', () => {
    const p = exampleProject();
    expect(parseProject(JSON.stringify(p))).toEqual(p);
  });
  it('rejects malformed JSON and unknown component types', () => {
    expect(() => parseProject('{')).toThrow();
    const p = initialProject();
    (p.components[0] as { kind: string }).kind = 'constructor';
    expect(() => parseProject(JSON.stringify(p))).toThrow();
  });
  it('rejects dangling wires, duplicate components and invalid coordinates', () => {
    const p = exampleProject();
    p.wires[0].to = 'missing:A1';
    expect(() => parseProject(JSON.stringify(p))).toThrow();
    const q = initialProject();
    q.components.push(q.components[0]);
    expect(() => parseProject(JSON.stringify(q))).toThrow();
    const r = initialProject();
    r.components[0].x = -1;
    expect(() => parseProject(JSON.stringify(r))).toThrow();
  });
  it('rejects duplicate wires and invalid colors', () => {
    const p = exampleProject();
    p.wires.push({ ...p.wires[0], id: 'duplicate' });
    expect(() => parseProject(JSON.stringify(p))).toThrow();
    const q = exampleProject();
    (q.wires[0] as { color: string }).color = 'transparent';
    expect(() => parseProject(JSON.stringify(q))).toThrow();
  });
  it('rotates terminal positions around the component center', () => {
    const c = makeComponent('breaker', 'c', 'QF1', 100, 200);
    const original = portPosition(c, '1');
    const rotated = portPosition({ ...c, rotation: 180 }, '1');
    expect(original.x + rotated.x).toBeCloseTo(344);
    expect(original.y + rotated.y).toBeCloseTo(632);
  });
  it('reports unconnected initial devices and accepts the fully wired sample', () => {
    expect(checkProject(initialProject()).length).toBeGreaterThan(0);
    expect(checkProject(exampleProject())).toEqual([]);
  });
});
