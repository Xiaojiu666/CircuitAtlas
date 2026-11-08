import { describe, expect, it } from 'vitest';
import { DEFINITIONS, LIBRARY_GROUPS, controlExample, makeComponent, parseProject } from './model';
import type { Component, Kind, Project } from './model';
import { checkProject, simulate } from './simulation';

const component = (kind: Kind, id = 'c') => makeComponent(kind, id, id, 0, 0);
const project = (...components: Component[]): Project => ({ version: 1, name: 'catalog test', components, wires: [] });
const wire = (p: Project, from: string, to: string) => {
  p.wires.push({ id: `w${p.wires.length}`, from, to, color: 'auto' });
};
const connected = (state: ReturnType<typeof simulate>, a: string, b: string) => state.nets[a] === state.nets[b];
const kinds = Object.keys(DEFINITIONS) as Kind[];

describe('component catalog integrity', () => {
  it('covers all four groups with explicit capabilities for complex models', () => {
    expect(kinds.length).toBeGreaterThan(100);
    expect(new Set(Object.values(DEFINITIONS).map((def) => def.group))).toEqual(new Set(LIBRARY_GROUPS));
    for (const def of Object.values(DEFINITIONS)) {
      expect(def.family).toBeTruthy();
      if (def.capability === 'wiring') expect(def.limitation).toBeTruthy();
    }
  });

  it.each(kinds)('%s has valid geometry, terminal references and persistent parameters', (kind) => {
    const def = DEFINITIONS[kind];
    const ids = new Set(def.ports.map((port) => port.id));
    expect(ids.size).toBe(def.ports.length);
    for (const port of def.ports) {
      expect(port.id).not.toContain(':');
      expect(port.x).toBeGreaterThanOrEqual(0);
      expect(port.x).toBeLessThanOrEqual(def.width);
      expect(port.y).toBeGreaterThanOrEqual(0);
      expect(port.y).toBeLessThanOrEqual(def.height);
    }
    for (const pair of [...(def.contacts ?? []), ...(def.loads ?? []), ...(def.coil ? [def.coil] : [])]) {
      expect(ids.has(pair.a)).toBe(true);
      expect(ids.has(pair.b)).toBe(true);
      expect(pair.a).not.toBe(pair.b);
    }
    const p = project(component(kind));
    expect(parseProject(JSON.stringify(p))).toEqual(p);
    expect(simulate(p, {}, undefined, 0).fault).toBeNull();
  });

  it('preserves valid links and rejects invalid optional parameters', () => {
    const p = project({ ...component('timerDC'), delay: 1.5, linkedTo: 'other' });
    expect(parseProject(JSON.stringify(p))).toEqual(p);
    for (const patch of [{ delay: 0 }, { delay: 3601 }, { value: '10' }, { setpoint: 1001 }, { linkedTo: '<bad>' }]) {
      expect(() => parseProject(JSON.stringify({ ...p, components: [{ ...p.components[0], ...patch }] }))).toThrow();
    }
  });
});

