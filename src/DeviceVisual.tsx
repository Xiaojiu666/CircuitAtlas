import {
  Activity, Bell, Box, Cable, CircuitBoard, Cpu, Eye, Fan, Gauge, Lightbulb,
  Power, Radio, RotateCcw, ShieldCheck, SlidersHorizontal, Thermometer,
  Timer, ToggleLeft, Unplug, Waves, Zap, ZapOff,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { DEFINITIONS } from './model';
import type { Component, Family, Kind } from './model';
import type { Controls, Runtime } from './simulation';

const ICONS: Record<Family, LucideIcon> = {
  source: Zap, breaker: Unplug, contactor: CircuitBoard, pushbutton: Power,
  switch: ToggleLeft, selector: SlidersHorizontal, relay: CircuitBoard, timer: Timer,
  sensor: Radio, terminal: Cable, socket: Unplug, lamp: Lightbulb, tower: Lightbulb,
  buzzer: Bell, motor: Fan, heater: Waves, valve: Waves, meter: Gauge,
  transformer: Activity, drive: Activity, thermal: Thermometer, fuse: ShieldCheck,
  potentiometer: SlidersHorizontal, thermostat: Thermometer, auxiliary: CircuitBoard,
  target: Box, controller: Cpu, cylinder: SlidersHorizontal,
};
export function FamilyIcon({ family, size = 21 }: { family?: Family; size?: number }) {
  const Icon = ICONS[family ?? 'relay'];
  return <Icon size={size} strokeWidth={1.5} />;
}
export function DeviceMiniature({ kind }: { kind: Kind }) {
  const def = DEFINITIONS[kind];
  return <span className={`family-miniature family-miniature-${def.family}`}
    style={{ '--device-accent': def.color ?? (def.group === '直流控件' ? '#4f86ad' : '#73947c') } as CSSProperties}>
    <FamilyIcon family={def.family} size={21} />
  </span>;
}

export function Actuator({ label, active, disabled, momentary, onChange, children, className = '' }: {
  label: string; active: boolean; disabled: boolean; momentary?: boolean;
  onChange: (value: boolean) => void; children: ReactNode; className?: string;
}) {
  return <button aria-label={label} aria-pressed={active} title={label} disabled={disabled} className={`${className} ${active ? 'actuated' : ''}`}
    onClick={() => { if (!momentary) onChange(!active); }}
    onPointerDown={(event) => {
      event.stopPropagation();
      if (momentary) { event.currentTarget.setPointerCapture(event.pointerId); onChange(true); }
    }}
    onPointerUp={() => { if (momentary) onChange(false); }}
    onPointerCancel={() => { if (momentary) onChange(false); }}
    onLostPointerCapture={() => { if (momentary) onChange(false); }}
    onKeyDown={(event) => {
      if (momentary && [' ', 'Enter'].includes(event.key)) { event.preventDefault(); onChange(true); }
    }}
    onKeyUp={(event) => { if (momentary && [' ', 'Enter'].includes(event.key)) onChange(false); }}
    onBlur={() => { if (momentary && active) onChange(false); }}>
    {children}
  </button>;
}

export function ExtendedDeviceVisual({ component: c, runtime, controls, operating, onOperate, onTune }: {
  component: Component; runtime: Runtime; controls: Controls; operating: boolean;
  onOperate: (value?: boolean | number, channel?: string) => void; onTune: (value: number) => void;
}) {
  const def = DEFINITIONS[c.kind];
  const family = def.family;
  const value = controls[def.follow === 'target' && c.linkedTo ? c.linkedTo : c.id] ?? false;
  const active = !!runtime.outputs[c.id];
  const accent = def.color ?? (def.group === '直流控件' ? '#477c9e' : '#508d76');
  const style = { '--device-accent': accent } as CSSProperties;
  const operate = (channel?: string) => (v: boolean) => onOperate(v, channel);
  const coilVoltage = `${def.coil?.supply === 'dc' ? 'DC' : 'AC'} ${c.voltage} V`;
  const stamp = <div className="device-model-stamp">{def.prefix}<small>{def.capability === 'wiring' ? 'TERMINAL MODEL' : def.group === '直流控件' ? 'DC CONTROL' : 'EASYSIM'}</small></div>;

  if (family === 'breaker' || family === 'fuse' || family === 'thermal') return <div className={`extended-device din-device ${family}-device`} style={style}>
    <div className="din-poles">{Array.from({ length: def.poles ?? 2 }, (_, i) => <div key={i}><span /><i /><span /></div>)}</div>
    {stamp}
    {def.capability !== 'wiring' && <Actuator className={`din-lever ${family === 'fuse' || family === 'thermal' ? 'trip-lever' : ''}`}
      label={`${c.name} ${def.operation === 'trip' ? value ? '复位' : '试验跳闸' : value ? '分闸' : '合闸'}`}
      active={!!value} disabled={!operating} onChange={operate()}>
      {def.operation === 'trip' ? value ? <RotateCcw size={19} /> : <ZapOff size={19} /> : <Power size={20} />}
    </Actuator>}
    <div className="device-rating">{def.poles ?? ''}{def.poles ? 'P · ' : ''}{def.operation === 'trip' ? 'TEST' : `${c.voltage} V`}</div>
  </div>;

  if (family === 'switch') return <div className="extended-device wall-device" style={style}>
    <div className="wall-rockers">{(def.channels ?? ['1']).map((channel) =>
      <Actuator key={channel} label={`${c.name} 开关 ${channel}`} active={!!controls[`${c.id}.${channel}`]}
        disabled={!operating} onChange={operate(channel)} className="wall-rocker"><span /><Power size={13} /></Actuator>)}</div>
  </div>;

  if (family === 'selector') return <div className="extended-device selector-device" style={style}>
    <div className="selector-marks"><span>II</span><span>0</span><span>I</span></div>
    <button className="selector-knob" title={`${c.name} 切换位置`} aria-label={`${c.name} 切换位置`}
      disabled={!operating} style={{ transform: `rotate(${Number(value) === 1 ? 45 : Number(value) === 2 ? -45 : 0}deg)` }}
      onClick={() => onOperate((Number(value) + 1) % 3)}><span /></button>
    <div className="selector-positions" role="radiogroup" aria-label={`${c.name} 档位`}>
      {[0, 1, 2].map((position) => <button key={position} role="radio" aria-checked={Number(value) === position}
        disabled={!operating} aria-label={`${c.name} 档位 ${position}`} onClick={() => onOperate(position)}>{['0', 'I', 'II'][position]}</button>)}
    </div>
  </div>;

  if (family === 'pushbutton') return <div className={`extended-device pushbutton-housing extended-pushbutton ${c.kind.startsWith('emergency') ? 'emergency-device' : ''} ${runtime.lamps[c.id] ? 'button-lamp-on' : ''}`} style={style}>
    <Actuator label={`${c.name} ${def.operation === 'momentary' ? '点动' : value ? '复位' : '按下'}`}
      className="pushbutton" disabled={!operating} active={!!value}
      momentary={def.operation === 'momentary'} onChange={operate()}><Power size={21} /></Actuator>
    <span>{def.operation === 'momentary' ? 'MOMENTARY' : 'PUSH LOCK'}</span>
  </div>;

  if (family === 'lamp') return <div className={`pushbutton-housing lamp-housing extended-lamp ${c.kind === 'bulb' ? 'bulb-device' : ''}`} style={style}>
    <div className={`lamp-lens ${runtime.lamps[c.id] ? 'illuminated' : ''}`}><Lightbulb size={22} /></div>
    <span>{def.group === '直流控件' ? 'DC' : 'AC'} {c.voltage}V</span>
  </div>;

  if (family === 'tower') return <div className="tower-device" style={style}>
    <div className="tower-stack">{(['red', 'yellow', 'green'] as const).map((color) =>
      <div key={color} style={{ '--lens-color': { red: '#d15c52', yellow: '#d8b33d', green: '#4e9b65' }[color] } as CSSProperties}
        className={`tower-segment ${runtime.lampChannels[c.id]?.[color] ? 'segment-lit' : ''}`} />)}</div><div className="tower-stem" /><div className="tower-foot" />
  </div>;

  if (family === 'relay' || family === 'timer' || family === 'auxiliary') return <div className={`extended-device relay-device ${family}-device ${active ? 'device-powered' : ''}`} style={style}>
    {stamp}
    <div className="relay-window">
      {family === 'timer' ? <><div className="timer-readout">{((runtime.timers[c.id]?.elapsed ?? 0) / 1000).toFixed(1)}<small>s</small></div>
        <div className="timer-dial" style={{ transform: `rotate(${-120 + Math.min(1, (runtime.timers[c.id]?.elapsed ?? 0) / ((c.delay ?? 3) * 1000)) * 240}deg)` }}><span /></div>
        <progress max={(c.delay ?? 3) * 1000} value={runtime.timers[c.id]?.elapsed ?? 0} /></> :
        <><FamilyIcon family={family} size={35} /><div className="relay-contact-art"><i /><span /><i /></div></>}
    </div>
    <div className="relay-power"><span className={runtime.coils[c.id] || active ? 'led-on' : ''} /><small>{def.coil ? coilVoltage : 'NO + NC'}</small></div>
    {def.capability === 'wiring' && <span className="model-body-badge">仅接线</span>}
  </div>;

  if (family === 'sensor') return <div className={`extended-device sensor-device ${c.kind === 'lightCurtain' ? 'curtain-device' : ''}`} style={style}>
    {stamp}
    <div className={`sensor-lens ${active ? 'sensor-detected' : ''}`}>{c.kind === 'lightCurtain' ?
      Array.from({ length: 7 }, (_, i) => <i key={i} />) : <Radio size={32} />}</div>
    <Actuator label={`${c.name} ${value ? '复位' : c.kind === 'lightCurtain' ? '遮挡' : '触发'}`} active={!!value}
      disabled={!operating || !!c.linkedTo} momentary={def.operation === 'momentary'} onChange={operate()} className="sensor-trigger"><Eye size={16} /></Actuator>
    <span className="sensor-output-label">{def.spec.includes('NPN') ? 'NPN' : def.spec.includes('PNP') ? 'PNP' : 'SWITCH'}</span>
  </div>;

  if (family === 'terminal') return <div className={`terminal-block-device ${c.kind === 'terminalVertical' ? 'vertical-terminals' : ''}`}>
    {Array.from({ length: 4 }, (_, i) => <div className="terminal-block-cell" key={i}><span>{i + 1}</span></div>)}
  </div>;

  if (family === 'socket') return <div className="extended-device socket-device" style={style}>
    <div className="socket-recess"><i /><i /><i /></div>
    {def.operation && <Actuator label={`${c.name} 开关`} active={!!value} disabled={!operating} onChange={operate()} className="socket-toggle"><Power size={15} /></Actuator>}
  </div>;

  if (family === 'motor') return <>
    <img className="single-motor-photo" src="/assets/motor.webp" alt={def.name} draggable={false} />
    <span className={`single-motor-rotation ${active ? 'motor-running' : ''}`}><Fan size={28} /></span>
  </>;

  if (family === 'meter' || family === 'thermostat' || family === 'drive' || family === 'controller') return <div className={`extended-device instrument-device ${family}-instrument`} style={style}>
    {stamp}
    <div className="instrument-screen"><span>{family === 'thermostat' ? (c.value ?? 25).toFixed(1) :
      runtime.readings[c.id] != null ? runtime.readings[c.id]!.toFixed(1) : '—'}</span><small>{def.unit ?? (family === 'drive' ? 'Hz' : family === 'controller' ? 'I/O' : '')}</small></div>
    <div className="instrument-leds"><i className={active ? 'led-on' : ''} /><span>RUN</span><i /><span>STATUS</span></div>
    {family === 'drive' || family === 'controller' ? <div className="device-vents">{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</div> : <div className="meter-scale"><i /><i /><i /><i /><i /></div>}
    {def.capability === 'wiring' && <span className="model-body-badge">仅接线</span>}
  </div>;

  if (family === 'potentiometer') return <div className="extended-device potentiometer-device" style={style}>
    {stamp}<div className="potentiometer-knob" style={{ transform: `rotate(${-120 + (c.value ?? 50) * 2.4}deg)` }}><i /></div>
    <input type="range" aria-label={`${c.name} 调节值`} min={0} max={100} value={c.value ?? 50} onPointerDown={(event) => event.stopPropagation()} onChange={(event) => onTune(Number(event.target.value))} />
    <span>{c.value ?? 50}%</span>
  </div>;

  if (family === 'target') return <div className={`target-device ${value ? 'target-present' : ''}`}>
    <Actuator label={`${c.name} ${value ? '移出' : '到位'}`} active={!!value} disabled={!operating} onChange={operate()} className="target-object"><Box size={55} strokeWidth={1.2} /></Actuator>
    <div className="target-rail" />
  </div>;

  if (family === 'heater') return <div className={`heater-device ${active ? 'heater-on' : ''}`}>
    <div className="heater-coils">{[0, 1, 2, 3].map((i) => <i key={i} />)}</div><div className="heater-base"><span>HEATER</span></div>
  </div>;

  if (family === 'cylinder') return <div className={`cylinder-device ${active ? 'cylinder-extended' : ''}`}>
    <div className="cylinder-rod" /><div className="cylinder-case"><span>PNEUMATIC</span></div><div className="cylinder-nut" />
  </div>;

  return <div className={`extended-device generic-device ${family}-device ${active ? 'device-powered' : ''}`} style={style}>
    {stamp}<div className="generic-device-symbol"><FamilyIcon family={family} size={45} /></div>
    {family === 'valve' && <div className="valve-pipe"><i /></div>}
    <div className="relay-power"><span className={active ? 'led-on' : ''} /><small>{def.capability === 'wiring' ? 'TERMINAL MODEL' : `${c.voltage} V`}</small></div>
  </div>;
}
