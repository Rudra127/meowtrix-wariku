import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import type { GrowwStatus } from '@/api/types';
import { AppText, Badge, Card } from '@/components/ui';
import { colors, radius, spacing, themed } from '@/theme';

/**
 * Groww in the Profile "Connected accounts" section.
 *
 * Deliberately NOT a `BrokerageCard`. Groww has no OAuth, so there is no login URL, no callback and
 * no token to store — a key pair configured on the server grants access to exactly one Groww account.
 * That means no Connect or Disconnect button: the card only reports what the server has.
 *
 * Three states:
 *   not configured → no credentials on the server; nothing the user can do
 *   available      → readable, and it is this user's own account
 *   shared         → readable, but the holdings belong to a demo account, NOT this user. Said plainly,
 *                    because presenting someone else's portfolio as "yours" would be a lie.
 */
export function GrowwCard({ status }: { status: GrowwStatus }) {
  const live = status.configured && status.available;

  return (
    <Card elevated style={styles.card}>
      <View style={styles.head}>
        <View style={styles.logo}>
          <Ionicons name="leaf" size={20} color={colors.brand} />
        </View>
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{status.label}</AppText>
          <AppText variant="caption" numberOfLines={1}>
            {!status.configured
              ? 'Not set up on this server'
              : status.available
                ? status.shared
                  ? 'Demo portfolio'
                  : 'Portfolio connected'
                : 'Linked to another account'}
          </AppText>
        </View>
        {live && (
          <Badge
            tone={status.shared ? 'warning' : 'success'}
            icon={status.shared ? 'flask-outline' : 'checkmark-circle'}
            label={status.shared ? 'Demo' : 'Live'}
          />
        )}
      </View>

      <AppText variant="caption" color={colors.textMuted}>
        Stocks only, read from the API key set on the server. Ask the AI about this portfolio.
        Read-only: Wariku can never place trades.
      </AppText>

      {!status.configured ? (
        <Badge tone="neutral" icon="information-circle-outline" label="Not available on this server yet" />
      ) : !status.available ? (
        // The owner gate is on: the configured Groww account belongs to someone else.
        <AppText variant="caption" color={colors.textSubtle}>
          This server&apos;s Groww account belongs to a different user, so its holdings are hidden from you.
        </AppText>
      ) : (
        <>
          {status.shared && (
            <AppText variant="caption" color={colors.warning}>
              These are sample holdings from a shared demo account, not your own.
            </AppText>
          )}
          {/* Groww exposes no mutual funds, and that is most of what people hold there. */}
          <AppText variant="caption" color={colors.textSubtle}>
            Groww&apos;s API covers stocks only, so mutual funds won&apos;t appear. Nothing to connect
            or disconnect: Groww has no sign-in flow for third-party apps.
          </AppText>
        </>
      )}
    </Card>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: spacing.md, padding: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logo: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
