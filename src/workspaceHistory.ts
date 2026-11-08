import type { Project } from './model';

export type CleanupScope = 'wires' | 'all';
export type History = { current: Project; past: Project[]; future: Project[] };
export type Action = { type: 'change' | 'replace'; project: Project } |
  { type: 'clear'; scope: CleanupScope } | { type: 'undo' } | { type: 'redo' };

export function historyReducer(state: History, action: Action): History {
  if (action.type === 'undo') {
    if (!state.past.length) return state;
    return { current: state.past[state.past.length - 1], past: state.past.slice(0, -1), future: [state.current, ...state.future] };
  }
  if (action.type === 'redo') {
    if (!state.future.length) return state;
    return { current: state.future[0], past: [...state.past, state.current], future: state.future.slice(1) };
  }
  if (action.type === 'clear' && !state.current.wires.length &&
      (action.scope === 'wires' || !state.current.components.length)) return state;
  const project = action.type === 'clear' ? {
    ...state.current, components: action.scope === 'all' ? [] : state.current.components, wires: [],
  } : action.project;
  return { current: project, past: [...state.past.slice(-69), state.current], future: [] };
}
