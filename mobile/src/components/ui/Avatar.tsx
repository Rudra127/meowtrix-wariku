import { Image, StyleSheet, View } from 'react-native';
import { colors, fonts } from '@/theme';
import { AppText } from './AppText';

type Props = { name?: string | null; imageUrl?: string | null; size?: number; tone?: 'accent' | 'primary' };

/** Photo if available, otherwise initials on a colored circle. */
export function Avatar({ name, imageUrl, size = 44, tone = 'accent' }: Props) {
  const dims = { width: size, height: size, borderRadius: size / 2 };
  // Clerk serves a generated default avatar for everyone; only show real uploads/OAuth photos.
  if (imageUrl && !imageUrl.includes('default')) return <Image source={{ uri: imageUrl }} style={dims} />;
  const initials =
    (name ?? '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('') || 'W';
  const bg = tone === 'accent' ? colors.accent : colors.primary;
  const fg = tone === 'accent' ? colors.textOnAccent : colors.textOnPrimary;
  return (
    <View style={[styles.base, dims, { backgroundColor: bg }]}>
      <AppText color={fg} style={{ fontFamily: fonts.bold, fontSize: size * 0.38 }}>
        {initials}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({ base: { alignItems: 'center', justifyContent: 'center' } });
