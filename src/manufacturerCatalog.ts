import { DEFINITIONS } from './model';
import type { Family, Kind } from './model';

export interface ManufacturerProduct {
  id: string;
  brand: string;
  series: string;
  category: string;
  source: string;
  images: { url: string; label: string }[];
  facts: [string, string][];
  resourceType?: 'model' | 'series' | 'directory';
  cadSource?: string;
}

// Series photographs are not evidence for a particular order code or terminal layout.
export const VFD_PRODUCTS: ManufacturerProduct[] = [
  {
    id: 'siemens-v20', brand: '西门子 Siemens', series: 'SINAMICS V20', category: '变频器',
    source: 'https://www.siemens.com/en-us/products/sinamics/v20/',
    images: [{
      url: 'https://images.sw.cdn.siemens.com/siemens-disw-assets/public/1xVfZF4y4jeFqSlGIbaM5v/en-US/p-d011-xx-00790v_small%20(1).jpeg',
      label: '系列产品及选件',
    }],
    facts: [['系列', 'SINAMICS V20'], ['图片范围', '变频器与操作面板等选件；选件不代表标配']],
  },
  {
    id: 'abb-acs355', brand: 'ABB', series: 'ACS355', category: '变频器',
    source: 'https://new.abb.com/drives/low-voltage-ac/machinery/acs355',
    images: [{
      url: 'https://media-d.global.abb/is/image/abbc/product-image-9IBA038796-acs355-r1-left-1?wid=1000&fmt=png-alpha',
      label: 'R1 外形参考',
    }],
    facts: [['系列', 'ACS355 机械传动'], ['图片范围', 'R1 外形；其他机座及配置外观可能不同']],
  },
  {
    id: 'delta-ms300', brand: '台达 Delta', series: 'MS300', category: '变频器',
    source: 'https://www.deltaww.com/en-US/products/Inverters-AC-Motor-Drives/3449',
    images: [{
      url: 'https://filecenter.deltaww.com/products/images/06/060101/MS300_S.jpg',
      label: '系列机型合照',
    }],
    facts: [['系列', 'MS300 紧凑型变频器'], ['图片范围', '系列不同机型合照；非单一订货型号']],
  },
  {
    id: 'invt-gd20', brand: '英威腾 INVT', series: 'GD20', category: '变频器',
    source: 'https://www.invt.com.cn/product-detail-1011-27.html',
    images: [
      { url: 'https://www.invt.com.cn/upload/goodsgallery/2026-07/6a51c17e5b468.png', label: '官方外观 1' },
      { url: 'https://www.invt.com.cn/upload/goodsgallery/2026-07/6a51c17e69192.png', label: '官方外观 2' },
      { url: 'https://www.invt.com.cn/upload/goodsgallery/2026-07/6a51c17e7eee0.png', label: '官方外观 3' },
    ],
    facts: [['系列', 'GD20 紧凑型变频器'], ['控制技术', '无速度传感器矢量控制'], ['图片范围', '系列官方图库；可能包含不同功率或外壳版本']],
  },
  {
    id: 'inovance-md200', brand: '汇川 Inovance', series: 'MD200', category: '变频器',
    source: 'https://www.inovance.com/global/content/details_815_403214.html',
    images: [
      { url: 'https://portal-file.inovance.com/owfile/ProdDoc/XG/01308693-XGL/B00/01308693-XGL_B00.png', label: '官方外观 1' },
      { url: 'https://portal-file.inovance.com/owfile/ProdDoc/XG/01308686-XGL/B00/01308686-XGL_B00.png', label: '官方外观 2' },
    ],
    facts: [['系列', 'MD200 紧凑型变频器'], ['系列供电版本', '单相 220 VAC / 三相 380 VAC，须按具体型号区分'],
      ['控制方式', 'V/f、无速度传感器矢量控制（SVC）'], ['图片范围', '系列官方图库；非指定订货号']],
  },
];

const directory = (id: string, brand: string, series: string, source: string): ManufacturerProduct =>
  ({ id, brand, series, category: '官方分类目录', source, images: [], resourceType: 'directory',
    facts: [['资料级别', '厂商分类目录；尚未收录具体订货型号'], ['参数状态', '未导入型号参数、引脚图或原厂 3D']] });
