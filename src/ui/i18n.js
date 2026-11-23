/**
 * Wirebench Internationalization (EN / TR) - Luminous Atelier Edition
 * Radically minimal, warm, friendly, natural copy in English and Turkish.
 */

const STORAGE_KEY = 'wirebench.lang.v5';
const LEGACY_KEY = 'wirebench.lang.v4';

export const TRANSLATIONS = {
  en: {
    // Welcome Storybook Cover
    'welcome.headline': 'Wirebench',
    'welcome.tagline': 'Warm, living circuits you can touch and understand.',
    'welcome.learn.title': 'Learn',
    'welcome.learn.desc': 'Six playful hands-on circuit stories.',
    'welcome.learn.meta': '6 Chapters',
    'welcome.studio.title': 'Studio',
    'welcome.studio.desc': 'Freeform 24-part workbench & scope.',
    'welcome.studio.meta': '24 Parts · SPICE',
    'welcome.resume': 'Saved',

    // Top Strip & Modes
    'mode.learn': 'Learn',
    'mode.studio': 'Studio',
    'top.parts': 'Parts',
    'top.instruments': 'Scope',
    'top.presets': 'Circuits',
    'top.circuits': 'Circuits',
    'top.file': 'File',
    'top.settings': 'Settings',
    'top.newTab': 'New blank circuit',
    'top.closeTab': 'Close tab',
    'top.play': 'Run / Pause (Space)',
    'top.step': 'Step forward',
    'top.reset': 'Reset time',
    'top.speed': 'Time pace',
    'top.speedTitle': 'Time Pace',
    'top.view': 'Display options',
    'top.theme': 'Daylight / Starlight',
    'top.help': 'Shortcuts (?)',
    'top.home': 'Back to cover',
    'top.cmd': 'Quick search (Ctrl+K)',

    // Settings Popover
    'settings.title': 'Atelier',
    'settings.language': 'Language',
    'settings.theme': 'Atmosphere',
    'settings.daylight': 'Daylight',
    'settings.starlight': 'Starlight',
    'settings.style': 'Component Style',
    'settings.illustrated': 'Illustrated',
    'settings.schematic': 'Schematic',
    'settings.shortcuts': 'Shortcuts',

    // Studio Tool Pill
    'tool.select': 'Select',
    'tool.wire': 'Wire',
    'tool.probe': 'Probe',
    'tool.cut': 'Erase',
    'tool.undo': 'Undo',
    'tool.redo': 'Redo',
    'tool.fit': 'Center view',

    // Airy Parts Tray
    'parts.search': 'Find a part…',
    'parts.cat.all': 'All',
    'parts.cat.sources': 'Power',
    'parts.cat.passive': 'Passive',
    'parts.cat.semi': 'Active',
    'parts.cat.switch': 'Switch',
    'parts.cat.logic': 'Logic',
    'parts.cat.measure': 'Meters',
    'parts.tip': 'Click or drag · R to turn',

    // Paper Inspector
    'insp.voltage': 'V',
    'insp.current': 'I',
    'insp.power': 'P',
    'insp.node': 'Wire Net',
    'insp.nodePotential': 'Potential',
    'insp.nodeAttach': 'Attach Scope Probe',
    'insp.rotate': 'Turn (R)',
    'insp.flip': 'Mirror (F)',
    'insp.duplicate': 'Duplicate (Ctrl+D)',
    'insp.delete': 'Remove (Del)',
    'insp.on': 'ON',
    'insp.off': 'OFF',

    // Instrument Shelf
    'inst.scope': 'Scope',
    'inst.bode': 'Bode',
    'inst.nodes': 'Nodes',
    'inst.spice': 'SPICE',
    'inst.auto': 'Auto',
    'inst.sweep': 'Sweep',
    'inst.copy': 'Copy',
    'inst.copied': 'Copied',
    'inst.collapse': 'Close shelf',
    'inst.noProbes': 'Drop a Probe (P) on any wire to watch its wave.',

    // File & Display Menus
    'menu.saveJson': 'Save Circuit (.json)',
    'menu.openJson': 'Open Circuit (.json)',
    'menu.exportSvg': 'Save Image (.svg)',
    'menu.exportSpice': 'Export SPICE (.cir)',
    'menu.exportCsv': 'Export Data (.csv)',
    'menu.clearCanvas': 'Clear Workbench',
    'menu.currentFlow': 'Current Sparks',
    'menu.voltageHeat': 'Voltage Colors',
    'menu.grid': 'Guide Dots',
    'menu.audio': 'Audio CH1',

    // Circuits & Tabs Popover
    'preset.openTabs': 'Open Tabs',
    'preset.blank': 'New Blank Circuit',
    'preset.cat.analog': 'Analog & Glow',
    'preset.cat.power': 'Power & Filters',
    'preset.cat.digital': 'Logic & Switches',
    'preset.openTip': 'Opens in a fresh tab',
    'preset.sub.Oscillators': 'Oscillators',
    'preset.sub.Amplifiers': 'Amplifiers',
    'preset.sub.Filters & Audio': 'Filters & Audio',
    'preset.sub.Power': 'Power',
    'preset.sub.Nonlinear': 'Nonlinear',
    'preset.sub.Digital & MOSFET': 'Digital & MOSFET',
    'preset.sub.Logic': 'Logic',

    // Learn Mode Ribbon
    'learn.hint': 'Hint',
    'learn.fx': 'fx',
    'learn.formula': 'Live Equation',
    'learn.nextStep': 'Continue',
    'learn.nextLab': 'Next Chapter',
    'learn.finishAll': 'Open Studio',
    'learn.resetLab': 'Reset',
    'learn.openStudio': 'Studio',
    'learn.target': 'Sweet spot',

    // Command Palette & Shortcuts
    'cmd.placeholder': 'Search a part, circuit, or chapter…',
    'cmd.empty': 'Nothing found.',
    'help.title': 'Atelier Shortcuts',
    'help.tools': 'Tools',
    'help.edit': 'Craft & Sim',

    // Toasts
    'status.copiedToStudio': 'Opened a copy in Studio',
    'status.studioRestored': 'Your Studio bench is right where you left it',
  },

  tr: {
    // Welcome Storybook Cover
    'welcome.headline': 'Wirebench',
    'welcome.tagline': 'Dokunup hissedebileceğin canlı, sıcak devreler.',
    'welcome.learn.title': 'Öğren',
    'welcome.learn.desc': 'Altı etkileşimli görsel devre hikayesi.',
    'welcome.learn.meta': '6 Bölüm',
    'welcome.studio.title': 'Studio',
    'welcome.studio.desc': '24 parçalı serbest atölye ve osiloskop.',
    'welcome.studio.meta': '24 Parça · SPICE',
    'welcome.resume': 'Kayıtlı',

    // Top Strip & Modes
    'mode.learn': 'Öğren',
    'mode.studio': 'Studio',
    'top.parts': 'Parçalar',
    'top.instruments': 'Osiloskop',
    'top.presets': 'Devreler',
    'top.circuits': 'Devreler',
    'top.file': 'Dosya',
    'top.settings': 'Ayarlar',
    'top.newTab': 'Yeni boş devre',
    'top.closeTab': 'Sekmeyi kapat',
    'top.play': 'Başlat / Duraklat (Boşluk)',
    'top.step': 'Bir adım ilerle',
    'top.reset': 'Zamanı sıfırla',
    'top.speed': 'Zaman hızı',
    'top.speedTitle': 'Zaman Hızı',
    'top.view': 'Görünüm seçenekleri',
    'top.theme': 'Gün Işığı / Yıldız Işığı',
    'top.help': 'Kısayollar (?)',
    'top.home': 'Kapak sayfasına dön',
    'top.cmd': 'Hızlı arama (Ctrl+K)',

    // Settings Popover
    'settings.title': 'Atölye',
    'settings.language': 'Dil',
    'settings.theme': 'Atmosfer',
    'settings.daylight': 'Gün Işığı',
    'settings.starlight': 'Yıldız Işığı',
    'settings.style': 'Çizim Stili',
    'settings.illustrated': 'İllüstrasyon',
    'settings.schematic': 'Şematik',
    'settings.shortcuts': 'Kısayollar',

    // Studio Tool Pill
    'tool.select': 'Seç',
    'tool.wire': 'Kablo',
    'tool.probe': 'Prob',
    'tool.cut': 'Sil',
    'tool.undo': 'Geri Al',
    'tool.redo': 'İleri Al',
    'tool.fit': 'Ortala',

    // Airy Parts Tray
    'parts.search': 'Parça bul…',
    'parts.cat.all': 'Tümü',
    'parts.cat.sources': 'Güç',
    'parts.cat.passive': 'Pasif',
    'parts.cat.semi': 'Aktif',
    'parts.cat.switch': 'Anahtar',
    'parts.cat.logic': 'Mantık',
    'parts.cat.measure': 'Ölçüm',
    'parts.tip': 'Tıkla veya sürükle · R döndür',

    // Paper Inspector
    'insp.voltage': 'V',
    'insp.current': 'I',
    'insp.power': 'P',
    'insp.node': 'Kablo Düğümü',
    'insp.nodePotential': 'Potansiyel',
    'insp.nodeAttach': 'Osiloskop Probu Ekle',
    'insp.rotate': 'Döndür (R)',
    'insp.flip': 'Aynala (F)',
    'insp.duplicate': 'Çoğalt (Ctrl+D)',
    'insp.delete': 'Kaldır (Del)',
    'insp.on': 'KAPALI',
    'insp.off': 'AÇIK',

    // Instrument Shelf
    'inst.scope': 'Osiloskop',
    'inst.bode': 'Bode',
    'inst.nodes': 'Düğümler',
    'inst.spice': 'SPICE',
    'inst.auto': 'Oto',
    'inst.sweep': 'Tara',
    'inst.copy': 'Kopyala',
    'inst.copied': 'Kopyalandı',
    'inst.collapse': 'Rafı kapat',
    'inst.noProbes': 'Dalga biçimini izlemek için kabloya Prob (P) ekle.',

    // File & Display Menus
    'menu.saveJson': 'Devreyi Kaydet (.json)',
    'menu.openJson': 'Devre Aç (.json)',
    'menu.exportSvg': 'Görsel İndir (.svg)',
    'menu.exportSpice': 'SPICE İndir (.cir)',
    'menu.exportCsv': 'Veri İndir (.csv)',
    'menu.clearCanvas': 'Tezgahı Temizle',
    'menu.currentFlow': 'Akım Kıvılcımları',
    'menu.voltageHeat': 'Gerilim Renkleri',
    'menu.grid': 'Kılavuz Noktaları',
    'menu.audio': 'Ses CH1',

    // Circuits & Tabs Popover
    'preset.openTabs': 'Açık Sekmeler',
    'preset.blank': 'Yeni Boş Devre',
    'preset.cat.analog': 'Analog & Osilatör',
    'preset.cat.power': 'Güç & Filtreler',
    'preset.cat.digital': 'Mantık & Anahtar',
    'preset.openTip': 'Yeni sekmede açılır',
    'preset.sub.Oscillators': 'Osilatör',
    'preset.sub.Amplifiers': 'Yükselteç',
    'preset.sub.Filters & Audio': 'Filtre & Ses',
    'preset.sub.Power': 'Güç',
    'preset.sub.Nonlinear': 'Nonlineer',
    'preset.sub.Digital & MOSFET': 'Dijital & MOSFET',
    'preset.sub.Logic': 'Mantık',

    // Learn Mode Ribbon
    'learn.hint': 'İpucu',
    'learn.fx': 'fx',
    'learn.formula': 'Canlı Denklem',
    'learn.nextStep': 'Devam Et',
    'learn.nextLab': 'Sonraki Bölüm',
    'learn.finishAll': 'Studio’ya Geç',
    'learn.resetLab': 'Sıfırla',
    'learn.openStudio': 'Studio',
    'learn.target': 'Hedef aralık',

    // Command Palette & Shortcuts
    'cmd.placeholder': 'Parça, devre veya bölüm ara…',
    'cmd.empty': 'Eşleşme bulunamadı.',
    'help.title': 'Atölye Kısayolları',
    'help.tools': 'Araçlar',
    'help.edit': 'Düzen & Simülasyon',

    // Toasts
    'status.copiedToStudio': 'Studio sekmesinde kopya açıldı',
    'status.studioRestored': 'Studio tezgahın bıraktığın gibi hazır',
  },
};

