import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '@/theme';

/** Placeholder logo: lime squircle with a "W". Swap for the real logo asset when it exists. */
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <View style={[styles.box, { width: size, height: size, borderRadius: size * 0.32 }]}>
      <Text style={[styles.letter, { fontSize: size * 0.55, lineHeight: size * 0.7 }]}>W</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  letter: { fontFamily: fonts.extrabold, color: colors.primary },
});
