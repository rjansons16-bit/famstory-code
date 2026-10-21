import { Stack } from 'expo-router';

import { useReducedMotion } from '@/lib/motion';
import { motion } from '@/theme';

export default function AuthLayout() {
  const reducedMotion = useReducedMotion();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: reducedMotion ? 'none' : 'slide_from_right',
        animationDuration: motion.normal,
      }}
    />
  );
}
