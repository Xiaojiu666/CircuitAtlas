import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BOARD_ARTICLES } from './boardKnowledge';
import { ENCYCLOPEDIA_ITEMS, encyclopediaCategories, encyclopediaIdFromHash, filterEncyclopedia } from './encyclopedia';
import KnowledgePage from './KnowledgePage';
import { KNOWLEDGE_KINDS } from './knowledge';
import { DEFINITIONS } from './model';

afterEach(() => vi.unstubAllGlobals());
describe('component encyclopedia independent of simulation models', () => {
  it('preserves all existing models and adds independent board-level entries', () => {
    expect(ENCYCLOPEDIA_ITEMS).toHaveLength(KNOWLEDGE_KINDS.length + BOARD_ARTICLES.length);
    expect(new Set(ENCYCLOPEDIA_ITEMS.map((item) => item.id)).size).toBe(ENCYCLOPEDIA_ITEMS.length);
    expect(filterEncyclopedia('', 'industrial')).toHaveLength(KNOWLEDGE_KINDS.length);
    expect(filterEncyclopedia('', 'board')).toHaveLength(12);
    for (const board of BOARD_ARTICLES) expect(Object.hasOwn(DEFINITIONS, board.id)).toBe(false);
  });
  it('filters by domain, category, aliases, manufacturers and keywords', () => {
    expect(filterEncyclopedia('MOSFET', 'board').map((item) => item.id)).toContain('pcb-mosfet');
    expect(filterEncyclopedia('LM358').map((item) => item.id)).toContain('pcb-opamp');
    expect(filterEncyclopedia('Murata').map((item) => item.id)).toContain('pcb-capacitor');
    expect(filterEncyclopedia('MOSFET', 'industrial')).toEqual([]);
    expect(filterEncyclopedia('', 'board', '电源管理')).toHaveLength(2);
    expect(filterEncyclopedia('', 'board', '', '交流控件')).toEqual([]);
    expect(encyclopediaCategories('board')).toContain('分立半导体');
    expect(encyclopediaCategories('industrial')).not.toContain('分立半导体');
  });
  it('supports safe independent URLs and preserves legacy hashes', () => {
    expect(encyclopediaIdFromHash('#breaker')).toBe('breaker');
    expect(encyclopediaIdFromHash('#pcb-resistor')).toBe('pcb-resistor');
    expect(encyclopediaIdFromHash('#pcb-%6dcu')).toBe('pcb-mcu');
    for (const hash of ['#%XX', '#__proto__', '#pcb-missing']) expect(encyclopediaIdFromHash(hash)).toBeNull();
  });
  it('requires substantive content and valid related entries and official sources', () => {
    for (const entry of BOARD_ARTICLES) {
      expect(entry.principle.length).toBeGreaterThan(35);
      expect(entry.specifications).toHaveLength(3);
      expect(entry.selection).toHaveLength(3);
      expect(entry.mistakes).toHaveLength(3);
      expect(entry.pins.length).toBeGreaterThan(0);
      expect(new URL(entry.source.url).protocol).toBe('https:');
      for (const id of entry.related) expect(BOARD_ARTICLES.some((item) => item.id === id)).toBe(true);
    }
  });
  it('renders every board article without simulation, storage or fabricated pin numbers', () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn() };
    vi.stubGlobal('localStorage', storage);
    for (const entry of BOARD_ARTICLES) {
      vi.stubGlobal('window', { location: { hash: `#${entry.id}` } });
      const html = renderToStaticMarkup(<KnowledgePage />);
      expect(html).toContain(entry.title);
      expect(html).toContain('基础词条 · 非仿真模型');
      expect(html).toContain('封装与识别');
      expect(html).toContain('引脚与接口');
      expect(html).toContain(entry.source.url.replaceAll('&', '&amp;'));
      expect(html).not.toContain('device3d-stage');
      expect(html).not.toContain('线圈 / 控制输入');
    }
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
