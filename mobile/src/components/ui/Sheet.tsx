import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardInset } from '@/hooks/useKeyboardVisible';
import { colors, radius, spacing } from '@/theme';
import { AppText } from './AppText';
import { IconButton } from './IconButton';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Scroll the body and cap the sheet's height. Use for lists that can outgrow the screen. */
  scroll?: boolean;
  /** Pinned below the scroll area — keeps a primary action visible (e.g. "Add 3 transactions"). */
  footer?: React.ReactNode;
};

/** Bottom sheet (slide-up modal with a dimmed backdrop). Tap outside or ✕ to close. */
export function Sheet({ visible, onClose, title, children, scroll, footer }: Props) {
  const insets = useSafeAreaInsets();
  const { height: keyboardHeight, visible: keyboardUp } = useKeyboardInset();

  // The sheet is glued to the bottom of the screen, so an open keyboard sits right on top of its
  // inputs. Padding the bottom by the keyboard height pushes the whole sheet above it.
  //
  // `KeyboardAvoidingView` is deliberately not used here: on Android a Modal renders in its own
  // window, which the OS never resizes, so the view has nothing to react to and the sheet stays put.
  // When the keyboard is up it already covers the navigation bar, so the safe-area inset would
  // double-count and leave a visible gap.
  const paddingBottom = keyboardUp ? keyboardHeight + spacing.md : insets.bottom + spacing.xl;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.flex}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom }, scroll && styles.sheetCapped]}>
          <View style={styles.handle} />
          {title ? (
            <View style={styles.header}>
              <AppText variant="heading">{title}</AppText>
              <IconButton icon="close" tone="muted" size={36} onPress={onClose} accessibilityLabel="Close" />
            </View>
          ) : null}
          {scroll ? (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          ) : (
            children
          )}
          {footer}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(8,20,16,0.45)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    gap: spacing.lg,
  },
  // Leave the backdrop reachable at the top so tapping outside still closes the sheet.
  sheetCapped: { maxHeight: '88%' },
  scroll: { flexGrow: 0 },
  scrollContent: { gap: spacing.lg, paddingBottom: spacing.xs },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