describe('contactor model variants', () => {
  const contactors = kinds.filter((kind) => DEFINITIONS[kind].family === 'contactor');

  it('keeps existing defaults and exposes separate AC/DC and auxiliary-contact models', () => {
    expect(DEFINITIONS.contactor.voltage).toBe(220);
    expect(DEFINITIONS.contactor380.voltage).toBe(380);
    expect(DEFINITIONS.contactorDC.voltage).toBe(24);
    expect(contactors).toHaveLength(14);
    for (const [kind, voltage, supply, auxiliary] of [
      ['contactor24AC', 24, 'ac', 2], ['contactor36AC', 36, 'ac', 2],
      ['contactor110AC', 110, 'ac', 2], ['contactor220NO', 220, 'ac', 1],
      ['contactor380NO', 380, 'ac', 1], ['contactor220NC', 220, 'ac', 1],
      ['contactor380NC', 380, 'ac', 1], ['contactor48DC', 48, 'dc', 2],
      ['contactor110DC', 110, 'dc', 2], ['contactor220DC', 220, 'dc', 2],
    ] as const) {
      expect(DEFINITIONS[kind].voltage).toBe(voltage);
      expect(DEFINITIONS[kind].coil?.supply).toBe(supply);
      expect(DEFINITIONS[kind].contacts).toHaveLength(3 + auxiliary);
      expect(DEFINITIONS[kind].ports).toHaveLength(8 + auxiliary * 2);
    }
    for (const kind of ['contactor220NO', 'contactor380NO'] as const) {
      expect(DEFINITIONS[kind].ports.some((p) => ['21', '22'].includes(p.id))).toBe(false);
      expect(DEFINITIONS[kind].contacts?.some((c) => c.a === '13' && c.b === '14')).toBe(true);
    }
    for (const kind of ['contactor220NC', 'contactor380NC'] as const) {
      expect(DEFINITIONS[kind].ports.some((p) => ['13', '14'].includes(p.id))).toBe(false);
      expect(DEFINITIONS[kind].contacts?.some((c) => c.a === '21' && c.b === '22')).toBe(true);
    }
  });

  it.each(contactors)('%s uses its own coil rating and operates only its defined contacts', (kind) => {
    const c = component(kind, 'km'), def = DEFINITIONS[kind], dc = def.coil!.supply === 'dc';
    const s = { ...component(dc ? 'dc' : 'source1', 's'), voltage: c.voltage };
    const p = project(s, c);
    wire(p, `s:${dc ? '+' : 'L'}`, 'km:A1');
    wire(p, `s:${dc ? '-' : 'N'}`, 'km:A2');
    const powered = simulate(p, {});
    expect(powered.fault).toBeNull();
    expect(powered.coils.km).toBe(true);
    expect(powered.coilInputs.km.issue).toBeNull();
    for (const contact of def.contacts!) {
      expect(connected(powered, `km:${contact.a}`, `km:${contact.b}`)).toBe(contact.when === 'coilOn');
    }
    const released = simulate({ ...p, wires: [] }, {}, powered);
    expect(released.coils.km).toBe(false);
    for (const contact of def.contacts!) {
      expect(connected(released, `km:${contact.a}`, `km:${contact.b}`)).toBe(contact.when === 'coilOff');
    }
    for (const [ratio, issue] of [[0.5, 'undervoltage'], [1.5, 'overvoltage']] as const) {
      const mismatched = { ...p, components: [{ ...s, voltage: s.voltage * ratio }, c] };
      const state = simulate(mismatched, {});
      expect(state.coils.km).toBe(false);
      expect(state.coilInputs.km.issue).toBe(issue);
    }
    const wrongType = component(dc ? 'source1' : 'dc', 's');
    wrongType.voltage = c.voltage;
    const incompatible = project(wrongType, c);
    wire(incompatible, `s:${dc ? 'L' : '+'}`, 'km:A1');
    wire(incompatible, `s:${dc ? 'N' : '-'}`, 'km:A2');
    expect(simulate(incompatible, {}).coilInputs.km.issue).toBe('invalidSupply');
    expect(c.voltage).toBe(def.voltage);
  });
});

describe('switching and protection models', () => {
  it('operates wall switch channels independently and changes between two travelers', () => {
    const p = project(component('wallDouble'));
    const state = simulate(p, { 'c.1': true }, undefined, 0);
    expect(connected(state, 'c:L1', 'c:1B')).toBe(true);
    expect(connected(state, 'c:L1', 'c:1A')).toBe(false);
    expect(connected(state, 'c:L2', 'c:2A')).toBe(true);
    expect(connected(state, 'c:L2', 'c:2B')).toBe(false);
    expect(connected(state, 'c:L1', 'c:L2')).toBe(false);
  });

  it('crosses only the selected intermediate switch channel', () => {
    const state = simulate(project(component('wallIntermediate')), { 'c.2': true }, undefined, 0);
    expect(connected(state, 'c:2A', 'c:2D')).toBe(true);
    expect(connected(state, 'c:2B', 'c:2C')).toBe(true);
    expect(connected(state, 'c:2A', 'c:2C')).toBe(false);
    expect(connected(state, 'c:1A', 'c:1C')).toBe(true);
  });

  it('switches all four breaker poles without bridging phases', () => {
    const p = project(component('breaker4'));
    const open = simulate(p, {}, undefined, 0);
    const closed = simulate(p, { c: true }, undefined, 0);
    for (let i = 1; i <= 7; i += 2) {
      expect(connected(open, `c:${i}`, `c:${i + 1}`)).toBe(false);
      expect(connected(closed, `c:${i}`, `c:${i + 1}`)).toBe(true);
    }
    expect(connected(closed, 'c:1', 'c:3')).toBe(false);
  });

  it('injects a fuse failure and trips thermal auxiliaries without opening the main path', () => {
    const p = project(component('fuse3', 'f'), component('thermalRelay', 't'));
    const normal = simulate(p, {}, undefined, 0);
    const tripped = simulate(p, { f: true, t: true }, undefined, 0);
    expect(connected(normal, 'f:1A', 'f:1B')).toBe(true);
    expect(connected(tripped, 'f:1A', 'f:1B')).toBe(false);
    expect(connected(tripped, 't:1', 't:2')).toBe(true);
    expect(connected(normal, 't:95', 't:96')).toBe(true);
    expect(connected(tripped, 't:95', 't:96')).toBe(false);
    expect(connected(tripped, 't:97', 't:98')).toBe(true);
  });

  it('keeps terminal strip channels isolated and a socket earth path unswitched', () => {
    const p = project(component('terminalVertical', 't'), component('socketSwitch', 's'));
    const state = simulate(p, {}, undefined, 0);
    expect(connected(state, 't:1A', 't:1B')).toBe(true);
    expect(connected(state, 't:1A', 't:2A')).toBe(false);
    expect(connected(state, 's:L', 's:Lout')).toBe(false);
    expect(connected(state, 's:PE', 's:PEout')).toBe(true);
    expect(connected(simulate(p, { s: true }), 's:L', 's:Lout')).toBe(true);
  });

  it('selects one throw only and leaves both throws open at zero', () => {
    const p = project(component('selector'));
    expect(connected(simulate(p, {}), 'c:C', 'c:1')).toBe(false);
    const state = simulate(p, { c: 2 });
    expect(connected(state, 'c:C', 'c:1')).toBe(false);
    expect(connected(state, 'c:C', 'c:2')).toBe(true);
  });
});