export const COMPONENT_LABELS = {
  en: {
    ground: 'Ground',
    voltage_source: 'Battery / V',
    current_source: 'Current',
    logic_in: 'Tile 0/1',
    resistor: 'Resistor',
    potentiometer: 'Dial Pot',
    capacitor: 'Capacitor',
    inductor: 'Coil',
    transformer: 'Xfmr',
    diode: 'Diode',
    led: 'LED Bulb',
    npn: 'NPN',
    pnp: 'PNP',
    nmos: 'N-MOS',
    pmos: 'P-MOS',
    opamp: 'Op-Amp',
    switch: 'Switch',
    spdt: '2-Way Sw',
    pushbutton: 'Button',
    gate_and: 'AND',
    gate_or: 'OR',
    gate_not: 'NOT',
    gate_nand: 'NAND',
    gate_xor: 'XOR',
    voltmeter: 'Volt Dial',
    ammeter: 'Amp Dial',
    probe: 'Probe',
  },
  tr: {
    ground: 'Toprak',
    voltage_source: 'Pil / Kaynak',
    current_source: 'Akım',
    logic_in: 'Giriş 0/1',
    resistor: 'Direnç',
    potentiometer: 'Potans.',
    capacitor: 'Kondans.',
    inductor: 'Bobin',
    transformer: 'Trafo',
    diode: 'Diyot',
    led: 'LED Ampul',
    npn: 'NPN',
    pnp: 'PNP',
    nmos: 'N-MOS',
    pmos: 'P-MOS',
    opamp: 'Op-Amp',
    switch: 'Anahtar',
    spdt: '2-Yollu',
    pushbutton: 'Buton',
    gate_and: 'VE (AND)',
    gate_or: 'VEYA',
    gate_not: 'DEĞİL',
    gate_nand: 'NAND',
    gate_xor: 'XOR',
    voltmeter: 'Voltmetre',
    ammeter: 'Amper.',
    probe: 'Prob',
  },
};

let currentLang = 'en';

try {
  const saved =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY)
      : null;
  if (saved === 'en' || saved === 'tr') {
    currentLang = saved;
  } else if (typeof navigator !== 'undefined' && /^tr\b/i.test(navigator.language || '')) {
    currentLang = 'tr';
  }
} catch {
  // Ignore storage errors in sandboxed/file contexts
}

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  currentLang = lang === 'tr' ? 'tr' : 'en';
  try {
    localStorage.setItem(STORAGE_KEY, currentLang);
  } catch {
    // Ignore
  }
}

export function t(key, vars = null) {
  const table = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
  let str = table[key] ?? TRANSLATIONS.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{${k}}`, String(v));
    }
  }
  return str;
}

export function compLabel(type) {
  const table = COMPONENT_LABELS[currentLang] || COMPONENT_LABELS.en;
  return table[type] ?? COMPONENT_LABELS.en[type] ?? type;
}

export function loc(val) {
  if (val && typeof val === 'object') {
    return val[currentLang] ?? val.en ?? '';
  }
  return val ?? '';
}
