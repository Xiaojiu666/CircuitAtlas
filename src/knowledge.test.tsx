import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFINITIONS, LIBRARY_GROUPS } from './model';
import {
  CONTACT_STATES, FAMILY_KNOWLEDGE, KNOWLEDGE_CATEGORIES, KNOWLEDGE_KINDS,
  filterKnowledge, kindFromHash, knowledgeFor, modelLimitations, terminalMeaning,
} from './knowledge';
import KnowledgePage from './KnowledgePage';

afterEach(() => vi.unstubAllGlobals());

describe('independent component knowledge library', () => {
  it('covers every catalog model and family without inventing electrical ratings', () => {
    expect(KNOWLEDGE_KINDS).toHaveLength(Object.keys(DEFINITIONS).length);
    for (const kind of KNOWLEDGE_KINDS) {
      const def = DEFINITIONS[kind], item = knowledgeFor(kind);
      expect(FAMILY_KNOWLEDGE[def.family!], kind).toBeDefined();
      expect(item.title.length, kind).toBeGreaterThan(1);
      expect(item.purpose.length, kind).toBeGreaterThan(15);
      expect(item.principle.length, kind).toBeGreaterThan(30);
      expect(item.applications.length, kind).toBeGreaterThanOrEqual(2);
      expect(item.specifications.length, kind).toBeGreaterThanOrEqual(3);
      expect(item.selection.length, kind).toBeGreaterThanOrEqual(3);
      expect(item.mistakes.length, kind).toBeGreaterThanOrEqual(3);
      expect(modelLimitations(def).length, kind).toBeGreaterThan(5);
      for (const port of def.ports) expect(terminalMeaning(kind, port.id).length, `${kind}:${port.id}`).toBeGreaterThan(1);
      for (const contact of def.contacts ?? []) expect(CONTACT_STATES[contact.when], kind).toBeTruthy();
    }
  });
  it('filters by title, model, terminal, voltage and knowledge keywords', () => {
    expect(filterKnowledge('接触器 380')).toContain('contactor380');
    expect(filterKnowledge('接触器 380')).not.toContain('contactorDC');
    expect(filterKnowledge('接触器 220V')).toContain('contactor');
    expect(filterKnowledge('contactor48DC')).toEqual(['contactor48DC']);
    expect(filterKnowledge('PNP')).toContain('proximityPNP');
    expect(filterKnowledge('自锁')).toContain('contactor');
    expect(filterKnowledge('OSSD1')).toContain('lightCurtain');
    expect(filterKnowledge('  AC  36  接触器  ')).toContain('contactor36AC');
    expect(filterKnowledge('不存在的元器件12345')).toEqual([]);
    expect(filterKnowledge('')).toEqual(KNOWLEDGE_KINDS);
  });
  it('combines category and group filters without losing models', () => {
    for (const category of KNOWLEDGE_CATEGORIES) {
      const found = filterKnowledge('', category);
      expect(found.length).toBeGreaterThan(0);
      expect(found.every((kind) => DEFINITIONS[kind].category === category)).toBe(true);
    }
    for (const group of LIBRARY_GROUPS) {
      expect(filterKnowledge('', '', group).every((kind) => DEFINITIONS[kind].group === group)).toBe(true);
    }
    expect(filterKnowledge('接触器', '接触器与继电器', '直流控件')).toContain('contactor48DC');
    expect(filterKnowledge('接触器', '电源', '直流控件')).toEqual([]);
  });
  it('uses safe model fragments for direct links', () => {
    expect(kindFromHash('#contactor380')).toBe('contactor380');
    expect(kindFromHash('#%63ontactor')).toBe('contactor');
    for (const hash of ['', '#missing', '#__proto__', '#constructor', '#%XX']) expect(kindFromHash(hash)).toBeNull();
  });
  it('keeps special device principles separate from broad family descriptions', () => {
    expect(knowledgeFor('surge3').title).toBe('浪涌保护器');
    expect(knowledgeFor('isolator').title).toBe('隔离开关');
    expect(knowledgeFor('safetyRelayDC').title).toBe('安全继电器');
    expect(knowledgeFor('ssrAC').title).toBe('固态继电器');
    expect(knowledgeFor('lightCurtain').title).toBe('安全光栅');
    expect(knowledgeFor('motorSingle').title).toBe('单相电机');
    expect(knowledgeFor('currentTransformer').title).toBe('电流互感器');
    expect(knowledgeFor('vfd').title).toBe('变频器');
    expect(knowledgeFor('softStarter').title).toBe('软启动器');
  });
  it('documents actual coil ports and only the auxiliary contacts present in each model', () => {
    expect(terminalMeaning('contactor380', 'A1')).toContain('AC 380 V');
    expect(terminalMeaning('contactor48DC', 'A2')).toContain('DC 48 V');
    expect(terminalMeaning('contactor220NO', '13')).toContain('线圈动作时闭合');
    expect(terminalMeaning('contactor220NC', '21')).toContain('线圈未动作时闭合');
    expect(terminalMeaning('photoPNP', 'OUT')).toContain('V+');
    expect(terminalMeaning('photoNPN', 'OUT')).toContain('0V');
    expect(terminalMeaning('motor', 'PE')).toContain('保护接地');
    expect(terminalMeaning('motor', 'U2')).toContain('尾端');
    expect(modelLimitations(DEFINITIONS.vfd)).toBe(DEFINITIONS.vfd.limitation);
    expect(modelLimitations(DEFINITIONS.breaker)).toContain('不计算');
  });
  it('renders the standalone reading page without accessing workbench storage', () => {
    vi.stubGlobal('window', { location: { hash: '#contactor48DC' } });
    const storage = { getItem: vi.fn(() => { throw new Error('Knowledge page must not read projects'); }), setItem: vi.fn() };
    vi.stubGlobal('localStorage', storage);
    const html = renderToStaticMarkup(<KnowledgePage />);
    expect(html).toContain('元器件百科');
    expect(html).toContain('直流接触器 · 48 V');
    expect(html).toContain('DC 48 V');
    expect(html).toContain('工作原理');
    expect(html).toContain('软件模型边界');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('aria-label="工程名称"');
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it('falls back to the contactor article for an unknown fragment', () => {
    vi.stubGlobal('window', { location: { hash: '#not-a-model' } });
    expect(renderToStaticMarkup(<KnowledgePage />)).toContain('交流接触器');
  });
});
