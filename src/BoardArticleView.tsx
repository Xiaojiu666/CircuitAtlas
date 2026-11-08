import { BookOpen, ExternalLink, Microchip } from 'lucide-react';
import type { BoardArticle } from './boardKnowledge';
import { BOARD_ARTICLES } from './boardKnowledge';

function Rows({ rows }: { rows: [string, string][] }) {
  return <dl className="knowledge-specs">{rows.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>;
}
export default function BoardArticleView({ entry }: { entry: BoardArticle }) {
  return <>
    <div className="knowledge-breadcrumb"><Microchip size={17} /><span>板级电子</span><span>/</span><span>{entry.category}</span></div>
    <div className="knowledge-device-heading with-3d">
      <div className="knowledge-device-text"><div className="knowledge-type">电子元器件百科<span>基础词条 · 非仿真模型</span></div>
        <h2>{entry.title}</h2><p className="knowledge-purpose">{entry.purpose}</p>
        <div className="knowledge-model-line">{entry.aliases.slice(0, 4).map((alias) => <span key={alias}>{alias}</span>)}</div>
      </div>
    </div>
    <nav className="board-section-nav" aria-label="词条章节">
      {[['principle', '原理'], ['specs', '规格'], ['packages', '识别'], ['pins', '引脚'], ['checks', '误区'], ['sources', '资料']].map(([id, text]) =>
        <a key={id} href={`#${entry.id}`} onClick={(event) => { event.preventDefault(); document.getElementById(`board-${id}`)?.scrollIntoView({ behavior: 'instant', block: 'start' }); }}>{text}</a>)}
    </nav>
    <article className="knowledge-article board-article">
      <section id="board-principle"><h3>工作原理</h3><p>{entry.principle}</p>
        <div className="knowledge-applications">{entry.applications.map((name, i) => <div key={name}><span>{String(i + 1).padStart(2, '0')}</span><h4>{name}</h4></div>)}</div>
      </section>
      <section id="board-specs"><h3>规格与选型</h3><Rows rows={entry.specifications} />
        <ul className="knowledge-points">{entry.selection.map((text) => <li key={text}>{text}</li>)}</ul>
      </section>
      <section id="board-packages"><h3>封装与识别</h3><p>{entry.marking}</p>
        <ul className="knowledge-points">{entry.packages.map((text) => <li key={text}>{text}</li>)}</ul>
        <p className="knowledge-caption">实物图与原厂 3D 尚未收录。封装名称不是尺寸图；丝印短码不是唯一型号。</p>
      </section>
      <section id="board-pins"><h3>引脚与接口</h3><Rows rows={entry.pins} /><p className="knowledge-caption">这里解释通用功能，不指定脚号。引脚顺序、顶视图 / 底视图、裸露焊盘和极性以具体订货型号的数据手册为准。</p></section>
      <section id="board-checks"><h3>常见误区</h3><ol className="knowledge-mistakes">{entry.mistakes.map((text) => <li key={text}><h4>{text}</h4></li>)}</ol></section>
      <section id="board-sources"><h3><BookOpen size={18} />厂商与原始资料</h3><p>{entry.source.brand}</p>
        <a className="board-source-link" href={entry.source.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />{entry.source.title}</a>
        <p className="knowledge-caption">手册中的型号是学习参考，不表示同类产品均有相同参数、脚序或可直接替换。尚未建立完整型号参数与替代料数据库。</p>
        <p className="knowledge-caption">官方资料可能受地区或访问策略限制，以官网实际提供的版本为准。</p>
      </section>
      <section><h3>相关词条</h3><div className="board-related-links">{entry.related.map((id) => <a key={id} href={`#${id}`}>{BOARD_ARTICLES.find((item) => item.id === id)?.title}</a>)}</div></section>
      <section className="knowledge-model-boundary"><h3>知识与实操边界</h3><p>此词条不提供模拟电路求解或主板故障诊断。断电也可能存在储能，不以软件内容替代实物手册、测量条件与安全程序。</p></section>
    </article>
  </>;
}