describe('relay, timer and linked contact models', () => {
  it('runs and round-trips both new control examples', () => {
    for (const mode of ['timer', 'sensor'] as const) {
      const p = controlExample(mode);
      expect(parseProject(JSON.stringify(p))).toEqual(p);
      expect(checkProject(p)).toEqual([]);
      const started = simulate(p, { trigger: true }, undefined, 0);
      if (mode === 'timer') {
        expect(started.lamps.output).toBe(false);
        expect(simulate(p, { trigger: true }, started, 3000).lamps.output).toBe(true);
      } else {
        expect(started.coils.output).toBe(true);
        expect(started.lamps.lamp).toBe(true);
      }
    }
  });
  it.each(['relay8AC', 'relay14AC', 'relay8DC', 'relay14DC'] as const)('energizes %s and transfers every pole', (kind) => {
    const def = DEFINITIONS[kind];
    const dc = def.coil!.supply === 'dc';
    const p = project(component(dc ? 'dc' : 'source1', 's'), component(kind));
    wire(p, dc ? 's:+' : 's:L', `c:${def.coil!.a}`);
    wire(p, dc ? 's:-' : 's:N', `c:${def.coil!.b}`);
    const state = simulate(p, {}, undefined, 0);
    expect(state.fault).toBeNull();
    expect(state.coils.c).toBe(true);
    for (const contact of def.contacts!) {
      expect(connected(state, `c:${contact.a}`, `c:${contact.b}`)).toBe(contact.when === 'coilOn');
    }
  });

  it('rejects reversed DC power and AC power at a DC relay', () => {
    const p = project(component('dc', 's'), component('relay8DC'));
    wire(p, 's:-', 'c:2'); wire(p, 's:+', 'c:7');
    const reversed = simulate(p, {}, undefined, 0);
    expect(reversed.coils.c).toBe(false);
    expect(reversed.warnings.length).toBeGreaterThan(0);
    p.components[0] = { ...component('source1', 's'), voltage: 24 };
    p.wires = [];
    wire(p, 's:L', 'c:2'); wire(p, 's:N', 'c:7');
    expect(simulate(p, {}).coils.c).toBe(false);
  });

  it('delays NO transfer, resets on power loss and starts a fresh interval', () => {
    const p = project(component('dc', 's'), { ...component('timerDC'), delay: 2 }, component('lampGreenDC', 'l'));
    wire(p, 's:+', 'c:A1'); wire(p, 's:-', 'c:A2');
    wire(p, 's:+', 'c:15'); wire(p, 'c:18', 'l:X1'); wire(p, 's:-', 'l:X2');
    const started = simulate(p, {}, undefined, 100);
    expect(started.coils.c).toBe(true);
    expect(started.timers.c.since).toBe(100);
    expect(connected(started, 'c:15', 'c:16')).toBe(true);
    expect(started.lamps.l).toBe(false);
    const waiting = simulate(p, {}, started, 2099);
    expect(waiting.lamps.l).toBe(false);
    const done = simulate(p, {}, waiting, 2100);
    expect(done.lamps.l).toBe(true);
    expect(connected(done, 'c:15', 'c:16')).toBe(false);
    const off = simulate({ ...p, wires: p.wires.filter((w) => w.to !== 'c:A1') }, {}, done, 2200);
    expect(off.timers.c).toEqual({ since: null, elapsed: 0, done: false });
    expect(off.lamps.l).toBe(false);
    const restarted = simulate(p, {}, off, 2300);
    expect(restarted.timers.c.since).toBe(2300);
    expect(restarted.timers.c.done).toBe(false);
  });

  it('makes a separately placed auxiliary follow its chosen coil', () => {
    const p = project(component('source1', 's'), component('contactor', 'r'), { ...component('auxiliary'), linkedTo: 'r' });
    wire(p, 's:L', 'r:A1'); wire(p, 's:N', 'r:A2');
    const state = simulate(p, {}, undefined, 0);
    expect(state.outputs.c).toBe(true);
    expect(connected(state, 'c:13', 'c:14')).toBe(true);
    expect(connected(state, 'c:21', 'c:22')).toBe(false);
    expect(checkProject(project(component('auxiliary'))).length).toBeGreaterThan(0);
  });
});

