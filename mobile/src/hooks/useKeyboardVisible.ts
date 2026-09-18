import { useEffect, useState } from 'react';
import { Keyboard, Platform, type KeyboardEvent } from 'react-native';

// iOS fires `will*` before the keyboard animates, so layout moves in step with it. Android only
// has `did*`, which fires once the keyboard is already up.
const SHOW_EVENT = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
const HIDE_EVENT = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

/**
 * Current keyboard height in dp, and whether it's up.
 *
 * Use this for anything anchored to the bottom of the screen (bottom sheets, the chat composer).
 * `KeyboardAvoidingView` is the right tool inside a normal screen, but it is unreliable inside a
 * `Modal` on Android, because the modal gets its own window that the OS never resizes.
 */
export function useKeyboardInset() {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener(SHOW_EVENT, (event: KeyboardEvent) => {
      setHeight(event.endCoordinates?.height ?? 0);
    });
    const hide = Keyboard.addListener(HIDE_EVENT, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return { height, visible: height > 0 };
}

/** Just the boolean, for callers that only need to know if the keyboard is up. */
export function useKeyboardVisible() {
  return useKeyboardInset().visible;
}

/**
 * `behavior` for every `KeyboardAvoidingView` in the app. Keep them identical: mixing values is
 * how you end up with one screen that over-scrolls and another that doesn't move.
 *
 * iOS needs `padding`. Android needs `height`, and passing `undefined` (the old value here) makes
 * the component a no-op, which is why the keyboard used to sit on top of every field there.
 * Android also relies on `softwareKeyboardLayoutMode: "resize"` in app.json.
 */
export const KEYBOARD_BEHAVIOR = Platform.OS === 'ios' ? ('padding' as const) : ('height' as const);
