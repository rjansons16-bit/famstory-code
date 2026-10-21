import QRCode from 'qrcode';
import { useMemo } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';

/**
 * AN INVITATION AS A SQUARE.
 *
 * The shortest path from "come and see your grandchildren" to somebody
 * actually inside the app is a phone camera pointed at a screen. Typing
 * FAM-1234 into a browser on a phone is the step where the person this
 * product is partly for gives up.
 *
 * Drawn as plain Views rather than as an SVG or an image: react-native-svg is
 * not in this project, a data-URI image cannot take the theme's colours, and a
 * QR code is a grid of squares - which is a thing React Native already draws.
 * The encoder (`qrcode`) only produces the matrix; nothing renders it for us.
 *
 * WHY THE QUIET ZONE IS NOT OPTIONAL. A QR code needs a margin of background
 * around it or a camera cannot find its corners. Against a dark card that
 * margin also has to be LIGHT, not transparent - `theme.scannable` is fixed in
 * both themes for exactly that reason (tokens.ts).
 */

/** Modules of blank around the code. Four is the specification's minimum. */
const QUIET_ZONE = 4;

export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const theme = useTheme();

  const matrix = useMemo(() => {
    try {
      const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' });
      return { size: modules.size, data: modules.data };
    } catch {
      // A value too long for a QR code, or empty. The screen still has the
      // link and the code as text, so a missing square is not a dead end.
      return null;
    }
  }, [value]);

  if (!matrix) return null;

  const total = matrix.size + QUIET_ZONE * 2;
  // Whole pixels: a fractional module width leaves seams between the squares
  // on some screens, and a seam is a bit a scanner has to guess.
  const module = Math.max(1, Math.floor(size / total));
  const side = module * total;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={value}
      style={{
        width: side,
        height: side,
        padding: module * QUIET_ZONE,
        backgroundColor: theme.scannable.light,
        borderRadius: theme.radius.sm,
      }}
    >
      {Array.from({ length: matrix.size }, (_, row) => (
        <View key={row} style={{ flexDirection: 'row' }}>
          {Array.from({ length: matrix.size }, (_, column) => (
            <View
              key={column}
              style={{
                width: module,
                height: module,
                backgroundColor: matrix.data[row * matrix.size + column]
                  ? theme.scannable.dark
                  : theme.scannable.light,
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
