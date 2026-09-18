import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Badge, IconButton } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';
import { BrandMark } from './BrandMark';

type Props = {
  /** Big hero line(s) on the green header. The last line is highlighted in lime. */
  hero: string[];
  title: string;
  subtitle?: string;
  showBack?: boolean;
  children: React.ReactNode;
};

/** Shared shell for sign-in / sign-up / reset: green hero on top, form sheet below. */
export function AuthLayout({ hero, title, subtitle, showBack, children }: Props) {
  const router = useRouter();
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {/* Decorative rings */}
      <View style={[styles.ring, { width: 320, height: 320, top: -120, right: -110 }]} />
      <View style={[styles.ring, { width: 200, height: 200, top: 40, right: -60, opacity: 0.5 }]} />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <SafeAreaView edges={['top']} style={styles.hero}>
            <View style={styles.topRow}>
              {showBack ? (
                <IconButton icon="arrow-back" tone="glass" size={40} onPress={() => router.back()} accessibilityLabel="Back" />
              ) : (
                <View style={styles.brandRow}>
                  <BrandMark size={36} />
                  <AppText variant="heading" color={colors.textOnPrimary}>
                    Wariku
                  </AppText>
                </View>
              )}
            </View>
            <View>
              {hero.map((line, i) => (
                <AppText
                  key={line}
                  variant="display"
                  color={i === hero.length - 1 ? colors.accent : colors.textOnPrimary}
                >
                  {line}
                </AppText>
              ))}
            </View>
            <View style={styles.badges}>
              <Badge tone="glass" icon="school" label="Learn" />
              <Badge tone="glass" icon="wallet" label="Track" />
              <Badge tone="glass" icon="sparkles" label="Ask AI" />
            </View>
          </SafeAreaView>

          <SafeAreaView edges={['bottom']} style={styles.sheet}>
            <View style={styles.heading}>
              <AppText variant="title">{title}</AppText>
              {!!subtitle && <AppText variant="body" color={colors.textMuted}>{subtitle}</AppText>}
            </View>
            {children}
          </SafeAreaView>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export function OrDivider({ label = 'or' }: { label?: string }) {
  return (
    <View style={styles.divider}>
      <View style={styles.line} />
      <AppText variant="caption">{label}</AppText>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primary },
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  ring: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(200,241,105,0.18)',
  },
  hero: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.xl },
  topRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, marginTop: spacing.sm },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badges: { flexDirection: 'row', gap: spacing.sm },
  sheet: {
    flexGrow: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  heading: { gap: spacing.xs },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.textSubtle },
});
