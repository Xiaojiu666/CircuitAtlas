import { useState } from 'react';
import { ArrowRight, Crosshair, Maximize, Minimize2, Waypoints, X } from 'lucide-react';
import { DEFINITIONS } from './model';
import type { Component } from './model';
import type { ConnectedPort, TerminalConnection } from './connections';

export function ConnectionPanel({ component, rows, focusedWire, onFocus, onLocate, onClose }: {
  component: Component;
  rows: ConnectedPort[];
  focusedWire?: string;
  onFocus: (wireId?: string) => void;
  onLocate: (connection: TerminalConnection) => void;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const wires = new Set(rows.flatMap((row) => row.connections.map((c) => c.wire.id)));
  const connectedPorts = rows.filter((row) => row.connections.length).length;
  const ExpandIcon = expanded ? Minimize2 : Maximize;
  return <aside className={`connection-panel ${expanded ? 'connection-expanded' : ''}`} aria-label={`${component.name} 接线明细`}>
    <header className="connection-heading">
      <div><Waypoints size={18} /><h2>{component.name} 接线明细</h2></div>
      <div className="connection-heading-tools">
        <button className="tool" title={expanded ? '收起接线明细' : '展开接线明细'} aria-label={expanded ? '收起接线明细' : '展开接线明细'}
          aria-pressed={expanded} onClick={() => setExpanded(!expanded)}><ExpandIcon size={17} /></button>
        <button className="tool" title="关闭接线明细" aria-label="关闭接线明细" onClick={onClose}><X size={18} /></button>
      </div>
    </header>
    <div className="connection-summary">
      <span>{DEFINITIONS[component.kind].name}</span>
      <strong>{connectedPorts}/{rows.length} 端子 · {wires.size} 根线</strong>
    </div>
    <div className="connection-columns" aria-hidden="true"><span>本机端子</span><span>直连设备 / 端子</span></div>
    <div className="connection-list" key={component.id}>
      {rows.map((row) => <div className="connection-port" key={row.port.id} role="group" aria-label={`${component.name} ${row.port.id} 接线`}>
        <div className="connection-source" title={row.port.label}>
          <strong>{row.port.id}</strong>
          {row.port.label !== row.port.id && <small>{row.port.label}</small>}
          {row.connections.length > 1 && <small>{row.connections.length} 根线</small>}
        </div>
        <div className="connection-targets">
          {row.connections.length ? row.connections.map((connection) => {
            const target = connection.component;
            const label = `${component.name}:${row.port.id} → ${target?.name ?? '缺失设备'}:${connection.portId}`;
            return <div className={`connection-target ${focusedWire === connection.wire.id ? 'connection-focused' : ''}`} key={connection.wire.id}>
              <button className="connection-route" title={label} aria-label={`高亮 ${label}`}
                aria-pressed={focusedWire === connection.wire.id}
                onClick={() => onFocus(focusedWire === connection.wire.id ? undefined : connection.wire.id)}>
                <ArrowRight size={14} />
                <span><strong>{target?.name ?? '缺失设备'}<span className="connection-target-port">:{connection.portId}</span></strong>
                  <small>{target ? DEFINITIONS[target.kind].name : connection.terminal}</small></span>
              </button>
              <button className="connection-locate tool" title={`定位 ${target?.name ?? ''} 端子 ${connection.portId}`}
                aria-label={`定位 ${label}`} disabled={!target || !connection.port} onClick={() => { setExpanded(false); onLocate(connection); }}>
                <Crosshair size={18} />
              </button>
            </div>;
          }) : <span className="connection-unwired">未接线</span>}
        </div>
      </div>)}
      {!rows.length && <div className="connection-empty">该元件无接线端子</div>}
    </div>
    <footer className="connection-footer">
      <button className="text-button" disabled={!focusedWire} onClick={() => onFocus()}><Waypoints size={15} />全部接线</button>
      <span>{rows.length - connectedPorts} 处未接线</span>
    </footer>
  </aside>;
}