const abb = 'https://new.abb.com/low-voltage/products/';
const finder = 'https://www.findernet.com/en/worldwide/';
export const INDUSTRIAL_PRODUCTS: ManufacturerProduct[] = [
  ...VFD_PRODUCTS,
  {
    id: 'abb-s203-c16', brand: 'ABB', series: 'S203-C16', category: '微型断路器', resourceType: 'model',
    source: 'https://new.abb.com/products/2CDS253001R0164/s203-c16',
    images: [{ url: 'https://cdn.productimages.abb.com/9PAA00000167681_master.jpg', label: 'S203-C16 官方产品图' }],
    facts: [['订货号', '2CDS253001R0164'], ['极数与额定电流', '3P · 16 A'], ['脱扣特性', 'C'],
      ['参数范围', '以上仅属于该具体产品，不表示其他同类器件参数']],
  },
  directory('abb-mcb', 'ABB', '微型断路器', `${abb}system-pro-m/miniature-circuit-breakers`),
  directory('abb-rcd', 'ABB', '剩余电流保护器', `${abb}system-pro-m/residual-current-devices`),
  directory('abb-motor-protection', 'ABB', '电动机保护开关', `${abb}motor-protection/manual-motor-starter`),
  directory('abb-isolation', 'ABB', '开关与隔离器目录', `${abb}enclosed-switches`),
  directory('abb-fuse', 'ABB', '熔断器与熔断器底座', `${abb}fusegear/fuse-links`),
  {
    id: 'abb-af', brand: 'ABB', series: 'AF 接触器', category: '接触器',
    source: `${abb}motor-protection/3-pole-contactors-and-overload-relays-for-motor-starting`,
    images: [{ url: 'https://www07.abb.com/images/librariesprovider84/home-page/af-3-pole-contactors-family-picture_preview.jpg?sfvrsn=bfa80a14_1', label: 'AF 系列合照' }],
    facts: [['资料范围', '三极接触器系列，非某个线圈电压的指定订货号'], ['匹配状态', '未映射操作台线圈、辅助触点与额定电流']],
  },
  directory('phoenix-safety', 'Phoenix Contact 菲尼克斯', '安全继电器与传感器目录', 'https://www.phoenixcontact.com/en-us/products/safety-relay-modules-and-sensors'),
  directory('phoenix-plc', 'Phoenix Contact 菲尼克斯', 'PLC 与 I/O 目录', 'https://www.phoenixcontact.com/en-us/products/plcs-controllers-and-i-os'),
  directory('phoenix-relay', 'Phoenix Contact 菲尼克斯', '继电器与固态继电器目录', 'https://www.phoenixcontact.com/en-us/products/relays-and-optocouplers'),
  directory('phoenix-meter', 'Phoenix Contact 菲尼克斯', '能量监测目录', 'https://www.phoenixcontact.com/en-us/products/energy-monitoring'),
  directory('abb-overload', 'ABB', '接触器与过载继电器目录', `${abb}motor-protection/3-pole-contactors-and-overload-relays-for-motor-starting`),
  {
    id: 'abb-compact', brand: 'ABB', series: 'Compact 操作器', category: '按钮与指示',
    source: `${abb}pilot-devices/compact`,
    images: [{ url: 'https://www07.abb.com/images/librariesprovider84/home-page/compact_1sfc151905v0001_revb_for_web614ae4f5c1f463c09537ff0000433538.png?sfvrsn=5fbe870d_1', label: 'Compact 操作器系列' }],
    facts: [['资料范围', '操作器系列参考；按钮、选择、指示等须按具体型号区分'], ['匹配状态', '未映射触点组合、安装孔径及灯电压']],
  },
  directory('finder-relay', 'Finder 芬德', '工业继电器目录', `${finder}industrial-listing/industrial-relays-listing/`),
  directory('finder-ssr', 'Finder 芬德', '固态继电器目录', `${finder}industrial-listing/solid-state-relays-ssr-listing/`),
  directory('finder-timer', 'Finder 芬德', '时间继电器目录', `${finder}industrial-listing/timers-listing/`),
  directory('finder-spd', 'Finder 芬德', '浪涌保护器目录', `${finder}industrial-listing/surge-protection-devices-spd-listing/`),
  directory('finder-temperature', 'Finder 芬德', '工业温度控制目录', `${finder}industrial-listing/industrial-thermoregulation-listing/`),
  directory('finder-meter', 'Finder 芬德', '电能表目录', `${finder}industrial-listing/energy-meters-listing/`),
  directory('finder-controller', 'Finder 芬德', '可编程逻辑继电器目录', `${finder}industrial-listing/programmable-logic-relays/`),
  directory('finder-dimmer', 'Finder 芬德', '调光控制目录', `${finder}residential-and-commercial/lighting/dimmers/`),
  directory('finder-power', 'Finder 芬德', '工业电源目录', `${finder}industrial-listing/power-supplies-listing/`),
  {
    id: 'meanwell-hdr60', brand: '明纬 MEAN WELL', series: 'HDR-60', category: '直流电源',
    source: 'https://www.meanwell.com/webapp/product/search.aspx?prod=HDR-60', images: [],
    cadSource: 'https://www.meanwell.com/upload/pdf/HDR-60/HDR-60-3D.zip',
    facts: [['资料范围', 'HDR-60 系列；不同输出电压为不同型号'], ['CAD 状态', '官网提供 3D 压缩包；尚未转换成网页可旋转模型']],
  },
  {
    id: 'abb-pstx', brand: 'ABB', series: 'PSTX', category: '软启动器',
    source: `${abb}softstarters-new/pstx-softstarter`,
    images: [{ url: 'https://www07.abb.com/images/librariesprovider84/home-page/pstx_group.jpg?sfvrsn=6978850a_1', label: 'PSTX 系列合照' }],
    facts: [['资料范围', '软启动器系列；不等同于连续变频调速'], ['匹配状态', '未导入具体功率、接线及参数表']],
  },
  {
    id: 'patlite-lr6', brand: 'PATLITE 派特莱', series: 'LR6', category: '信号灯塔',
    source: 'https://www.patlite.com/product/detail0000000629.html',
    images: [{ url: 'https://www.patlite.com/_inc_data/product_img/EN_SG_000629.jpg', label: 'LR6 系列参考外观' }],
    facts: [['资料范围', '系列外观；灯层数、电源、声响与安装方式按具体型号核对']],
  },
  {
    id: 'patlite-bsv', brand: 'PATLITE 派特莱', series: 'BSV 语音报警器', category: '声响报警',
    source: 'https://www.patlite.com/product/detail0000001034.html',
    images: [{ url: 'https://www.patlite.com/_inc_data/product_img/EN_Img_0000069201.png', label: 'BSV 官方产品图' }],
    facts: [['器件区别', '语音报警器是声响器件参考，不等同于操作台的两端蜂鸣器']],
  },
  directory('abb-controls', 'ABB', '低压产品总目录', `${abb}`),
  {
    id: 'phoenix-terminal', brand: 'Phoenix Contact 菲尼克斯', series: '接线端子产品分类', category: '端子排',
    source: 'https://www.phoenixcontact.com/en-us/products/terminal-blocks',
    images: [{ url: 'https://caas.phoenixcontact.com/caas/v1/stable/media/1287776/1x1/b408', label: '端子产品分类参考图' }],
    facts: [['资料级别', '分类参考图，不是指定端子系列或订货号'], ['接线要求', '导线范围、桥接件、额定值与剥线长度须按具体产品核对']],
  },
];