describe('sensor and load models', () => {
  it.each(['photoPNP', 'photoNPN'] as const)('%s drives the matching sourcing or sinking circuit only when powered', (kind) => {
    const p = project(component('dcSupplyA', 's'), component(kind), component('relay8DC', 'r'));
    wire(p, 's:+2', 'c:V+'); wire(p, 's:-2', 'c:0V');
    if (kind === 'photoPNP') { wire(p, 'c:OUT', 'r:2'); wire(p, 's:-', 'r:7'); }
    else { wire(p, 's:+', 'r:2'); wire(p, 'c:OUT', 'r:7'); }
    expect(simulate(p, {}, undefined, 0).coils.r).toBe(false);
    expect(simulate(p, { c: true }, undefined, 0).coils.r).toBe(true);
    const unpowered = { ...p, wires: p.wires.filter((w) => w.to !== 'c:V+') };
    expect(simulate(unpowered, { c: true }, undefined, 0).coils.r).toBe(false);
  });

  it('links a sensor to target presence instead of its manual trigger', () => {
    const p = project(component('dc', 's'), { ...component('photoPNP'), linkedTo: 'target' }, component('target', 'target'));
    wire(p, 's:+', 'c:V+'); wire(p, 's:-', 'c:0V');
    expect(simulate(p, { c: true }, undefined, 0).outputs.c).toBe(false);
    const present = simulate(p, { target: true }, undefined, 0);
    expect(present.outputs.c).toBe(true);
    expect(connected(present, 'c:V+', 'c:OUT')).toBe(true);
  });

  it('opens both curtain outputs on obstruction and on loss of supply', () => {
    const p = project(component('dc', 's'), component('lightCurtain'));
    wire(p, 's:+', 'c:V+'); wire(p, 's:-', 'c:0V');
    for (const pin of ['OSSD1', 'OSSD2']) {
      expect(connected(simulate(p, {}, undefined, 0), 'c:V+', `c:${pin}`)).toBe(true);
      expect(connected(simulate(p, { c: true }, undefined, 0), 'c:V+', `c:${pin}`)).toBe(false);
      expect(connected(simulate({ ...p, wires: [] }, {}, undefined, 0), 'c:V+', `c:${pin}`)).toBe(false);
    }
  });

  it('lights tower channels independently', () => {
    const p = project(component('dc', 's'), component('towerDC'));
    wire(p, 's:-', 'c:COM'); wire(p, 's:+', 'c:Y');
    const state = simulate(p, {}, undefined, 0);
    expect(state.lampChannels.c).toEqual({ red: false, yellow: true, green: false });
    expect(state.lamps.c).toBe(true);
  });

  it('powers the button lamp independently of its mechanical contacts', () => {
    const p = project(component('source1', 's'), component('illuminatedLatchGreen'));
    wire(p, 's:L', 'c:X1'); wire(p, 's:N', 'c:X2');
    const state = simulate(p, {}, undefined, 0);
    expect(state.lamps.c).toBe(true);
    expect(connected(state, 'c:13', 'c:14')).toBe(false);
  });

  it('switches heating at the temperature threshold and requires control power', () => {
    const p = project(component('source1', 's'), component('thermostat'));
    wire(p, 's:L', 'c:L'); wire(p, 's:N', 'c:N');
    expect(connected(simulate(p, {}, undefined, 0), 'c:COM', 'c:NO')).toBe(true);
    p.components[1].value = 30;
    expect(connected(simulate(p, {}, undefined, 0), 'c:COM', 'c:NO')).toBe(false);
    p.components[1].value = 10;
    expect(connected(simulate({ ...p, wires: [] }, {}, undefined, 0), 'c:COM', 'c:NO')).toBe(false);
  });

  it('measures ideal voltage and does not invent analog or drive outputs', () => {
    const p = project(component('source3', 's'), component('voltmeter'));
    wire(p, 's:L1', 'c:V+'); wire(p, 's:L2', 'c:V-');
    expect(simulate(p, {}, undefined, 0).readings.c).toBe(380);
    for (const kind of kinds.filter((kind) => DEFINITIONS[kind].capability === 'wiring')) {
      const state = simulate(project(component(kind)), { c: true }, undefined, 0);
      expect(state.outputs.c).toBe(false);
      if (DEFINITIONS[kind].family === 'meter') expect(state.readings.c).toBeNull();
    }
  });
});
