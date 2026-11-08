import type { Contact, ContactWhen, Definition, Family, InputPair, LibraryGroup, Port } from './model';

const p = (id: string, x: number, y: number, label = id): Port => ({ id, x, y, label });
const contact = (a: string, b: string, when: ContactWhen = 'always', channel?: string): Contact => ({ a, b, when, ...(channel ? { channel } : {}) });
const pair = (a: string, b: string, supply: InputPair['supply'], channel?: string): InputPair => ({ a, b, supply, ...(channel ? { channel } : {}) });
const rows = (top: string[], bottom: string[], width = 160, height = 180): Port[] => [
  ...top.map((id, i) => p(id, width * (i + 1) / (top.length + 1), 22)),
  ...bottom.map((id, i) => p(id, width * (i + 1) / (bottom.length + 1), height - 22)),
];
function device(name: string, group: LibraryGroup, category: string, family: Family, options: Partial<Definition> = {}): Definition {
  return { name, group, category, family, width: 160, height: 180, voltage: group === '直流控件' ? 24 : 220,
    prefix: 'X', ports: [], spec: '触点逻辑', capability: 'logic', ...options };
}
function wall(name: string, channels = 1, changeover = false, intermediate = false) {
  const width = channels > 1 ? 184 : 128;
  const keys = Array.from({ length: channels }, (_, i) => String(i + 1));
  const ports: Port[] = [];
  const contacts: Contact[] = [];
  keys.forEach((key, i) => {
    const x = width * (i + 1) / (channels + 1);
    ports.push(p(`L${key}`, x, 22));
    if (changeover) {
      ports.push(p(`${key}A`, x - 13, 143), p(`${key}B`, x + 13, 143));
      contacts.push(contact(`L${key}`, `${key}A`, 'off', key), contact(`L${key}`, `${key}B`, 'on', key));
    } else {
      ports.push(p(`T${key}`, x, 143));
      contacts.push(contact(`L${key}`, `T${key}`, 'on', key));
    }
  });
  if (intermediate) return device(name, '通用类', '墙壁开关', 'switch', {
    width: 184, height: 165, prefix: 'SA', operation: 'toggle', channels: ['1', '2', '3'],
    ports: ['1', '2', '3'].flatMap((key, i) => [p(`${key}A`, 28 + i * 64, 18), p(`${key}B`, 28 + i * 64, 53), p(`${key}C`, 28 + i * 64, 120), p(`${key}D`, 28 + i * 64, 155)]),
    contacts: ['1', '2', '3'].flatMap((key) => [contact(`${key}A`, `${key}C`, 'off', key), contact(`${key}B`, `${key}D`, 'off', key), contact(`${key}A`, `${key}D`, 'on', key), contact(`${key}B`, `${key}C`, 'on', key)]),
    spec: '三联中途 · 交叉换向',
  });
  return device(name, '通用类', '墙壁开关', 'switch', { width, height: 165, ports, contacts, prefix: 'SA', operation: 'toggle', channels: keys, spec: `${channels} 联 · ${changeover ? '双控' : '单控'}` });
}
function push(name: string, color: string, latching = false, illuminated = false, emergency = false): Definition {
  const ports = [p('13', 24, 20, '13 / NO'), p('14', 88, 20, '14 / NO'), p('21', 24, 148, '21 / NC'), p('22', 88, 148, '22 / NC')];
  if (illuminated) ports.push(p('X1', 6, 85), p('X2', 106, 85));
  return device(name, '通用类', '按钮与选择', 'pushbutton', {
    width: 112, height: 170, ports, prefix: 'SB', color, operation: latching ? 'toggle' : 'momentary',
    contacts: [contact('13', '14', 'on'), contact('21', '22', 'off')],
    loads: illuminated ? [pair('X1', 'X2', 'either')] : undefined,
    spec: `${emergency ? '急停蘑菇头' : illuminated ? '带灯' : '1NO + 1NC'} · ${latching ? '自锁' : '点动'}`,
  });
}
function breaker(name: string, poles: number, rcd = false, color?: string): Definition {
  const width = Math.max(100, poles * 36 + 28);
  const channels = Array.from({ length: poles }, (_, i) => [String(i * 2 + 1), String(i * 2 + 2)]);
  return device(name, '通用类', '断路与保护', 'breaker', {
    width, height: 190, voltage: poles >= 3 ? 380 : 220, prefix: 'QF', poles, color,
    ports: rows(channels.map(([a]) => a), channels.map(([, b]) => b), width, 190),
    contacts: channels.map(([a, b]) => contact(a, b, 'on')), operation: 'toggle',
    spec: `${poles}P · ${rcd ? '漏保' : '开合逻辑'}`,
    limitation: rcd ? '仅模拟手动开合，不计算漏电电流或自动脱扣。' : '仅模拟手动开合，不计算过载、短路电流或脱扣曲线。',
  });
}
function fuse(name: string, poles: number): Definition {
  const width = Math.max(104, poles * 42 + 20);
  return device(name, '通用类', '断路与保护', 'fuse', {
    width, height: 165, prefix: 'FU', poles, operation: 'trip',
    ports: rows(Array.from({ length: poles }, (_, i) => `${i + 1}A`), Array.from({ length: poles }, (_, i) => `${i + 1}B`), width, 165),
    contacts: Array.from({ length: poles }, (_, i) => contact(`${i + 1}A`, `${i + 1}B`, 'off')),
    spec: `${poles}P · 手动故障注入`, limitation: '仅模拟手动熔断与复位，不计算熔断电流或时间。',
  });
}
function drySwitch(name: string, momentary = false, latched = false): Definition {
  return device(name, '通用类', '检测与传感', 'sensor', {
    prefix: 'SQ', width: 132, height: 170, operation: momentary ? 'momentary' : 'toggle',
    ports: rows(['11'], ['12', '14'], 132, 170),
    contacts: [contact('11', '12', 'off'), contact('11', '14', 'on')],
    spec: `${latched ? '自锁' : momentary ? '自复位' : '手动触发'} · 1NO + 1NC`,
  });
}
function terminals(vertical = false): Definition {
  const width = vertical ? 92 : 250;
  const height = vertical ? 270 : 100;
  return device(`端子排${vertical ? '竖' : '横'}`, '通用类', '接线与配电', 'terminal', {
    prefix: 'XT', width, height, spec: '4 组直通端子',
    ports: Array.from({ length: 4 }, (_, i) => vertical ?
      [p(`${i + 1}A`, 20, 34 + i * 66), p(`${i + 1}B`, 72, 34 + i * 66)] :
      [p(`${i + 1}A`, 32 + i * 62, 20), p(`${i + 1}B`, 32 + i * 62, 80)]).flat(),
    contacts: Array.from({ length: 4 }, (_, i) => contact(`${i + 1}A`, `${i + 1}B`)),
  });
}
function socket(switched = false): Definition {
  return device(`墙壁插座${switched ? '带开关' : ''}`, '通用类', '接线与配电', 'socket', {
    prefix: 'XS', width: 158, height: 170, operation: switched ? 'toggle' : undefined,
    ports: rows(['L', 'N', 'PE'], ['Lout', 'Nout', 'PEout'], 158, 170),
    contacts: [contact('L', 'Lout', switched ? 'on' : 'always'), contact('N', 'Nout'), contact('PE', 'PEout')],
    spec: `AC 220 V · ${switched ? '带开关' : '直通'}`,
  });
}
function selector(name: string): Definition {
  return device(name, '通用类', '按钮与选择', 'selector', {
    prefix: 'SA', width: 142, height: 165, operation: 'selector', spec: '0 / I / II · 三位置',
    ports: rows(['C'], ['1', '2'], 142, 165), contacts: [contact('C', '1', 'position1'), contact('C', '2', 'position2')],
  });
}
function contactor(name: string, supply: 'ac' | 'dc' = 'ac', voltage = supply === 'dc' ? 24 : 220, auxiliary: 'both' | 'no' | 'nc' = 'both'): Definition {
  const no = auxiliary !== 'nc';
  const nc = auxiliary !== 'no';
  return device(name, supply === 'dc' ? '直流控件' : '交流控件', '接触器与继电器', 'contactor', {
    prefix: 'KM', width: 204, height: 252, voltage, operation: 'momentary', image: '/assets/contactor.webp',
    ports: [p('A1', 34, 12), p('A2', 121, 12), p('1', 32, 66), p('3', 75, 66), p('5', 118, 66),
      p('2', 32, 216), p('4', 75, 216), p('6', 118, 216),
      ...(no ? [p('13', 181, 60, '13 / NO'), p('14', 181, 106, '14 / NO')] : []),
      ...(nc ? [p('21', 181, 158, '21 / NC'), p('22', 181, 204, '22 / NC')] : [])],
    coil: pair('A1', 'A2', supply), contacts: [
      contact('1', '2', 'coilOn'), contact('3', '4', 'coilOn'), contact('5', '6', 'coilOn'),
      ...(no ? [contact('13', '14', 'coilOn')] : []),
      ...(nc ? [contact('21', '22', 'coilOff')] : []),
    ],
    spec: `${supply.toUpperCase()} ${voltage} V · 3P${no ? ' + 1NO' : ''}${nc ? ' + 1NC' : ''}`,
  });
}
function relay(name: string, pins: 8 | 14, dc = false): Definition {
  const contacts = pins === 8 ?
    [contact('1', '3', 'coilOff'), contact('1', '4', 'coilOn'), contact('8', '6', 'coilOff'), contact('8', '5', 'coilOn')] :
    Array.from({ length: 4 }, (_, i) => [contact(String(i + 9), String(i + 1), 'coilOff'), contact(String(i + 9), String(i + 5), 'coilOn')]).flat();
  const ids = Array.from({ length: pins }, (_, i) => String(i + 1));
  return device(name, dc ? '直流控件' : '交流控件', '接触器与继电器', 'relay', {
    prefix: 'KA', width: pins === 14 ? 218 : 164, height: 190, spec: `${pins} 脚 · ${pins === 8 ? '2' : '4'} 组转换触点 · ${dc ? 'DC 24' : 'AC 220'} V`,
    ports: rows(ids.slice(0, pins / 2), ids.slice(pins / 2), pins === 14 ? 218 : 164, 190),
    coil: pair(pins === 8 ? '2' : '13', pins === 8 ? '7' : '14', dc ? 'dc' : 'ac'), contacts,
    limitation: '采用本软件定义的通用端子映射，不代表具体厂家型号的实物接线。',
  });
}
function timer(name: string, dc = false): Definition {
  return device(name, dc ? '直流控件' : '交流控件', '接触器与继电器', 'timer', {
    prefix: 'KT', width: 165, height: 195, spec: `${dc ? 'DC 24' : 'AC 220'} V · 通电延时`,
    ports: rows(['A1', 'A2'], ['15', '16', '18'], 165, 195), coil: pair('A1', 'A2', dc ? 'dc' : 'ac'),
    contacts: [contact('15', '16', 'timedOff'), contact('15', '18', 'timedOn')],
  });
}
function lamp(name: string, color: string, dc = false, bulb = false): Definition {
  return device(name, dc ? '直流控件' : '交流控件', '灯光与声响', 'lamp', {
    prefix: 'HL', width: bulb ? 116 : 100, height: bulb ? 155 : 136, color,
    ports: rows(['X1', 'X2'], [], bulb ? 116 : 100, bulb ? 155 : 136),
    loads: [pair('X1', 'X2', dc ? 'dc' : 'ac')], spec: `${dc ? 'DC 24' : 'AC 220'} V · ${bulb ? '灯泡' : '指示灯'}`,
  });
}
function tower(dc = false): Definition {
  return device('三色灯', dc ? '直流控件' : '交流控件', '灯光与声响', 'tower', {
    prefix: 'HL', width: 126, height: 240, ports: rows(['COM'], ['R', 'Y', 'G'], 126, 240),
    loads: [pair('R', 'COM', dc ? 'dc' : 'ac', 'red'), pair('Y', 'COM', dc ? 'dc' : 'ac', 'yellow'), pair('G', 'COM', dc ? 'dc' : 'ac', 'green')],
    spec: `${dc ? 'DC 24' : 'AC 220'} V · 红 / 黄 / 绿`,
  });
}
function load(name: string, family: Family, dc = false, voltage = dc ? 24 : 220): Definition {
  return device(name, dc ? '直流控件' : '交流控件', family === 'buzzer' ? '灯光与声响' : '电机与执行', family, {
    prefix: family === 'buzzer' ? 'HA' : family === 'heater' ? 'EH' : family === 'motor' ? 'M' : 'YV',
    width: family === 'motor' ? 210 : 150, height: family === 'motor' ? 205 : 170, voltage,
    ports: rows(['A1', 'A2'], family === 'motor' ? ['PE'] : [], family === 'motor' ? 210 : 150, family === 'motor' ? 205 : 170),
    loads: [pair('A1', 'A2', dc ? 'dc' : 'ac')], spec: `${dc ? 'DC' : 'AC'} ${voltage} V · 通电状态`,
    limitation: family === 'buzzer' ? '仅显示通电状态，不输出音频。' : family === 'heater' ? '不计算热功率或温升。' : family === 'cylinder' ? '仅模拟伸缩状态，不计算气压、速度或机械负载。' : family === 'motor' ? '仅模拟通断状态，不计算启动绕组或机械负载。' : undefined,
    ...(family === 'motor' ? { image: '/assets/motor.webp' } : {}),
  });
}
function sensor(name: string, dc = false, npn = false, normallyClosed = false): Definition {
  if (!dc) return device(name, '交流控件', '检测与传感', 'sensor', {
    prefix: 'SQ', width: 135, height: 165, operation: 'toggle', follow: 'target',
    ports: rows(['1'], ['2'], 135, 165), contacts: [contact('1', '2', normallyClosed ? 'off' : 'on')],
    spec: `${normallyClosed ? 'NC' : 'NO'} · 干接点等效`, limitation: '采用手动触发的干接点等效模型，不计算检测距离或漏电流。',
  });
  return device(name, '直流控件', '检测与传感', 'sensor', {
    prefix: 'SQ', width: 145, height: 175, operation: 'toggle', follow: 'target',
    ports: rows(['V+', '0V'], ['OUT'], 145, 175), coil: pair('V+', '0V', 'dc'),
    contacts: [contact(npn ? '0V' : 'V+', 'OUT', normallyClosed ? 'poweredOff' : 'poweredOn')],
    spec: `DC 24 V · ${npn ? 'NPN 下拉' : 'PNP 上拉'}`,
    limitation: '仅模拟供电与晶体管开关状态，不计算检测距离、响应时间或输出电流。',
  });
}
function wiringOnly(name: string, family: Family, ports: Port[], dc = false, options: Partial<Definition> = {}): Definition {
  return device(name, dc ? '直流控件' : '交流控件', family === 'meter' || family === 'transformer' || family === 'potentiometer' ? '测量与调节' : '电机与执行', family, {
    prefix: family === 'meter' ? 'P' : family === 'transformer' ? 'T' : family === 'controller' ? 'PLC' : 'U',
    ports, capability: 'wiring', spec: '端子模型 · 仅接线',
    limitation: '当前仅支持放置、参数与端子接线，不模拟内部控制或模拟量计算。',
    ...options,
  });
}