const FAMILY_SOURCES: Partial<Record<Family, string[]>> = {
  source: ['meanwell-hdr60', 'finder-power'],
  breaker: ['abb-mcb', 'abb-rcd', 'abb-motor-protection'],
  contactor: ['abb-af'], pushbutton: ['abb-compact'], selector: ['abb-compact'],
  relay: ['finder-relay', 'phoenix-relay'], timer: ['finder-timer'],
  thermal: ['abb-overload'], fuse: ['abb-fuse'], auxiliary: ['abb-overload'],
  lamp: ['abb-compact'], tower: ['patlite-lr6'], buzzer: ['patlite-bsv'],
  thermostat: ['finder-temperature'], meter: ['finder-meter'],
  terminal: ['phoenix-terminal'],
};

export function manufacturerProductsFor(kind: Kind): ManufacturerProduct[] {
  if (kind === 'vfd') return VFD_PRODUCTS;
  const def = DEFINITIONS[kind];
  const special: Partial<Record<Kind, string[]>> = {
    breaker: ['abb-s203-c16', 'abb-mcb'],
    softStarter: ['abb-pstx'], surge1: ['finder-spd'], surge3: ['finder-spd'],
    isolator: ['abb-isolation'], motorProtectionA: ['abb-motor-protection'], motorProtectionB: ['abb-motor-protection'],
    rcd1: ['abb-rcd'], rcd2: ['abb-rcd'], rcd3: ['abb-rcd'],
    mccbBlack: ['abb-controls'], mccbWhite: ['abb-controls'],
    ssrAC: ['finder-ssr', 'phoenix-relay'], ssrDC: ['finder-ssr', 'phoenix-relay'],
    safetyRelayAC: ['phoenix-safety'], safetyRelayDC: ['phoenix-safety'],
    controller: ['finder-controller', 'phoenix-plc'], dimmer: ['finder-dimmer'],
    voltmeter: ['phoenix-meter'], ammeter: ['phoenix-meter'],
    source1: ['abb-controls'], source3: ['abb-controls'],
    bulb: [],
  };
  const ids = special[kind] ?? FAMILY_SOURCES[def.family!] ?? [];
  return INDUSTRIAL_PRODUCTS.filter((product) => ids.includes(product.id));
}

export function manufacturerSearchText(kind: Kind = 'vfd') {
  return manufacturerProductsFor(kind).map((product) => `${product.brand} ${product.series}`).join(' ');
}

export function manufacturerImagePath(product: ManufacturerProduct, index: number) {
  return `/assets/manufacturers/${product.id}-${index}.webp`;
}
