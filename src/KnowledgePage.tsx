import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUp, BookOpen, ChevronRight, CircuitBoard, Info, Microchip, Search, ShieldAlert, X } from 'lucide-react';
import { DEFINITIONS, LIBRARY_GROUPS } from './model';
import type { Kind } from './model';
import { DeviceMiniature, FamilyIcon } from './DeviceVisual';
import ManufacturerReference from './ManufacturerReference';
import BoardArticleView from './BoardArticleView';
import { BOARD_ARTICLES } from './boardKnowledge';
import { ENCYCLOPEDIA_ITEMS, encyclopediaCategories, encyclopediaIdFromHash, filterEncyclopedia } from './encyclopedia';
import type { EncyclopediaDomain, EncyclopediaId } from './encyclopedia';
import {
  CONTACT_STATES, KNOWLEDGE_KINDS,
  hasDevice3D, knowledgeFor, modelLimitations, terminalMeaning,
} from './knowledge';

const TABS = [
  ['overview', '作用与原理'], ['specs', '规格与选型'], ['terminals', '端子与触点'], ['checks', '误区与检查'],
] as const;
type Tab = typeof TABS[number][0];
const Device3DView = lazy(() => import('./Device3DView'));

function DeviceImage({ kind }: { kind: Kind }) {
  const def = DEFINITIONS[kind];
  return def.image ? <img src={def.image} alt={def.name} loading="lazy" /> : <DeviceMiniature kind={kind} />;
}
function Points({ items }: { items: string[] }) {
  return <ul className="knowledge-points">{items.map((text) => <li key={text}>{text}</li>)}</ul>;
}
function SpecTable({ rows }: { rows: [string, string][] }) {
  return <dl className="knowledge-specs">{rows.map(([name, value]) =>
    <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>;
}

export default function KnowledgePage() {
  const [selectedId, setSelectedId] = useState<EncyclopediaId>(() => encyclopediaIdFromHash(window.location.hash) ?? 'contactor');
  const selectedItem = ENCYCLOPEDIA_ITEMS.find((item) => item.id === selectedId)!;
  const kind = selectedItem.kind ?? 'contactor';
  const boardEntry = BOARD_ARTICLES.find((item) => item.id === selectedId);
  const [domain, setDomain] = useState<EncyclopediaDomain>(() => selectedId.startsWith('pcb-') ? 'board' : '');
  const [tab, setTab] = useState<Tab>('overview');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [group, setGroup] = useState('');
  const [mobileLibrary, setMobileLibrary] = useState(false);
  const [vfdView, setVfdView] = useState<'manufacturer' | 'teaching'>('manufacturer');
  const contentRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const visible = useMemo(() => filterEncyclopedia(search, domain, category, group), [search, domain, category, group]);
  const def = DEFINITIONS[kind], entry = knowledgeFor(kind);
  const related = KNOWLEDGE_KINDS.filter((id) => id !== kind && DEFINITIONS[id].family === def.family);
  useEffect(() => {
    const change = () => {
      setSelectedId(encyclopediaIdFromHash(window.location.hash) ?? 'contactor');
      setTab('overview');
      setVfdView('manufacturer');
      setMobileLibrary(false);
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    document.title = `${selectedItem.name} · 元器件百科`;
    contentRef.current?.scrollTo({ top: 0 });
  }, [selectedId, tab, selectedItem.name]);
  useEffect(() => {
    if (!mobileLibrary) return;
    searchRef.current?.focus();
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileLibrary(false);
    };
    const closeOnResize = () => { if (window.innerWidth > 760) setMobileLibrary(false); };
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', closeOnResize);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', closeOnResize);
    };
  }, [mobileLibrary]);
  const resetFilters = () => { setSearch(''); setCategory(''); setGroup(''); setDomain(''); };
  const selectKind = (id: EncyclopediaId) => {
    if (id === selectedId) setMobileLibrary(false);
  };
  const modelSpecs: [string, string][] = [
    ['模型名称', def.name], ['所属分类', `${def.category} / ${def.group}`],
    ['模型规格', def.spec],
    [def.coil ? '线圈 / 控制输入' : def.supply ? '模型电源电压' : def.loads?.length ? '模型负载参考电压' : '模型参考参数',
      `${def.coil ? `${def.coil.supply.toUpperCase()} ` : ''}${def.voltage} V${!def.coil && !def.supply && !def.loads?.length ? '（不是触点额定电压或选型依据）' : ''}`],
    ['端子 / 标识', `${def.ports.length} 个 / ${def.prefix}`],
  ];
  return <div className="knowledge-app">
    <header className="knowledge-header">
      <a className="knowledge-brand" href="/knowledge.html" aria-label="元器件知识库首页"><CircuitBoard size={24} /><span>EasySIM</span></a>
      <span className="knowledge-header-divider" />
      <h1><BookOpen size={20} />元器件百科</h1>
      <span className="knowledge-total">{ENCYCLOPEDIA_ITEMS.length} 篇词条 · {KNOWLEDGE_KINDS.length} 个教学型号</span>
      <a className="knowledge-workbench-link" href="/" target="_blank" rel="noopener noreferrer"><ArrowLeft size={16} />接线操作台</a>
    </header>
    <div className="knowledge-layout">
      <aside className={`knowledge-library ${mobileLibrary ? 'mobile-open' : ''}`} aria-label="知识库目录">
        <div className="knowledge-library-title"><h2>百科目录</h2><span>{visible.length} / {ENCYCLOPEDIA_ITEMS.length}</span>
          <button className="knowledge-icon knowledge-close-library" title="关闭元件目录" aria-label="关闭元件目录" onClick={() => setMobileLibrary(false)}><X size={19} /></button>
        </div>
        <div className="encyclopedia-domains" role="group" aria-label="百科领域">
          {([['', '全部'], ['industrial', '基础电工'], ['board', '板级电子']] as const).map(([value, label]) =>
            <button key={value} aria-pressed={domain === value} onClick={() => { setDomain(value); setCategory(''); setGroup(''); }}>{label}</button>)}
        </div>
        <label className="knowledge-search"><Search size={18} /><input ref={searchRef} aria-label="搜索元器件知识" placeholder="名称、规格、知识点…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {search && <button title="清除搜索" aria-label="清除搜索" onClick={() => setSearch('')}><X size={16} /></button>}
        </label>
        <div className="knowledge-filters">
          <label><span>分类</span><select aria-label="知识分类" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">全部分类</option>{encyclopediaCategories(domain).map((name) => <option key={name}>{name}</option>)}
          </select></label>
          <label><span>教学型号</span><select aria-label="元件电源类型" disabled={domain === 'board'} value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">全部类型</option>{LIBRARY_GROUPS.map((name) => <option key={name}>{name}</option>)}
          </select></label>
        </div>
        <nav className="knowledge-directory" aria-label="元器件文章">
          {visible.length ? visible.map((item) => <a key={item.id} className={`knowledge-directory-item ${selectedId === item.id ? 'selected' : ''}`}
            href={`#${item.id}`} aria-current={selectedId === item.id ? 'page' : undefined} onClick={() => selectKind(item.id)}>
            <span className="knowledge-thumbnail">{item.kind ? <DeviceImage kind={item.kind} /> : <Microchip size={27} />}</span>
            <span className="knowledge-item-name"><strong>{item.name}</strong><small>{item.subtitle}</small></span>
            <ChevronRight size={15} />
          </a>) : <div className="knowledge-empty"><Search size={27} /><h3>没有匹配的元件</h3><p>“{search || category || group}”</p>
            <button onClick={resetFilters}>清除筛选</button></div>}
        </nav>
        <div className="knowledge-library-footer"><BookOpen size={16} />基础知识 · 型号规格 · 端子说明</div>
      </aside>
      <main className="knowledge-content" ref={contentRef} inert={mobileLibrary} aria-hidden={mobileLibrary || undefined}>
        <button className="knowledge-mobile-toggle" onClick={() => setMobileLibrary(true)}><Search size={18} />查找元器件<ChevronRight size={16} /></button>
        <div className="knowledge-reading">
          {boardEntry ? <BoardArticleView key={boardEntry.id} entry={boardEntry} /> : <>
          <div className="knowledge-breadcrumb"><FamilyIcon family={def.family} size={17} /><span>基础电工</span><ChevronRight size={14} /><span>{def.category}</span><ChevronRight size={14} /><span>{entry.title}</span></div>
          <div className={`knowledge-device-heading ${hasDevice3D(kind) ? 'with-3d' : ''}`}>
            <div className="knowledge-device-text">
              <div className="knowledge-type">{def.group}<span>通用教学模型</span></div>
              <h2>{def.name}</h2>
              <p className="knowledge-purpose">{entry.purpose}</p>
              <div className="knowledge-model-line"><span>{def.spec}</span><span>{def.ports.length} 个端子</span></div>
            </div>
            {!hasDevice3D(kind) && <figure className={`knowledge-device-image ${def.image ? 'has-photo' : ''}`}><DeviceImage kind={kind} /><figcaption>{def.image ? '模型参考外观' : entry.title}</figcaption></figure>}
          </div>
          <div className="knowledge-reference-tabs" role="group" aria-label={`${kind === 'vfd' ? '变频器' : '元器件'}外观来源`}>
            <button aria-pressed={vfdView === 'manufacturer'} onClick={() => setVfdView('manufacturer')}>厂商实物</button>
            <button aria-pressed={vfdView === 'teaching'} onClick={() => setVfdView('teaching')}>通用结构示意</button>
          </div>
          {vfdView === 'manufacturer' && <ManufacturerReference key={kind} kind={kind} />}
          {!hasDevice3D(kind) && vfdView === 'teaching' && <p className="knowledge-caption">尚未收录此元件的三维结构示意。</p>}
          {hasDevice3D(kind) && vfdView === 'teaching' &&
            <Suspense fallback={<div className="device3d-placeholder" role="status">模型加载中</div>}><Device3DView key={kind} kind={kind} /></Suspense>}
          <div className="knowledge-notice"><ShieldAlert size={19} /><p>教学知识不替代具体产品的铭牌、说明书和安全设计。实物接线、检修及测试需由具备相应能力的人员按适用要求进行。</p></div>
          <div className="knowledge-tabs" role="tablist" aria-label="知识内容">
            {TABS.map(([id, title]) => <button key={id} role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`}
              tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)}
              onKeyDown={(e) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
                e.preventDefault();
                const index = TABS.findIndex(([value]) => value === tab);
                const next = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 :
                  (index + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
                setTab(TABS[next][0]);
                document.getElementById(`tab-${TABS[next][0]}`)?.focus();
              }}>{title}</button>)}
          </div>
          <article className="knowledge-article" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'overview' && <>
              <section><h3>工作原理</h3><p>{entry.principle}</p></section>
              <section><h3>典型用途</h3><div className="knowledge-applications">{entry.applications.map((name, i) =>
                <div key={name}><span>{String(i + 1).padStart(2, '0')}</span><h4>{name}</h4></div>)}</div></section>
              <section><h3>本型号速览</h3><SpecTable rows={modelSpecs} /></section>
            </>}
            {tab === 'specs' && <>
              <section><h3>本型号参数</h3><SpecTable rows={modelSpecs} /><p className="knowledge-caption">以上来自当前元件模型。未提供的额定电流、功率、认证等参数不作推断，不对应某个厂家的完整订货型号。</p></section>
              <section><h3>规格应该怎么看</h3><SpecTable rows={entry.specifications} /></section>
              <section><h3>选型要点</h3><Points items={entry.selection} /></section>
              {!!related.length && <section><h3>同类模型对照 <span>{related.length + 1} 种</span></h3><div className="knowledge-table-wrap"><table>
                <caption>当前知识库中的同类模型</caption><thead><tr><th scope="col">模型</th><th scope="col">规格</th><th scope="col">端子</th></tr></thead>
                <tbody>{[kind, ...related].map((id) => <tr key={id} aria-current={id === kind ? 'true' : undefined}><th scope="row"><a href={`#${id}`}>{DEFINITIONS[id].name}</a></th><td>{DEFINITIONS[id].spec}</td><td>{DEFINITIONS[id].ports.length}</td></tr>)}</tbody>
              </table></div></section>}
            </>}
            {tab === 'terminals' && <>
              <section><h3>端子含义 <span>{def.ports.length} 个</span></h3><p className="knowledge-caption">下面列出本模型的编号和逻辑关系，不代表任意厂家的实物端位。8 / 14 脚继电器等尤其需要核对具体型号的接线图。</p>
                {def.ports.length ? <div className="knowledge-table-wrap"><table><caption>本型号端子表</caption><thead><tr><th scope="col">编号</th><th scope="col">标识</th><th scope="col">含义 / 模型连接关系</th></tr></thead>
                  <tbody>{def.ports.map((p) => <tr key={p.id}><th scope="row"><code>{p.id}</code></th><td>{p.label}</td><td>{terminalMeaning(kind, p.id)}</td></tr>)}</tbody></table></div> :
                  <p className="knowledge-no-terminals">这个物料模型没有电气接线端子，通过关联传感器参与检测状态教学。</p>}
              </section>
              {!!def.contacts?.length && <section><h3>触点动作表</h3><div className="knowledge-table-wrap"><table><caption>当前模型的触点动作条件</caption><thead><tr><th scope="col">端子对</th><th scope="col">闭合条件</th><th scope="col">通道</th></tr></thead>
                <tbody>{def.contacts.map((c, index) => <tr key={index}><th scope="row"><code>{c.a} / {c.b}</code></th><td>{CONTACT_STATES[c.when]}</td><td>{c.channel ?? '—'}</td></tr>)}</tbody></table></div></section>}
              <section><h3>读图基础</h3><Points items={['NO 为常开，NC 为常闭，基准通常是未操作、未励磁的正常状态；具体器件以说明书为准。',
                '触点与电源端子不是一回事。干接点本身不产生供电电压。',
                '同一器件上的不同端子组可能属于不同回路，不能因为在同一外壳内就认为相互导通。']} /></section>
            </>}
            {tab === 'checks' && <>
              <section><h3>常见误区</h3><ol className="knowledge-mistakes">{entry.mistakes.map((text) => <li key={text}><h4>{text}</h4></li>)}</ol></section>
              <section><h3>分析思路</h3><Points items={[
                '先确认具体型号、铭牌和对应接线图，分清电源、控制、信号与保护接口。',
                '再核对电源制式、实际输入条件和控制命令，区分“命令发出”“触点动作”和“负载实际运行”。',
                '最后对照各状态下的逻辑关系排查。实物测试前需落实隔离、储能处理和规定的验证，不以软件状态判定现场安全。',
              ]} /></section>
              <section><h3>术语小辞典</h3><SpecTable rows={[
                ['额定值', '制造商在规定使用条件下声明的值；不能脱离环境、工作制和负载类别使用。'],
                ['常态', '定义触点时采用的基准状态，不一定等于设备正在运行时的状态。'],
                ['电气自锁', '通过自身辅助触点维持控制回路，不等于按钮机械卡住。'],
                ['互锁', '阻止冲突动作同时成立的措施，具体实现与完整安全要求有关。'],
              ]} /></section>
            </>}
            <section className="knowledge-model-boundary"><h3><Info size={19} />软件模型边界</h3><p>{modelLimitations(def)}</p>
              <p>模型的参考参数、逻辑端子与理想状态只用于学习，不等于制造商的选型表、保护配合表或安全验证结果。</p></section>
          </article>
          </>}
          <footer className="knowledge-article-footer"><span>EasySIM · 元器件学习资料</span><button title="回到页首" aria-label="回到页首" onClick={() => contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}><ArrowUp size={17} /></button></footer>
        </div>
      </main>
    </div>
  </div>;
}
