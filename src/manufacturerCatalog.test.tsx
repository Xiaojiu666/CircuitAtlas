import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { INDUSTRIAL_PRODUCTS, manufacturerImagePath, manufacturerProductsFor, VFD_PRODUCTS } from './manufacturerCatalog';
import ManufacturerReference from './ManufacturerReference';
import KnowledgePage from './KnowledgePage';
import { filterKnowledge } from './knowledge';

afterEach(() => vi.unstubAllGlobals());

describe('manufacturer reference catalog', () => {
  it('has unique series with official sources and real image URLs, not generated models', () => {
    expect(VFD_PRODUCTS).toHaveLength(5);
    expect(new Set(VFD_PRODUCTS.map((item) => item.id)).size).toBe(5);
    for (const item of VFD_PRODUCTS) {
      expect(new URL(item.source).protocol).toBe('https:');
      expect(item.images.length).toBeGreaterThan(0);
      expect(item.facts.length).toBeGreaterThan(1);
      for (const image of item.images) expect(new URL(image.url).protocol).toBe('https:');
    }
  });
  it('finds VFD knowledge by manufacturer and series names', () => {
    for (const word of ['西门子', 'Siemens V20', 'ABB ACS355', '台达 MS300', '英威腾 GD20', '汇川 MD200']) {
      expect(filterKnowledge(word), word).toContain('vfd');
    }
  });
  it('includes every local reference photograph with its original source preserved', () => {
    for (const product of INDUSTRIAL_PRODUCTS) {
      product.images.forEach((_image, index) => {
        const file = readFileSync(new URL(`../public${manufacturerImagePath(product, index)}`, import.meta.url));
        expect(file.length).toBeGreaterThan(1000);
        expect(file.toString('ascii', 8, 12)).toBe('WEBP');
      });
    }
  });
  it('uses the shared manufacturer catalog for non-VFD devices without false product matching', () => {
    expect(manufacturerProductsFor('contactor48DC').some((item) => item.id === 'abb-af')).toBe(true);
    expect(manufacturerProductsFor('ssrAC').some((item) => item.id === 'finder-ssr')).toBe(true);
    expect(manufacturerProductsFor('surge3').every((item) => item.id === 'finder-spd')).toBe(true);
    expect(manufacturerProductsFor('source3').some((item) => item.id === 'meanwell-hdr60')).toBe(false);
    expect(manufacturerProductsFor('mccbBlack').some((item) => item.id === 'abb-mcb')).toBe(false);
    expect(manufacturerProductsFor('safetyRelayAC').some((item) => item.id === 'finder-relay')).toBe(false);
    expect(manufacturerProductsFor('voltmeter').some((item) => item.id === 'finder-meter')).toBe(false);
    expect(new Set(INDUSTRIAL_PRODUCTS.map((item) => item.id)).size).toBe(INDUSTRIAL_PRODUCTS.length);
  });
  it('renders a clear missing-collection state for devices without validated source material', () => {
    const html = renderToStaticMarkup(<ManufacturerReference kind="target" />);
    expect(html).toContain('尚未收录经过核实');
    expect(html).not.toContain('SINAMICS');
    expect(html).not.toContain('<canvas');
  });
  it('clearly distinguishes series photos, generic terminals, and unavailable original CAD', () => {
    const html = renderToStaticMarkup(<ManufacturerReference />);
    expect(html).toContain('SINAMICS V20');
    expect(html).toContain('变频器厂商');
    expect(html).toContain('官方产品资料');
    expect(html).toContain('尚未接入可用的原厂三维文件');
    expect(html).toContain('下方通用教学端子表不属于该厂商');
    expect(html).not.toContain('<canvas');
  });
  it('shows manufacturer photos by default on the independent VFD page', () => {
    vi.stubGlobal('window', { location: { hash: '#vfd' } });
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Do not read wiring projects'); } });
    const html = renderToStaticMarkup(<KnowledgePage />);
    expect(html).toContain('变频器厂商实物资料');
    expect(html).toContain('aria-pressed="true">厂商实物');
    expect(html).not.toContain('device3d-stage');
  });
});
