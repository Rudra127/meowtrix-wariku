import { StatusBar } from 'expo-status-bar';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors, spacing, TAB_BAR_CLEARANCE } from '@/theme';

type Props = {
  children: React.ReactNode;
  /** Wrap content in a ScrollView (default true). Use false for screens that manage their own list. */
  scroll?: boolean;
  edges?: Edge[];
  /** Add bottom space so content clears the floating tab bar (tab screens). */
  tabBarSpace?: boolean;
  background?: React.ReactNode;
  contentStyle?: ViewStyle;
  /** Pull-to-refresh (scroll screens only). */
  refreshing?: boolean;
  onRefresh?: () => void;
};

/** Standard screen container: canvas color, safe area, keyboard avoidance, padding. */
export function Screen({ children, scroll = true, edges = ['top'], tabBarSpace, background, contentStyle, refreshing, onRefresh }: Props) {
  const bottom = tabBarSpace ? { paddingBottom: TAB_BAR_CLEARANCE } : null;
  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      {background}
      <SafeAreaView style={styles.flex} edges={edges}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {scroll ? (
            <ScrollView
              contentContainerStyle={[styles.content, bottom, contentStyle]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              refreshControl={
                onRefresh ? (
                  <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
                ) : undefined
              }
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.flex, contentStyle]}>{children}</View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.lg },
});
