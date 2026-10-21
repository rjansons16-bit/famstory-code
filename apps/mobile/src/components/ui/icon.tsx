import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { useTheme } from '@/theme';

/**
 * Semantic icons.
 *
 * Screens never name an Ionicons glyph. They ask for `<Icon name="visibility" />`.
 * If design swaps the icon set (Feather, Lucide, custom SVG), ONLY this map has
 * to be rewritten — not 25 screens.
 */
const GLYPH = {
  // Navigation
  timeline: 'time-outline',
  calendar: 'calendar-outline',
  family: 'people-outline',
  profile: 'person-circle-outline',
  back: 'chevron-back',
  forward: 'chevron-forward',
  expand: 'chevron-down',
  collapse: 'chevron-up',
  close: 'close',
  more: 'ellipsis-horizontal',

  // Actions
  add: 'add',
  edit: 'create-outline',
  delete: 'trash-outline',
  share: 'share-outline',
  search: 'search',
  filter: 'options-outline',
  check: 'checkmark',
  send: 'arrow-up-circle',

  // Content
  photo: 'image-outline',
  camera: 'camera-outline',
  video: 'videocam-outline',
  comment: 'chatbubble-outline',
  bell: 'notifications-outline',
  clock: 'time-outline',
  pin: 'location-outline',

  // Visibility and safety
  visibility: 'eye-outline',
  private: 'lock-closed-outline',
  group: 'people-circle-outline',
  shield: 'shield-checkmark-outline',
  block: 'ban-outline',

  // Reactions
  heart: 'heart',
  heartOutline: 'heart-outline',
  smile: 'happy-outline',
  clap: 'hand-left-outline',
  wow: 'sparkles-outline',

  // Status
  gift: 'gift-outline',
  star: 'bookmark',
  starOutline: 'bookmark-outline',
  warning: 'warning-outline',
  info: 'information-circle-outline',
  sparkle: 'sparkles',
  premium: 'diamond-outline',
  repeat: 'repeat-outline',
  skip: 'play-skip-forward-outline',
  stop: 'stop-circle-outline',
  mic: 'mic-outline',
  play: 'play',
  pause: 'pause',
  memorial: 'flower-outline',
  wish: 'list-outline',
  question: 'chatbox-ellipses-outline',
  recap: 'albums-outline',
  subscribe: 'calendar-number-outline',

  // Auth
  google: 'logo-google',
  apple: 'logo-apple',
  mail: 'mail-outline',
  link: 'link-outline',
  qr: 'qr-code-outline',
  language: 'globe-outline',
  logout: 'log-out-outline',
  download: 'download-outline',
  moon: 'moon-outline',
  help: 'help-circle-outline',

  // Keepsakes
  capsule: 'hourglass-outline',
  book: 'book-outline',
  shelf: 'library-outline',
  tradition: 'leaf-outline',
  growth: 'trending-up-outline',
  film: 'film-outline',
  print: 'print-outline',
  desktop: 'desktop-outline',
  phone: 'phone-portrait-outline',

  // Gifts and the family's days
  interests: 'heart-circle-outline',
  shop: 'cart-outline',
  specialDay: 'ribbon-outline',
} as const;

export type IconName = keyof typeof GLYPH;

export interface IconProps {
  name: IconName;
  size?: number;
  /** Semantic colour. A raw hex is allowed when it comes from a category tone. */
  tone?: 'default' | 'muted' | 'primary' | 'danger' | 'onPrimary' | 'success';
  color?: string;
  style?: ComponentProps<typeof Ionicons>['style'];
}

export function Icon({ name, size, tone = 'default', color, style }: IconProps) {
  const theme = useTheme();

  const resolved =
    color ??
    {
      default: theme.color.text,
      muted: theme.color.textMuted,
      primary: theme.color.primary,
      danger: theme.color.danger,
      onPrimary: theme.color.textOnPrimary,
      success: theme.color.success,
    }[tone];

  return (
    <Ionicons name={GLYPH[name]} size={size ?? theme.size.icon} color={resolved} style={style} />
  );
}
