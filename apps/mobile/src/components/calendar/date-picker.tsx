import { useRef, useState } from 'react';
import { ScrollView, View, type TextStyle, type ViewStyle } from 'react-native';

import { t } from '@/i18n';
import {
  fullDayLabel,
  isAfterDay,
  isSameDay,
  isSameMonth,
  isToday,
  monthGrid,
  monthLabel,
  monthShortNames,
  timeOfDay,
  toDate,
  weekdayInitials,
  withDay,
} from '@/lib/date';
import { useTheme, type Theme } from '@/theme';
import { Button, IconButton } from '../ui/button';
import { Chip } from '../ui/chip';
import { Sheet } from '../ui/feedback';
import { Icon } from '../ui/icon';
import { Text } from '../ui/text';
import { Touchable } from '../ui/touchable';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = [0, 15, 30, 45];

/** The oldest year on offer. A family chronicle reaches back to great-grandparents. */
const FIRST_YEAR = 1900;
/** How far ahead the year list reaches when nothing caps it: plans, not memories. */
const YEARS_AHEAD = 10;
/** Always six rows, so the sheet does not change height from one month to the next. */
const WEEKS = 6;
const YEARS_PER_ROW = 4;

type Level = 'day' | 'month' | 'year';

export interface DatePickerSheetProps {
  visible: boolean;
  /** The chosen moment, or undefined while nothing has been chosen. */
  value: string | undefined;
  /** Day only. Picking the day is then the whole answer, so it closes the sheet. */
  allDay: boolean;
  onClose: () => void;
  onChange: (iso: string) => void;
  title?: string;
  /** The last day that can be picked — a birthday cannot be tomorrow. */
  maxDate?: Date;
  /** Where the calendar opens while `value` is empty. This month by default. */
  emptyMonth?: Date;
  /** Which list it opens on while `value` is empty. */
  emptyLevel?: Level;
}

/**
 * THE DATE PICKER.
 *
 * It used to be the calendar tab's month grid in a sheet, and it showed. The
 * cells were sized as a share of the width, so in a browser on a computer six
 * weeks grew taller than the window and Done went off the bottom. The legend
 * under the grid explained "memory" and "reminder" to somebody entering their
 * birthday. A default date sat ringed as if already chosen, and reaching 1970
 * meant pressing "previous year" once per year.
 *
 * So it is its own control now, with three levels behind one heading: the days
 * of a month, the months of a year, and the years. Pressing "March 1970" opens
 * the years; a year opens its months; a month opens its days. All three share
 * one height, so nothing jumps when the level changes.
 */
