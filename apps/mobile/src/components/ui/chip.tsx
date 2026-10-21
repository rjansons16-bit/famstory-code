import { ScrollView, View } from 'react-native';

import { CATEGORY_BY_ID } from '@/domain/categories';
import type { CategoryId, MemberRole } from '@/domain/types';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { Icon, type IconName } from './icon';
import { Text } from './text';
import { Touchable } from './touchable';

// ---------------------------------------------------------------------------
// Chip
// ---------------------------------------------------------------------------

export interface ChipProps {
  label: string;
  icon?: IconName;
  selected?: boolean;
  onPress?: () => void;
  /** Raw colours — only for category tones. */
  fg?: string;
  bg?: string;
}

export function Chip({ label, icon, selected, onPress, fg, bg }: ChipProps) {
  const theme = useTheme();

  const background = bg ?? (selected ? theme.color.primary : theme.color.surfaceMuted);
  const foreground = fg ?? (selected ? theme.color.textOnPrimary : theme.color.textMuted);

  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.pill,
        backgroundColor: background,
      }}
    >
      {icon ? <Icon name={icon} size={14} color={foreground} /> : null}
      <Text variant="label" style={{ color: foreground }}>
        {label}
      </Text>
    </View>
  );

  if (!onPress) return body;

  return (
    <Touchable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
    >
      {body}
    </Touchable>
  );
}

// ---------------------------------------------------------------------------
// Category chip
// ---------------------------------------------------------------------------

export function CategoryChip({
  categoryId,
  selected,
  onPress,
}: {
  categoryId: CategoryId;
  selected?: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const category = CATEGORY_BY_ID[categoryId];
  const tone = theme.tone[category.tone];

  return (
    <Chip
      label={t(category.labelKey as Parameters<typeof t>[0])}
      selected={selected}
      onPress={onPress}
      fg={selected ? theme.color.textOnPrimary : tone.fg}
      bg={selected ? theme.color.primary : tone.bg}
    />
  );
}

// ---------------------------------------------------------------------------
// Role badge
// ---------------------------------------------------------------------------

const ROLE_LABEL: Record<MemberRole, Parameters<typeof t>[0]> = {
  admin: 'role.admin',
  member: 'role.member',
  child: 'role.child',
  viewer: 'role.viewer',
};

export function RoleBadge({ role }: { role: MemberRole }) {
  const theme = useTheme();
  const tone = {
    admin: theme.tone.landmark,
    member: theme.tone.growth,
    child: theme.tone.joy,
    viewer: theme.tone.neutral,
  }[role];

  return <Chip label={t(ROLE_LABEL[role])} fg={tone.fg} bg={tone.bg} />;
}

// ---------------------------------------------------------------------------
// Segmented filter
// ---------------------------------------------------------------------------

export function FilterBar<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const theme = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: theme.spacing.sm, paddingRight: theme.spacing.lg }}
    >
      {options.map((o) => (
        <Chip
          key={o.value}
          label={o.label}
          icon={o.icon}
          selected={value === o.value}
          onPress={() => onChange(o.value)}
        />
      ))}
    </ScrollView>
  );
}
