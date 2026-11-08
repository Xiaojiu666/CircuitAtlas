import { describe, expect, it } from 'vitest';
import { CIRCUIT_EXAMPLES } from './examples';
import { parseProject } from './model';
import { historyReducer } from './workspaceHistory';
import type { History } from './workspaceHistory';

const initial = (): History => ({ current: CIRCUIT_EXAMPLES.find((e) => e.id === 'sequence')!.create(), past: [], future: [] });

describe('workspace cleanup history', () => {
  it.each(['wires', 'all'] as const)('clears %s in one undoable step without mutating the saved project', (scope) => {
    const before = initial(), snapshot = JSON.stringify(before.current);
    const cleared = historyReducer(before, { type: 'clear', scope });
    expect(cleared.current.name).toBe(before.current.name);
    expect(cleared.current.wires).toEqual([]);
    expect(cleared.current.components).toEqual(scope === 'all' ? [] : before.current.components);
    expect(cleared.past).toEqual([before.current]);
    expect(JSON.stringify(before.current)).toBe(snapshot);
    expect(parseProject(JSON.stringify(cleared.current))).toEqual(cleared.current);
    const restored = historyReducer(cleared, { type: 'undo' });
    expect(restored.current).toBe(before.current);
    expect(historyReducer(restored, { type: 'redo' }).current).toBe(cleared.current);
  });
  it('retains component links and settings when only wires are removed', () => {
    const before = initial();
    expect(before.current.components.some((c) => c.linkedTo)).toBe(true);
    expect(historyReducer(before, { type: 'clear', scope: 'wires' }).current.components).toBe(before.current.components);
  });
  it('does not create history entries when the selected scope is already empty', () => {
    const before = initial();
    const cleared = historyReducer(before, { type: 'clear', scope: 'all' });
    expect(historyReducer(cleared, { type: 'clear', scope: 'all' })).toBe(cleared);
    expect(historyReducer(cleared, { type: 'clear', scope: 'wires' })).toBe(cleared);
  });
  it('discards a redo branch when another cleanup is performed', () => {
    const before = initial();
    const cleared = historyReducer(before, { type: 'clear', scope: 'all' });
    const restored = historyReducer(cleared, { type: 'undo' });
    const rewired = historyReducer(restored, { type: 'clear', scope: 'wires' });
    expect(rewired.future).toEqual([]);
    expect(historyReducer(rewired, { type: 'undo' }).current).toBe(before.current);
  });
});