export function DatePickerSheet({
  visible,
  value,
  allDay,
  onClose,
  onChange,
  title,
  maxDate,
  emptyMonth,
  emptyLevel = 'day',
}: DatePickerSheetProps) {
  const theme = useTheme();
  const chosen = value ? toDate(value) : undefined;

  const [level, setLevel] = useState<Level>(chosen ? 'day' : emptyLevel);
  const [month, setMonth] = useState(() => firstOfMonth(chosen ?? emptyMonth ?? new Date()));

  // Every opening starts from the value, not from wherever the last visit was
  // left. Adjusted during render rather than in an effect, so the first frame
  // of the sheet is already the right month.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setLevel(chosen ? 'day' : emptyLevel);
      setMonth(firstOfMonth(chosen ?? emptyMonth ?? new Date()));
    }
  }

  const bodyHeight = theme.spacing.xl + theme.size.touchTarget * WEEKS;
  const lastYear = maxDate ? maxDate.getFullYear() : new Date().getFullYear() + YEARS_AHEAD;

  const canStepForward =
    level === 'day'
      ? !maxDate || !isAfterDay(new Date(month.getFullYear(), month.getMonth() + 1, 1), maxDate)
      : month.getFullYear() < lastYear;
  const canStepBack =
    level === 'day'
      ? new Date(month.getFullYear(), month.getMonth() - 1, 1).getFullYear() >= FIRST_YEAR
      : month.getFullYear() > FIRST_YEAR;

  function step(by: number) {
    setMonth((m) =>
      level === 'day'
        ? new Date(m.getFullYear(), m.getMonth() + by, 1)
        : new Date(m.getFullYear() + by, m.getMonth(), 1),
    );
  }

  function pickDay(day: Date) {
    onChange(withDay(day, value));
    if (allDay) onClose();
  }

  function pickYear(year: number) {
    setMonth((m) => new Date(year, m.getMonth(), 1));
    setLevel('month');
  }

  function pickMonth(index: number) {
    setMonth((m) => new Date(m.getFullYear(), index, 1));
    setLevel('day');
  }

  function setTime(h: number, m: number) {
    const next = chosen ? new Date(chosen) : new Date();
    next.setHours(h, m, 0, 0);
    onChange(next.toISOString());
  }

  return (
    <Sheet
      visible={visible}
      title={title ?? t('event.dateLabel')}
      onClose={onClose}
      scroll
      footer={allDay ? undefined : <Button label={t('common.done')} onPress={onClose} />}
    >
      <View style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {level === 'year' ? (
            <View style={{ width: theme.size.touchTarget }} />
          ) : (
            <IconButton
              name="back"
              disabled={!canStepBack}
              accessibilityLabel={
                level === 'day' ? t('datePicker.previousMonth') : t('datePicker.previousYear')
              }
              onPress={() => step(-1)}
            />
          )}

          {/* The heading is the way to the years. The arrow beside it says so
              without a word, as the platforms' own date pickers do. */}
          <Touchable
            accessibilityRole="button"
            accessibilityHint={level === 'year' ? undefined : t('datePicker.chooseYear')}
            onPress={() => setLevel(level === 'year' ? 'day' : 'year')}
            give="row"
            style={{
              flex: 1,
              minHeight: theme.size.touchTarget,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: theme.spacing.xs,
            }}
          >
            <Text variant="heading" style={{ textTransform: 'capitalize' }}>
              {level === 'day' ? monthLabel(month) : String(month.getFullYear())}
            </Text>
            <Icon name={level === 'year' ? 'collapse' : 'expand'} size={18} tone="muted" />
          </Touchable>

          {level === 'year' ? (
            <View style={{ width: theme.size.touchTarget }} />
          ) : (
            <IconButton
              name="forward"
              disabled={!canStepForward}
              accessibilityLabel={
                level === 'day' ? t('datePicker.nextMonth') : t('datePicker.nextYear')
              }
              onPress={() => step(1)}
            />
          )}
        </View>

        {level === 'day' ? (
          <DayGrid
            month={month}
            chosen={chosen}
            maxDate={maxDate}
            height={bodyHeight}
            onPick={pickDay}
          />
        ) : level === 'month' ? (
          <MonthList
            year={month.getFullYear()}
            chosen={chosen}
            maxDate={maxDate}
            height={bodyHeight}
            onPick={pickMonth}
          />
        ) : (
          <YearList
            first={FIRST_YEAR}
            last={lastYear}
            focus={month.getFullYear()}
            chosen={chosen}
            height={bodyHeight}
            onPick={pickYear}
          />
        )}

        {/* Only beside the days: the time belongs to a day, and leaving it under
            the year list would make that sheet taller than it needs to be. */}
        {!allDay && level === 'day' ? (
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="body" tone="muted">
              {value ? timeOfDay(value) : ''}
            </Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
                {HOURS.map((h) => (
                  <Chip
                    key={h}
                    label={String(h).padStart(2, '0')}
                    selected={chosen?.getHours() === h}
                    onPress={() => setTime(h, chosen?.getMinutes() ?? 0)}
                  />
                ))}
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
              {MINUTES.map((m) => (
                <Chip
                  key={m}
                  label={`:${String(m).padStart(2, '0')}`}
                  selected={chosen?.getMinutes() === m}
                  onPress={() => setTime(chosen?.getHours() ?? 12, m)}
                />
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

/**
 * The same picker, asked for a birthday.
 *
 * It opens on the years, because a birthday is decades away rather than a few
 * months, and on a year near a typical grown-up's so the list starts somewhere
 * useful. Nothing looks chosen until something is. Days after today cannot be
 * picked.
 */
export function BirthDatePickerSheet({
  visible,
  value,
  onClose,
  onChange,
}: Pick<DatePickerSheetProps, 'visible' | 'value' | 'onClose' | 'onChange'>) {
  const today = new Date();

  return (
    <DatePickerSheet
      visible={visible}
      value={value}
      allDay
      title={t('onboarding.birthDate')}
      maxDate={today}
      emptyMonth={new Date(today.getFullYear() - 30, 0, 1)}
      emptyLevel="year"
      onClose={onClose}
      onChange={onChange}
    />
  );
}

// ---------------------------------------------------------------------------
// The three levels
// ---------------------------------------------------------------------------

function DayGrid({
  month,
  chosen,
  maxDate,
  height,
  onPick,
}: {
  month: Date;
  chosen: Date | undefined;
  maxDate: Date | undefined;
  height: number;
  onPick: (day: Date) => void;
}) {
  const theme = useTheme();
  const cell: ViewStyle = {
    width: `${100 / 7}%`,
    height: theme.size.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <View style={{ height }}>
      <View style={{ flexDirection: 'row', height: theme.spacing.xl, alignItems: 'center' }}>
        {weekdayInitials().map((initial, i) => (
          <Text key={i} variant="label" tone="muted" align="center" style={{ flex: 1 }}>
            {initial}
          </Text>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {monthGrid(month).map((day) => {
          // Blank rather than faded: the days of the next month are not a choice
          // this grid is offering, and faded numbers read as disabled ones.
          if (!isSameMonth(day, month)) return <View key={day.toISOString()} style={cell} />;

          const disabled = maxDate ? isAfterDay(day, maxDate) : false;
          const selected = chosen ? isSameDay(day, chosen) : false;
          const today = isToday(day);

          return (
            <Touchable
              key={day.toISOString()}
              accessibilityRole="button"
              accessibilityLabel={fullDayLabel(day)}
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              opacity={disabled ? 0.35 : 1}
              onPress={() => onPick(day)}
              give="round"
              style={cell}
            >
              {/* Filled for the chosen day. The calendar tab uses a ring because
                  its days carry photographs; a picker has nothing to hide. */}
              <View
                style={{
                  width: theme.size.calendarDay,
                  height: theme.size.calendarDay,
                  borderRadius: theme.radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? theme.color.primary : 'transparent',
                  borderWidth: today && !selected ? 1 : 0,
                  borderColor: theme.color.primary,
                }}
              >
                <Text
                  variant="body"
                  tone={selected ? 'onPrimary' : today ? 'primary' : 'default'}
                  style={selected || today ? emphasis(theme) : undefined}
                >
                  {day.getDate()}
                </Text>
              </View>
            </Touchable>
          );
        })}
      </View>
    </View>
  );
}

function MonthList({
  year,
  chosen,
  maxDate,
  height,
  onPick,
}: {
  year: number;
  chosen: Date | undefined;
  maxDate: Date | undefined;
  height: number;
  onPick: (index: number) => void;
}) {
  const theme = useTheme();
  const names = monthShortNames();

  return (
    <View style={{ height, gap: theme.spacing.sm }}>
      {[0, 3, 6, 9].map((row) => (
        <View key={row} style={{ flex: 1, flexDirection: 'row', gap: theme.spacing.sm }}>
          {names.slice(row, row + 3).map((name, i) => {
            const index = row + i;
            const disabled = maxDate ? isAfterDay(new Date(year, index, 1), maxDate) : false;
            const selected = chosen?.getFullYear() === year && chosen.getMonth() === index;

            return (
              <Touchable
                key={name}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                opacity={disabled ? 0.35 : 1}
                onPress={() => onPick(index)}
                style={{
                  flex: 1,
                  borderRadius: theme.radius.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? theme.color.primary : theme.color.surfaceMuted,
                }}
              >
                <Text variant="heading" tone={selected ? 'onPrimary' : 'default'}>
                  {name}
                </Text>
              </Touchable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function YearList({
  first,
  last,
  focus,
  chosen,
  height,
  onPick,
}: {
  first: number;
  last: number;
  /** The year to bring into view when the list opens. */
  focus: number;
  chosen: Date | undefined;
  height: number;
  onPick: (year: number) => void;
}) {
  const theme = useTheme();
  const list = useRef<ScrollView>(null);
  const rowHeight = theme.size.touchTarget + theme.spacing.sm;
  const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);

  // Opened in the middle of a century-long list, on the year that matters —
  // not at 1900, which is a scroll away from anybody's birthday. Whole rows
  // above it, so the list starts with a full row rather than a clipped one.
  function reveal() {
    const row = Math.floor((focus - first) / YEARS_PER_ROW);
    const above = Math.floor((Math.floor(height / rowHeight) - 1) / 2);
    list.current?.scrollTo({ y: Math.max(0, (row - above) * rowHeight), animated: false });
  }

  return (
    <ScrollView ref={list} style={{ height }} onContentSizeChange={reveal}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {years.map((year) => {
          const selected = chosen?.getFullYear() === year;

          return (
            <View
              key={year}
              style={{
                width: `${100 / YEARS_PER_ROW}%`,
                height: rowHeight,
                padding: theme.spacing.xs,
              }}
            >
              <Touchable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onPick(year)}
                style={{
                  flex: 1,
                  borderRadius: theme.radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? theme.color.primary : 'transparent',
                }}
              >
                <Text
                  variant="body"
                  tone={selected ? 'onPrimary' : 'default'}
                  style={selected ? emphasis(theme) : undefined}
                >
                  {year}
                </Text>
              </Touchable>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function firstOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * The chosen day and today, in the semibold face at body size. A loaded face
 * rather than `fontWeight`: asking for a weight that was not loaded makes the
 * platform smear one together (see theme/tokens.ts).
 */
function emphasis(theme: Theme): TextStyle {
  return { fontFamily: theme.typography.heading.fontFamily };
}
