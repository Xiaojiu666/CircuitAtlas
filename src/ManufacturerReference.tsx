import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Expand, ImageOff, RotateCcw, X } from 'lucide-react';
import { manufacturerImagePath, manufacturerProductsFor } from './manufacturerCatalog';
import { DEFINITIONS } from './model';
import type { Kind } from './model';

function OfficialPhoto({ url, alt }: { url: string; alt: string }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  return <div className="manufacturer-photo" data-photo-state={status}>
    {status !== 'error' && <img key={`${url}-${attempt}`} src={url} alt={alt} referrerPolicy="no-referrer"
      onLoad={() => setStatus('ready')} onError={() => setStatus('error')} />}
    {status === 'loading' && <span className="manufacturer-photo-status" role="status">官方图片加载中</span>}
    {status === 'error' && <div className="manufacturer-photo-status" role="status"><ImageOff size={28} />
      <span>官方图片暂不可用</span><button onClick={() => { setStatus('loading'); setAttempt((value) => value + 1); }}><RotateCcw size={15} />重试</button></div>}
  </div>;
}

export default function ManufacturerReference({ kind = 'vfd' }: { kind?: Kind }) {
  const products = manufacturerProductsFor(kind);
  const name = DEFINITIONS[kind].name;
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const [imageIndex, setImageIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const product = products.find((item) => item.id === productId) ?? products[0];
  const image = product?.images[imageIndex] ?? product?.images[0];
  const imagePath = product && image ? manufacturerImagePath(product, imageIndex) : '';
  useEffect(() => {
    if (expanded) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [expanded]);
  if (!product) return <section className="manufacturer-reference manufacturer-uncollected" aria-label={`${name}厂商资料`}>
    <h3>厂商资料</h3><p>尚未收录经过核实的厂商型号、实物图与原厂 3D。</p>
    <p>当前仅有通用知识和教学模型，不对应特定厂商产品。</p>
  </section>;
  const brands = [...new Set(products.map((item) => item.brand))];
  return <section className="manufacturer-reference" aria-label={kind === 'vfd' ? '变频器厂商实物资料' : `${name}厂商资料`}>
    <div className="manufacturer-reference-heading"><h3>厂商资料与实物</h3><span>{brands.length} 家厂商 · {products.length} 项资料</span></div>
    <div className="manufacturer-selectors">
      <label>厂商<select aria-label={`${kind === 'vfd' ? '变频器' : '元器件'}厂商`} value={product.brand} onChange={(e) => { setProductId(products.find((item) => item.brand === e.target.value)!.id); setImageIndex(0); }}>
        {brands.map((brand) => <option key={brand}>{brand}</option>)}
      </select></label>
      <label>系列<select aria-label={`${kind === 'vfd' ? '变频器' : '元器件'}系列`} value={product.id} onChange={(e) => { setProductId(e.target.value); setImageIndex(0); }}>
        {products.filter((item) => item.brand === product.brand).map((item) => <option key={item.id} value={item.id}>{item.series}</option>)}
      </select></label>
    </div>
    <div className={`manufacturer-product ${!image ? 'without-photo' : ''}`} key={product.id}>
      {image && <div className="manufacturer-gallery">
        <div className="manufacturer-image-stage">
          <OfficialPhoto key={imagePath} url={imagePath} alt={`${product.brand} ${product.series} ${image.label}`} />
          <button className="manufacturer-expand" title="放大实物图片" aria-label="放大实物图片" onClick={() => setExpanded(true)}><Expand size={19} /></button>
        </div>
        <div className="manufacturer-thumbnails" aria-label="官方产品图片">
          {product.images.map((photo, index) => <button key={photo.url} title={photo.label} aria-label={photo.label}
            aria-pressed={imageIndex === index} onClick={() => setImageIndex(index)}>
            <img src={manufacturerImagePath(product, index)} alt="" loading="lazy" />
          </button>)}
          <span>{image.label}</span>
        </div>
      </div>}
      <div className="manufacturer-details">
        <span className="manufacturer-origin">{product.resourceType === 'directory' ? '官方目录 · 非具体型号' : product.resourceType === 'model' ? '官方具体型号' : image ? '厂家官方图片' : '官方系列资料'}</span><h4>{product.series}</h4><p className="manufacturer-brand">{product.brand}</p>
        <dl>{product.facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          {!image && <div><dt>实物图片</dt><dd>尚未收录</dd></div>}
          <div><dt>原厂 3D</dt><dd>{product.cadSource ? '官网有 CAD 下载；网页预览尚未接入' : '尚未接入可用的原厂三维文件'}</dd></div>
        </dl>
        <a className="manufacturer-source" href={product.source} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />官方产品资料</a>
        {image && <a className="manufacturer-source manufacturer-image-source" href={image.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} />原图来源</a>}
        {product.cadSource && <a className="manufacturer-source manufacturer-image-source" href={product.cadSource} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} />官方 CAD 下载</a>}
      </div>
    </div>
    <p className="manufacturer-boundary">厂商实物与教学模型相互独立。系列外观不代表具体订货号；未标注的功率、电压、端位和选件不作推断。下方通用教学端子表不属于该厂商。</p>
    <p className="manufacturer-copyright">图片来源于厂家官网，权利归各厂商所有；本地学习参考不代表取得商业转载授权。结构示意不是原厂 CAD。</p>
    <dialog className="manufacturer-dialog" ref={dialogRef} onCancel={() => setExpanded(false)} onClose={() => setExpanded(false)}
      aria-label={`${product.series}实物大图`}>
      <header><strong>{product.brand} · {product.series}</strong><button title="关闭实物大图" aria-label="关闭实物大图" onClick={() => setExpanded(false)}><X size={21} /></button></header>
      {expanded && image && <OfficialPhoto key={imagePath} url={imagePath} alt={`${product.series} ${image.label}`} />}
      <p>{image?.label} · 系列外观参考</p>
    </dialog>
  </section>;
}
