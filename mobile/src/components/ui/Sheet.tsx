import { useEffect, useMemo, useState } from 'react';
import { Animated, Dimensions, Modal, PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardInset } from '@/hooks/useKeyboardVisible';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { colors, motion, radius, spacing } from '@/theme';
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

const SCREEN_H = Dimensions.get('window').height;
/** Drag past this (or flick faster than DISMISS_VELOCITY) to close. */
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 0.9;

/**
 * Bottom sheet. Springs up over a fading backdrop, and closes by tapping outside, the ✕, or
 * dragging the handle/header down (iOS-style). Stays mounted while it animates out.
 */
export function Sheet({ visible, onClose, title, children, scroll, footer }: Props) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { height: keyboardHeight, visible: keyboardUp } = useKeyboardInset();
  const [mounted, setMounted] = useState(visible);
  const [progress] = useState(() => new Animated.Value(0)); // 0 hidden → 1 shown
  const [drag] = useState(() => new Animated.Value(0)); // finger offset while dragging down

  // Mount as soon as we're asked to show (derived during render); unmount only after the
  // close animation finishes (in its callback below).
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      drag.setValue(0);
      const anim = reduced
        ? Animated.timing(progress, { toValue: 1, duration: motion.duration.fast, useNativeDriver: true })
        : Animated.spring(progress, { toValue: 1, useNativeDriver: true, ...motion.spring.ui });
      anim.start();
    } else {
      Animated.timing(progress, { toValue: 0, duration: motion.duration.base, easing: motion.easeInOut, useNativeDriver: true }).start(
        ({ finished }) => finished && setMounted(false),
      );
    }
  }, [visible, progress, drag, reduced]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_e, g) => drag.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_e, g) => {
          if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) onClose();
          else Animated.spring(drag, { toValue: 0, useNativeDriver: true, ...motion.spring.ui }).start();
        },
        onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: true, ...motion.spring.ui }).start(),
      }),
    [drag, onClose],
  );

  // The sheet is glued to the bottom of the screen, so an open keyboard sits right on top of its
  // inputs. Padding the bottom by the keyboard height pushes the whole sheet above it.
  // `KeyboardAvoidingView` is deliberately not used: on Android a Modal renders in its own window,
  // which the OS never resizes. When the keyboard is up it already covers the navigation bar, so
  // the safe-area inset would double-count and leave a visible gap.
  const paddingBottom = keyboardUp ? keyboardHeight + spacing.md : insets.bottom + spacing.xl;

  const translateY = Animated.add(
    progress.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 0 : SCREEN_H * 0.6, 0] }),
    drag,
  );
  const backdropOpacity = Animated.multiply(
    progress,
    drag.interpolate({ inputRange: [0, 300], outputRange: [1, 0.35], extrapolate: 'clamp' }),
  );

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.flex}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={styles.fill} onPress={onClose} accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom, transform: [{ translateY }], opacity: reduced ? progress : 1 },
            scroll && styles.sheetCapped,
          ]}
        >
          {/* Drag zone: handle + header. The body stays free to scroll. */}
          <View {...pan.panHandlers} style={styles.dragZone}>
            <View style={styles.handle} />
            {title ? (
              <View style={styles.header}>
                <AppText variant="heading" style={styles.title}>
                  {title}
                </AppText>
                <IconButton icon="close" tone="muted" size={36} onPress={onClose} accessibilityLabel="Close" />
              </View>
            ) : null}
          </View>
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
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'flex-end' },
  fill: { flex: 1 },
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
  dragZone: { gap: spacing.lg, paddingTop: spacing.xs },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { flex: 1 },
});