export const EXTRA_DEFINITIONS = {
  dcSupplyA: device('直流电源 A', '电源类', '电源', 'source', {
    supply: 'dc', prefix: 'DC', width: 170, height: 108, voltage: 24, spec: 'DC 24 V · 双组输出',
    ports: [p('+', 28, 80), p('-', 66, 80), p('+2', 104, 80), p('-2', 142, 80)],
    contacts: [contact('+', '+2'), contact('-', '-2')],
  }),
  wallSingle: wall('墙壁开关 · 单开双控', 1, true),
  wallDouble: wall('墙壁开关 · 双开多控', 2, true),
  wallMulti: wall('墙壁开关 · 多控双联', 2),
  wallIntermediate: wall('墙壁开关 · 三开中继', 3, false, true),
  latchWhite: push('自锁按钮 · 白色', '#e1e4dd', true),
  latchYellow: push('自锁按钮 · 黄色', '#d6ae3b', true),
  latchRed: push('自锁按钮 · 红色', '#c85b52', true),
  latchGreen: push('自锁按钮 · 绿色', '#278566', true),
  emergency: push('急停按钮', '#c8463e', true, false, true),
  emergencyA: push('急停按钮 A', '#cf4e42', true, false, true),
  selector: selector('选择开关'),
  selectorA: selector('选择开关 A'),
  breaker1: breaker('空气开关 1P', 1),
  breaker2: breaker('空气开关 2P', 2),
  breaker4: breaker('空气开关 4P', 4),
  rcd1: { ...breaker('漏电保护器 1P+N', 2, true), spec: '1P+N · 手动开合' },
  rcd2: breaker('漏电保护器 2P', 2, true),
  rcd3: breaker('漏电保护器 3P', 3, true),
  mccbBlack: breaker('塑壳断路器 · 黑色', 3, false, '#374247'),
  mccbWhite: breaker('塑壳断路器 · 白色', 3, false, '#eceee8'),
  fuse1: fuse('保险 1P', 1),
  fuse2: fuse('保险 2P', 2),
  fuse3: fuse('保险 3P', 3),
  limitLatch: drySwitch('限位开关 · 自锁', false, true),
  limitMomentary: drySwitch('限位开关 · 自复位', true),
  pressureSwitch: drySwitch('水压力开关'),
  floatSwitch: drySwitch('浮球开关'),
  terminalHorizontal: terminals(),
  terminalVertical: terminals(true),
  socketSwitch: socket(true),
  socket: socket(),
  illuminatedLatchGreen: push('绿色自锁按钮 · 带灯', '#278566', true, true),
  illuminatedLatchRed: push('红色自锁按钮 · 带灯', '#c85b52', true, true),
  illuminatedMomentaryGreen: push('绿色点动按钮 · 带灯', '#278566', false, true),
  illuminatedMomentaryRed: push('红色点动按钮 · 带灯', '#c85b52', false, true),
  motorProtectionA: breaker('电机保护开关 A', 3),
  motorProtectionB: breaker('电机保护开关 B', 3, false, '#434b43'),
  isolator: breaker('隔离开关', 3),
  camSwitch: selector('万能转换开关'),
  dimmer: device('调光开关', '通用类', '墙壁开关', 'potentiometer', {
    prefix: 'SA', width: 132, height: 160, ports: rows(['L'], ['OUT'], 132, 160),
    contacts: [contact('L', 'OUT', 'level')], unit: '%', spec: '0–100% · 通断等效',
    limitation: '只模拟零位断开与非零位接通，不计算调光波形或灯光亮度。',
  }),
  surge1: wiringOnly('浪涌保护开关 1P', 'breaker', rows(['L', 'N'], ['PE']), false, { group: '通用类', category: '断路与保护', prefix: 'SPD', limitation: '仅接线模型，不模拟浪涌钳位或放电过程。' }),
  surge3: wiringOnly('浪涌保护开关 3P', 'breaker', rows(['L1', 'L2', 'L3', 'N'], ['PE']), false, { group: '通用类', category: '断路与保护', prefix: 'SPD', limitation: '仅接线模型，不模拟浪涌钳位或放电过程。' }),
  bulb: lamp('灯泡', '#deb45a', false, true),
  towerAC: tower(),
  relay8AC: relay('继电器 · 8 脚', 8),
  relay14AC: relay('继电器 · 14 脚', 14),
  contactorB: contactor('接触器 B'),
  contactor380: contactor('接触器 · 380 V', 'ac', 380),
  contactor24AC: contactor('交流接触器 · 24 V', 'ac', 24),
  contactor36AC: contactor('交流接触器 · 36 V', 'ac', 36),
  contactor110AC: contactor('交流接触器 · 110 V', 'ac', 110),
  contactor220NO: contactor('交流接触器 · 220 V · 辅助 1NO', 'ac', 220, 'no'),
  contactor380NO: contactor('交流接触器 · 380 V · 辅助 1NO', 'ac', 380, 'no'),
  contactor220NC: contactor('交流接触器 · 220 V · 辅助 1NC', 'ac', 220, 'nc'),
  contactor380NC: contactor('交流接触器 · 380 V · 辅助 1NC', 'ac', 380, 'nc'),
  intermediateRelay: relay('中间继电器', 8),
  timerAC: timer('时间继电器'),
  safetyRelayAC: wiringOnly('安全继电器', 'relay', rows(['A1', 'A2', 'S11', 'S12', 'S21', 'S22'], ['13', '14', '23', '24', 'S33', 'S34'], 228, 195), false, { width: 228, height: 195, prefix: 'KS', category: '接触器与继电器', limitation: '仅端子模型，不执行安全逻辑、诊断或安全等级验证。' }),
  lampYellowAC: lamp('指示灯 · 黄色', '#d8ac37'),
  lampRedAC: lamp('指示灯 · 红色', '#ce5a52'),
  buzzerAC: load('蜂鸣器', 'buzzer'),
  levelSwitchAC: sensor('料位开关'),
  valveAC: load('水阀', 'valve'),
  ssrAC: device('固态继电器', '交流控件', '接触器与继电器', 'relay', {
    prefix: 'SSR', voltage: 24, ports: rows(['A1', 'A2'], ['1', '2']),
    coil: pair('A1', 'A2', 'dc'), contacts: [contact('1', '2', 'coilOn')],
    spec: 'DC 24 V 输入 · AC 输出等效', limitation: '仅模拟隔离开关状态，不计算过零、漏电流或压降。',
  }),
  voltmeter: device('电压表', '交流控件', '测量与调节', 'meter', {
    prefix: 'PV', width: 150, height: 160, ports: rows(['V+', 'V-'], [], 150, 160), unit: 'V', spec: '理想电压测量 · AC / DC',
  }),
  ammeter: wiringOnly('电流表', 'meter', rows(['I+'], ['I-'], 150, 160), false, {
    width: 150, height: 160, prefix: 'PA', unit: 'A', contacts: [contact('I+', 'I-')], limitation: '可串联接线；当前不求解电流，读数显示为 —。',
  }),
  currentTransformer: wiringOnly('电流互感器', 'transformer', rows(['P1', 'P2'], ['S1', 'S2']), false, { prefix: 'TA', contacts: [contact('P1', 'P2')], limitation: '仅端子与一次侧通路，不计算变比或二次侧电流。' }),
  motorSingle: load('单相电机', 'motor'),
  thermalRelay: device('热继电器', '交流控件', '断路与保护', 'thermal', {
    prefix: 'FR', width: 210, height: 205, operation: 'trip', poles: 3,
    ports: rows(['1', '3', '5', '95', '97'], ['2', '4', '6', '96', '98'], 210, 205),
    contacts: [contact('1', '2'), contact('3', '4'), contact('5', '6'), contact('95', '96', 'off'), contact('97', '98', 'on')],
    spec: '3P + 95/96 NC · 97/98 NO', limitation: '采用手动跳闸与复位，仅切换辅助触点；不计算过载或热积累。',
  }),
  heater220: load('加热管 · 220 V', 'heater'),
  heater380: load('加热管 · 380 V', 'heater', false, 380),
  thermostat: device('温控器', '交流控件', '测量与调节', 'thermostat', {
    prefix: 'TC', width: 180, height: 170, ports: rows(['L', 'N'], ['COM', 'NO'], 180, 170),
    coil: pair('L', 'N', 'ac'), contacts: [contact('COM', 'NO', 'temperature')],
    spec: 'AC 220 V · 加热控制', unit: '°C', limitation: '温度由用户设定，不模拟热传导或传感器故障。',
  }),
  transformer: wiringOnly('变压器', 'transformer', rows(['1U', '1N'], ['2U', '2N', 'PE']), false, { prefix: 'T', limitation: '仅端子模型，不生成二次电压或计算功率。' }),
  potentiometer: wiringOnly('电位器', 'potentiometer', rows(['1', '2', '3'], []), false, { prefix: 'RP', unit: '%', limitation: '可调滑臂参数与接线；不计算电阻或模拟电压。' }),
  timerElectronic: timer('时间继电器 · 电子型'),
  proximityNOAC: sensor('接近开关 · NO'),
  proximityNCAC: sensor('接近开关 · NC', false, false, true),
  photoNOAC: sensor('光电开关 · NO'),
  photoNCAC: sensor('光电开关 · NC', false, false, true),
  energySingle: wiringOnly('电能表 · 单相', 'meter', rows(['L-in', 'N-in'], ['L-out', 'N-out']), false, { prefix: 'PWh', unit: 'kWh', contacts: [contact('L-in', 'L-out'), contact('N-in', 'N-out')], limitation: '仅直通接线，不计算功率、电流或累计电能。' }),
  energyThree: wiringOnly('电能表 · 三相', 'meter', rows(['L1-in', 'L2-in', 'L3-in', 'N-in'], ['L1-out', 'L2-out', 'L3-out', 'N-out'], 230, 180), false, {
    prefix: 'PWh', width: 230, unit: 'kWh', contacts: ['L1', 'L2', 'L3', 'N'].map((id) => contact(`${id}-in`, `${id}-out`)), limitation: '仅直通接线，不计算功率、电流或累计电能。',
  }),
  auxiliary: device('辅助触点', '交流控件', '接触器与继电器', 'auxiliary', {
    prefix: 'KA', width: 122, height: 170, follow: 'coil', ports: rows(['13', '21'], ['14', '22'], 122, 170),
    contacts: [contact('13', '14', 'coilOn'), contact('21', '22', 'coilOff')], spec: '1NO + 1NC · 关联线圈',
  }),
  softStarter: wiringOnly('软启动器', 'drive', rows(['L1', 'L2', 'L3', 'A1', 'A2'], ['T1', 'T2', 'T3', 'RUN', 'COM'], 230, 245), false, { width: 230, height: 245, prefix: 'SS', category: '电机与执行', limitation: '仅端子模型，不模拟软启动、旁路或电压斜坡。' }),
  vfd: wiringOnly('变频器', 'drive', rows(['R', 'S', 'T', 'PE'], ['U', 'V', 'W', 'DI1', 'COM', 'AI', '10V'], 240, 260), false, { width: 240, height: 260, prefix: 'VFD', category: '电机与执行', limitation: '仅端子模型，不生成变频电源，不执行参数、调速或制动控制。' }),
  contactorDC: contactor('直流接触器', 'dc'),
  contactor48DC: contactor('直流接触器 · 48 V', 'dc', 48),
  contactor110DC: contactor('直流接触器 · 110 V', 'dc', 110),
  contactor220DC: contactor('直流接触器 · 220 V', 'dc', 220),
  relay8DC: relay('继电器 · 8 脚', 8, true),
  relay14DC: relay('继电器 · 14 脚', 14, true),
  ssrDC: device('固态继电器', '直流控件', '接触器与继电器', 'relay', {
    prefix: 'SSR', ports: rows(['A1', 'A2'], ['1', '2']), coil: pair('A1', 'A2', 'dc'),
    contacts: [contact('1', '2', 'coilOn')], spec: 'DC 24 V 输入 · 理想开关', limitation: '采用双向理想开关等效，不计算晶体管方向、压降或输出电流。',
  }),
  levelSwitchDC: sensor('料位开关', true),
  valveDC: load('电磁阀', 'valve', true),
  towerDC: tower(true),
  lampYellowDC: lamp('指示灯 · 黄色', '#d8ac37', true),
  lampGreenDC: lamp('指示灯 · 绿色', '#46a26a', true),
  lampRedDC: lamp('指示灯 · 红色', '#ce5a52', true),
  buzzerDC: load('蜂鸣器', 'buzzer', true),
  timerDC: timer('时间继电器', true),
  safetyRelayDC: wiringOnly('安全继电器', 'relay', rows(['A1', 'A2', 'S11', 'S12', 'S21', 'S22'], ['13', '14', '23', '24', 'S33', 'S34'], 228, 195), true, { width: 228, height: 195, prefix: 'KS', category: '接触器与继电器', limitation: '仅端子模型，不执行安全逻辑、诊断或安全等级验证。' }),
  photoPNP: sensor('光电开关 · PNP', true),
  photoNPN: sensor('光电开关 · NPN', true, true),
  proximityPNP: sensor('接近开关 · PNP', true),
  proximityNPN: sensor('接近开关 · NPN', true, true),
  target: device('测试物料', '直流控件', '检测与传感', 'target', {
    prefix: 'OBJ', width: 120, height: 130, operation: 'toggle', spec: '到位 / 离开 · 关联传感器',
  }),
  controller: wiringOnly('PC / 控制器', 'controller', rows(['L+', 'M', 'I0', 'I1', 'I2', 'I3'], ['COM', 'Q0', 'Q1', 'Q2', 'Q3'], 250, 220), true, {
    width: 250, height: 220, prefix: 'PLC', category: '控制与安全', limitation: '仅 I/O 接线模型，无 PLC 指令、程序执行、通信或 PC 仿真。',
  }),
  lightCurtain: device('安全光栅', '直流控件', '控制与安全', 'sensor', {
    prefix: 'BWS', width: 180, height: 240, ports: rows(['V+', '0V'], ['OSSD1', 'OSSD2'], 180, 240),
    coil: pair('V+', '0V', 'dc'), contacts: [contact('V+', 'OSSD1', 'poweredOff'), contact('V+', 'OSSD2', 'poweredOff')],
    operation: 'toggle', spec: 'DC 24 V · 遮挡状态', limitation: '仅模拟遮挡时双输出断开，不模拟自检、短路诊断或安全等级。',
  }),
  inductiveSafety: sensor('安全磁感应开关', true),
  pneumaticSafety: drySwitch('气缸磁感应开关'),
  cylinder: load('微型气缸', 'cylinder', true),
} satisfies Record<string, Definition>;

EXTRA_DEFINITIONS.pneumaticSafety.group = '直流控件';
