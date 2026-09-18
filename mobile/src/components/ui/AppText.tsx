import { Text, type TextProps } from 'react-native';
import { typography, type TypographyVariant } from '@/theme';

type Props = TextProps & { variant?: TypographyVariant; color?: string; center?: boolean };

/** The only way to render text: consistent font family, size and color from the theme. */
export function AppText({ variant = 'body', color, center, style, ...rest }: Props) {
  return (
    <Text
      style={[typography[variant], color ? { color } : null, center ? { textAlign: 'center' } : null, style]}
      {...rest}
    />
  );
}
