import { StyleSheet, Text, View } from 'react-native';
import { AppText } from '@/components/ui';
import { colors, fonts, spacing } from '@/theme';

/**
 * Tiny Markdown renderer for LLM replies: paragraphs, **bold**, bullet/numbered lists, headings.
 * Deliberately small — swap for a full markdown library if replies get richer (tables, code).
 */
export function MessageContent({ text, color = colors.text }: { text: string; color?: string }) {
  const blocks = text.replace(/\r/g, '').split('\n');
  return (
    <View style={styles.container}>
      {blocks.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <View key={i} style={styles.gap} />;

        const heading = line.match(/^#{1,6}\s+(.*)$/);
        if (heading) {
          return (
            <AppText key={i} variant="bodyStrong" color={color}>
              {inline(heading[1], color)}
            </AppText>
          );
        }

        const bullet = line.match(/^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/);
        if (bullet) {
          return (
            <View key={i} style={styles.bulletRow}>
              <AppText variant="body" color={color} style={styles.marker}>
                {bullet[1] ? `${bullet[1]}.` : '•'}
              </AppText>
              <AppText variant="body" color={color} style={styles.flex}>
                {inline(bullet[2], color)}
              </AppText>
            </View>
          );
        }

        return (
          <AppText key={i} variant="body" color={color}>
            {inline(line, color)}
          </AppText>
        );
      })}
    </View>
  );
}

function inline(text: string, color: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <Text key={i} style={[styles.bold, { color }]}>
        {part.slice(2, -2)}
      </Text>
    ) : (
      part
    ),
  );
}

const styles = StyleSheet.create({
  container: { gap: 2 },
  gap: { height: spacing.xs },
  bulletRow: { flexDirection: 'row', gap: spacing.sm, paddingLeft: 2 },
  marker: { minWidth: 14 },
  flex: { flex: 1 },
  bold: { fontFamily: fonts.bold },
});
