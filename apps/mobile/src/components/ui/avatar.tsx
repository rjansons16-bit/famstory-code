import { Image } from 'expo-image';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Text } from './text';

/**
 * Avatar with initials when there is no photo.
 *
 * The background colour is derived from the name so the same person keeps the
 * same colour on every screen. Design may replace this palette.
 */
const FALLBACK_TONES = ['growth', 'learn', 'landmark', 'care', 'joy', 'journey'] as const;

function toneFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return FALLBACK_TONES[Math.abs(hash) % FALLBACK_TONES.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export interface AvatarProps {
  name: string;
  url?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** White ring — for when avatars overlap in a stack. */
  ring?: boolean;
}

export function Avatar({ name, url, size = 'md', ring }: AvatarProps) {
  const theme = useTheme();
  const px = theme.size[`avatar${size[0].toUpperCase()}${size[1]}` as keyof typeof theme.size];
  const dimension = typeof px === 'number' ? px : theme.size.avatarMd;
  const tone = theme.tone[toneFor(name)];

  return (
    <View
      style={{
        width: dimension,
        height: dimension,
        borderRadius: theme.radius.pill,
        backgroundColor: tone.bg,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderWidth: ring ? 2 : 0,
        borderColor: theme.color.surface,
      }}
    >
      {url ? (
        <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      ) : (
        <Text
          variant={dimension >= 64 ? 'title' : dimension >= 40 ? 'heading' : 'label'}
          style={{ color: tone.fg }}
        >
          {initials(name)}
        </Text>
      )}
    </View>
  );
}

export function AvatarStack({
  people,
  max = 4,
  size = 'sm',
}: {
  people: { name: string; url?: string }[];
  max?: number;
  size?: AvatarProps['size'];
}) {
  const theme = useTheme();
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {shown.map((p, i) => (
        <View key={`${p.name}-${i}`} style={{ marginLeft: i === 0 ? 0 : -theme.spacing.sm }}>
          <Avatar name={p.name} url={p.url} size={size} ring />
        </View>
      ))}
      {rest > 0 ? (
        <Text variant="caption" tone="muted" style={{ marginLeft: theme.spacing.xs }}>
          +{rest}
        </Text>
      ) : null}
    </View>
  );
}
