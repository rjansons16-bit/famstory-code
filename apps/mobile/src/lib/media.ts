/**
 * How a photograph is laid out.
 *
 * The rule and the reasoning live in `theme/tokens.ts` under `media`; this is
 * the one function that applies them, so the timeline, the event and anything
 * added later cannot drift apart.
 *
 * Aspect here is width ÷ height, the same convention as React Native's
 * `aspectRatio` style, so the result can be handed straight to a style.
 */

import type { Attachment } from '@/domain/types';
import { media } from '@/theme';

export interface AspectLimits {
  minAspect: number;
  maxAspect: number;
}

/**
 * The shape to give a photograph, clamped to the limits for where it is shown.
 *
 * A file whose dimensions are unknown falls back to 3:2 rather than to a fixed
 * height: an upload that has not been measured yet must not make the layout
 * jump once it has been.
 */
export function coverAspect(
  attachment: Attachment | undefined,
  limits: AspectLimits = media.card,
): number {
  const { width, height } = attachment ?? {};
  if (!width || !height) return clamp(media.fallbackAspect, limits);

  const ratio = width / height;
  if (!Number.isFinite(ratio) || ratio <= 0) return clamp(media.fallbackAspect, limits);

  return clamp(ratio, limits);
}

function clamp(ratio: number, { minAspect, maxAspect }: AspectLimits): number {
  return Math.min(maxAspect, Math.max(minAspect, ratio));
}
