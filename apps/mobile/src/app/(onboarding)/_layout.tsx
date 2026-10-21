import { Stack } from 'expo-router';

import { useReducedMotion } from '@/lib/motion';
import { motion } from '@/theme';

export default function OnboardingLayout() {
  const reducedMotion = useReducedMotion();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // A sequence of steps, so it moves like one: each answer pushes the
        // next question in from the right, and Back walks it out again.
        animation: reducedMotion ? 'none' : 'slide_from_right',
        animationDuration: motion.normal,
      }}
    />
  );
}
