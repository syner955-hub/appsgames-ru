/**
 * Утилиты для автоматического выбора категории и иконки hero-обложки
 * на основе URL страницы. Используются, когда в frontmatter не задано
 * явное изображение.
 */

export type HeroCategory =
  | 'ios'
  | 'android'
  | 'obzory'
  | 'sovety'
  | 'bezopasnost'
  | 'casino'
  | 'default';

export type HeroIcon =
  | 'apple'
  | 'android'
  | 'star'
  | 'bulb'
  | 'shield'
  | 'bolt'
  | 'download'
  | 'cloud'
  | 'lock'
  | 'trash'
  | 'refresh'
  | 'battery'
  | 'key'
  | 'eye'
  | 'messages';

export function resolveCategory(pathname: string): HeroCategory {
  const p = pathname.toLowerCase();
  if (p.startsWith('/casino/') || p.startsWith('/android/casino/')) return 'casino';
  if (p.startsWith('/ios/') || p.startsWith('/poleznoe-ios/') || p.startsWith('/uroki-po-ios/') || p.startsWith('/rabota-s-itunes/')) return 'ios';
  if (p.startsWith('/android/') || p.startsWith('/poleznoe-dlya-android/')) return 'android';
  if (p.startsWith('/obzory/') || p.startsWith('/dopolnitelnyjj-soft/')) return 'obzory';
  if (p.startsWith('/sovety/')) return 'sovety';
  if (p.startsWith('/bezopasnost/')) return 'bezopasnost';
  return 'default';
}

export function resolveIcon(pathname: string, category: HeroCategory): HeroIcon {
  const p = pathname.toLowerCase();

  // безопасность и аккаунты
  if (p.includes('2fa') || p.includes('dvuhfaktor') || p.includes('autentif') || p.includes('parol')) return 'key';
  if (p.includes('virus') || p.includes('utek') || p.includes('antivir') || p.includes('vpn')) return 'shield';
  if (p.includes('lock') || p.includes('blokir')) return 'lock';

  // удаление/очистка/место
  if (p.includes('kesh') || p.includes('udalit') || p.includes('osvobodit') || p.includes('mesto')) return 'trash';

  // батарея / скорость / обновление
  if (p.includes('batare') || p.includes('ekonom')) return 'battery';
  if (p.includes('obnovit') || p.includes('obnovl') || p.includes('uskorit') || p.includes('sbros')) return 'refresh';

  // перенос / облако
  if (p.includes('perenos') || p.includes('perenesti') || p.includes('sinhroniz') || p.includes('bekap')) return 'cloud';

  // скачать / фильм / музыку
  if (p.includes('skachat') || p.includes('zakachat') || p.includes('film') || p.includes('muzyku')) return 'download';

  // скрытие/восстановление фото, приватность
  if (p.includes('skryt') || p.includes('vosstanov')) return 'eye';

  // мессенджеры/сравнения
  if (p.includes('messenzh') || p.includes('whatsapp') || p.includes('telegram') || p.includes('whats-tg')) return 'messages';

  // советы/идеи/заметки
  if (p.includes('zametok') || p.includes('sovet')) return 'bulb';

  // обзоры/звёзды/чтения
  if (p.includes('luchshie') || p.includes('chten') || p.includes('podpisk') || p.includes('menedzher')) return 'star';

  // фолбэк — иконка категории
  if (category === 'ios') return 'apple';
  if (category === 'android') return 'android';
  if (category === 'obzory') return 'star';
  if (category === 'sovety') return 'bulb';
  if (category === 'bezopasnost') return 'shield';
  if (category === 'casino') return 'star';
  return 'bolt';
}

/** Человекочитаемое название категории для бейджа */
export function resolveCategoryLabel(category: HeroCategory): string {
  const map: Record<HeroCategory, string> = {
    ios: 'iOS',
    android: 'Android',
    obzory: 'Обзоры',
    sovety: 'Советы',
    bezopasnost: 'Безопасность',
    casino: 'Казино',
    default: 'AppsGames',
  };
  return map[category];
}
