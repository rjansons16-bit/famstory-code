import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';

import { Button, IconButton } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Card, Screen } from '@/components/ui/surface';
import { Text } from '@/components/ui/text';
import { Touchable } from '@/components/ui/touchable';
import { isLive } from '@/data/backend';
import { useApp } from '@/data/store';
import { track } from '@/domain/analytics';
import { PRICING, formatPrice, limitsFor } from '@/domain/plans';
import type { IntroOffer, StoreOffer, StoreOption } from '@/domain/store-offer';
import { t, tf } from '@/i18n';
import { calendarDay } from '@/lib/date';
import { notify } from '@/lib/dialog';
import { goBack } from '@/lib/navigation';
import {
  PurchaseError,
  buy,
  loadOffer,
  openManagement,
  purchasesAvailable,
  restore,
} from '@/lib/purchases';
import { useTheme } from '@/theme';

/** Who takes the money decides what the small print says (App Review 3.1.2). */
function renewalTerms(): string {
  if (Platform.OS === 'ios') return t('premium.renewsApple');
  if (Platform.OS === 'android') return t('premium.renewsGoogle');
  return t('premium.renewsWeb');
}

/**
 * Only what Premium really changes: the limits the server enforces
 * (domain/plans.ts, events.service.ts, uploads.service.ts). A subscription
 * that lists a feature it does not deliver is refused in review (App Review
 * 2.3.1, 3.1.2). The PDF chronicle, video, more groups and the summaries
 * come back here when they exist.
 */
function features(): string[] {
  const premium = limitsFor('premium');
  return [
    t('premium.featureEvents'),
    tf('premium.featurePhotos', premium.maxAttachmentsPerEvent),
    tf('premium.featureVoice', premium.maxVoiceNotesPerEvent),
  ];
}

function lengthOf(intro: IntroOffer): string {
  const n = intro.count * intro.cycles;
  if (intro.unit === 'day') return tf('premium.days', n);
  if (intro.unit === 'week') return tf('premium.weeks', n);
  if (intro.unit === 'month') return tf('premium.months', n);
  return tf('premium.years', n);
}

/** The line under an option: what it comes to a month, or what an offer is and what follows. */
function optionNote(option: StoreOption): string | undefined {
  const then = option.period === 'annual' ? tf('premium.perYear', option.price) : tf('premium.perMonth', option.price);
  if (option.intro?.free) return tf('premium.introFree', lengthOf(option.intro), then);
  if (option.intro) return tf('premium.introPaid', option.intro.price, lengthOf(option.intro), then);
  if (option.perMonth) return tf('premium.annualMonthly', option.perMonth);
  return undefined;
}

function failureText(error: unknown): string {
  const reason = error instanceof PurchaseError ? error.reason : 'unknown';
  if (reason === 'not_allowed') return t('premium.failedNotAllowed');
  if (reason === 'already_bought') return t('premium.failedAlreadyBought');
  if (reason === 'network') return t('premium.failedNetwork');
  return t('premium.failedOther');
}

type Offer = { state: 'loading' } | { state: 'none' } | { state: 'ready'; offer: StoreOffer };

/**
 * PAYWALL.
 *
 * The study's rule: "Premium should activate at the moment the user has already
 * accumulated value." So this screen never appears on its own — only in
 * response to an action that hit a limit, or from the profile.
 *
 * The yearly plan is the default choice: the study recommends promoting the
 * annual subscription with a discount, because a family-memory product grows
 * more valuable over time and the churn risk is lower.
 *
 * Four cases, one screen:
 *   - the sample family (no server): the prices of domain/plans.ts, and the
 *     button turns Premium on in this phone only;
 *   - a phone with the store: the store's own prices, its purchase sheet, and
 *     the server's word on whether the family has Premium now;
 *   - the web: what Premium is, and that it is bought in the phone app;
 *   - a family that has Premium: until when, and where to manage it.
 */
export default function Premium() {
  const theme = useTheme();
  const router = useRouter();
  const family = useApp((s) => s.family);
  const activatePremium = useApp((s) => s.activatePremium);
  const syncSubscription = useApp((s) => s.syncSubscription);
  const refresh = useApp((s) => s.refresh);

  const live = isLive();
  const store = live && purchasesAvailable();
  const familyId = family?.id;
  const hasPremium = family?.plan === 'premium';

  const [plan, setPlan] = useState<'monthly' | 'annual'>('annual');
  const [offer, setOffer] = useState<Offer>({ state: store ? 'loading' : 'none' });
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);

  const ask = useCallback(() => {
    if (!store || !familyId) return;
    loadOffer(familyId)
      .then((next) => setOffer(next ? { state: 'ready', offer: next } : { state: 'none' }))
      .catch(() => setOffer({ state: 'none' }));
  }, [store, familyId]);

  useEffect(() => {
    if (!hasPremium) ask();
  }, [ask, hasPremium]);

  function askAgain() {
    setOffer({ state: 'loading' });
    ask();
  }

  const options = offer.state === 'ready' ? offer.offer : null;
  const chosen = options ? (options[plan] ?? options.annual ?? options.monthly) : null;

  async function onBuy() {
    if (!live) {
      activatePremium(plan);
      goBack(router);
      return;
    }
    if (!familyId || !chosen) return;

    setBusy('buy');
    try {
      const outcome = await buy(familyId, chosen);
      if (outcome === 'cancelled') return;
      if (outcome === 'pending') {
        notify(t('premium.pendingTitle'), t('premium.pendingBody'));
        return;
      }
      track({ name: 'subscription_started', plan: chosen.period });
      const now = await syncSubscription();
      if (now === 'premium') {
        notify(t('premium.thanksTitle'), t('premium.thanksBody'));
        goBack(router);
      } else {
        // The store took it; RevenueCat's webhook will tell the server. Look
        // again in a while rather than leave the family on the free plan.
        notify(t('premium.thanksTitle'), t('premium.thanksLater'));
        setTimeout(() => void refresh().catch(() => undefined), 60_000);
        goBack(router);
      }
    } catch (error) {
      const reason = error instanceof PurchaseError ? error.reason : 'unknown';
      track({ name: 'purchase_failed', reason });
      notify(t('premium.failedTitle'), failureText(error));
    } finally {
      setBusy(null);
    }
  }

  async function onRestore() {
    if (!store || !familyId) {
      notify(t('premium.restore'), t('premium.nothingToRestore'));
      return;
    }
    setBusy('restore');
    try {
      const found = await restore(familyId);
      track({ name: 'purchase_restored', found });
      if (!found) {
        notify(t('premium.restore'), t('premium.nothingToRestore'));
        return;
      }
      const now = await syncSubscription();
      notify(t('premium.restore'), now === 'premium' ? t('premium.restored') : t('premium.thanksLater'));
    } catch (error) {
      notify(t('premium.restore'), failureText(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen edges={['top', 'bottom']} padded={false}>
      <View style={{ paddingHorizontal: theme.spacing.sm }}>
        <IconButton
          name="close"
          accessibilityLabel={t('common.cancel')}
          onPress={() => {
            if (!hasPremium) track({ name: 'paywall_dismissed', trigger: 'manual' });
            goBack(router);
          }}
        />
      </View>

      {/* Scrolls once the small print no longer fits a small phone; on a tall
          one the buttons still sit at the bottom (the spacer, below). */}
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: theme.spacing.lg, gap: theme.spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: theme.spacing.sm }}>
          <Icon name="premium" size={36} tone="primary" />
          <Text variant="display">{hasPremium ? t('premium.youHave') : t('premium.title')}</Text>
          <Text variant="body" tone="muted">
            {hasPremium ? premiumState(family?.subscription) : t('premium.subtitle')}
          </Text>
        </View>

        <View style={{ gap: theme.spacing.md }}>
          {features().map((label) => (
            <View
              key={label}
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
            >
              <Icon name="check" size={18} tone="primary" />
              <Text variant="body" style={{ flex: 1 }}>
                {label}
              </Text>
            </View>
          ))}
        </View>

        {hasPremium ? null : !live ? (
          <View style={{ gap: theme.spacing.sm }}>
            <PlanOption
              selected={plan === 'annual'}
              onPress={() => setPlan('annual')}
              title={t('premium.annual')}
              price={formatPrice(PRICING.annual.amount, PRICING.annual.currency)}
              note={tf('premium.savePercent', PRICING.annualSavingPercent)}
            />
            <PlanOption
              selected={plan === 'monthly'}
              onPress={() => setPlan('monthly')}
              title={t('premium.monthly')}
              price={formatPrice(PRICING.monthly.amount, PRICING.monthly.currency)}
            />
          </View>
        ) : !store ? (
          <Card elevation="flat">
            <Text variant="body">{Platform.OS === 'web' ? t('premium.webOnly') : t('premium.notYet')}</Text>
          </Card>
        ) : offer.state === 'loading' ? (
          <Text variant="body" tone="muted">
            {t('premium.loading')}
          </Text>
        ) : options ? (
          <View style={{ gap: theme.spacing.sm }}>
            {(['annual', 'monthly'] as const).map((period) => {
              const option = options[period];
              if (!option) return null;
              return (
                <PlanOption
                  key={period}
                  selected={chosen?.id === option.id}
                  onPress={() => setPlan(period)}
                  title={period === 'annual' ? t('premium.annual') : t('premium.monthly')}
                  price={option.price}
                  note={optionNote(option)}
                />
              );
            })}
          </View>
        ) : (
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="body" tone="muted">
              {t('premium.noOffer')}
            </Text>
            <Button label={t('premium.tryAgain')} variant="secondary" onPress={askAgain} />
          </View>
        )}

        <View style={{ flex: 1 }} />

        <View style={{ gap: theme.spacing.sm }}>
          {hasPremium ? (
            <>
              {store && ownStore(family?.subscription?.store) ? (
                <Button label={t('premium.manage')} size="lg" onPress={() => void openManagement()} />
              ) : null}
              {storeNote(family?.subscription?.store) ? (
                <Text variant="caption" tone="muted">
                  {storeNote(family?.subscription?.store)}
                </Text>
              ) : null}
            </>
          ) : !live || chosen ? (
            <Button
              label={t('premium.cta')}
              size="lg"
              loading={busy === 'buy'}
              disabled={busy !== null}
              onPress={() => void onBuy()}
            />
          ) : null}

          {live && store ? (
            <Button
              label={t('premium.restore')}
              variant="ghost"
              loading={busy === 'restore'}
              disabled={busy !== null}
              onPress={() => void onRestore()}
            />
          ) : null}

          {hasPremium ? null : (
            <Text variant="caption" tone="muted">
              {renewalTerms()}
            </Text>
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Button label={t('legal.terms')} variant="ghost" onPress={() => router.push('/legal/terms')} />
            <Button label={t('legal.privacy')} variant="ghost" onPress={() => router.push('/legal/privacy')} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

/** "Renews on 8 November", "Ends on 8 November: renewal is turned off", or no end. */
function premiumState(subscription: { until?: string; renews: boolean } | undefined): string {
  if (!subscription?.until) return t('premium.noEnd');
  const day = calendarDay(subscription.until);
  return subscription.renews ? tf('premium.renewsOn', day) : tf('premium.endsOn', day);
}

/** Whether this phone's store is the one that sold it, so "Manage" opens the right page. */
function ownStore(store: string | undefined): boolean {
  return (Platform.OS === 'ios' && store === 'app_store') || (Platform.OS === 'android' && store === 'play_store');
}

/** Bought in the other store: where it is managed instead. */
function storeNote(store: string | undefined): string | null {
  if (store === 'app_store' && Platform.OS !== 'ios') return t('premium.boughtOnApple');
  if (store === 'play_store' && Platform.OS !== 'android') return t('premium.boughtOnGoogle');
  return null;
}

function PlanOption({
  selected,
  onPress,
  title,
  price,
  note,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  price: string;
  note?: string;
}) {
  const theme = useTheme();

  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      give="card"
    >
      <Card
        elevation="flat"
        style={{
          borderWidth: 2,
          borderColor: selected ? theme.color.primary : theme.color.border,
          backgroundColor: selected ? theme.color.primarySoft : theme.color.surface,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
          <Icon name={selected ? 'check' : 'premium'} tone={selected ? 'primary' : 'muted'} />
          <View style={{ flex: 1 }}>
            <Text variant="heading">{title}</Text>
            {note ? (
              <Text variant="caption" tone="primary">
                {note}
              </Text>
            ) : null}
          </View>
          <Text variant="title">{price}</Text>
        </View>
      </Card>
    </Touchable>
  );
}
