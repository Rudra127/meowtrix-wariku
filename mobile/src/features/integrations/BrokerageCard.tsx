import { Ionicons } from '@expo/vector-icons';
import { Alert, StyleSheet, View } from 'react-native';
import type { BrokerProvider, IntegrationStatus } from '@/api/types';
import { AppText, Badge, Button, Card } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';
import { useBrokerage } from './useBrokerage';

/** Per-provider description shown under the title. */
const BLURB: Record<BrokerProvider, string> = {
  upstox: 'Free to connect. The AI can then answer questions about your holdings.',
  zerodha: 'The AI can then answer questions about your Kite holdings.',
};

/**
 * One broker in the Profile "Connected accounts" section. Fully driven by its `IntegrationStatus`.
 *
 * States, each needing a different action:
 *   not configured → the server has no credentials for this broker; nothing the user can do
 *   disconnected   → offer Connect
 *   needsReauth    → linked, but the broker expires tokens daily → offer Reconnect
 */
export function BrokerageCard({ status, onMessage }: { status: IntegrationStatus; onMessage?: (message: string) => void }) {
  const broker = useBrokerage(status.provider);

  const onConnect = async () => {
    const outcome = await broker.connect();
    if (outcome.message) onMessage?.(outcome.message);
  };

  const confirmDisconnect = () =>
    Alert.alert(
      `Disconnect ${status.label}?`,
      'Wariku will stop reading your holdings. Your transactions and budgets stay as they are.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => broker.disconnect.mutate(undefined, { onSuccess: () => onMessage?.(`${status.label} disconnected.`) }),
        },
      ],
    );

  return (
    <Card elevated style={styles.card}>
      <View style={styles.head}>
        <View style={styles.logo}>
          <Ionicons name="trending-up" size={20} color={colors.primary} />
        </View>
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{status.label}</AppText>
          <AppText variant="caption" numberOfLines={1}>
            {status.connected
              ? `Connected as ${status.brokerUserName || status.brokerUserId}`
              : status.needsReauth
                ? 'Session expired'
                : 'Not connected'}
          </AppText>
        </View>
        {status.connected ? (
          <Badge tone="success" icon="checkmark-circle" label="Live" />
        ) : status.needsReauth ? (
          <Badge tone="warning" icon="refresh" label="Reconnect" />
        ) : null}
      </View>

      <AppText variant="caption" color={colors.textMuted}>
        {BLURB[status.provider]} Read-only: Wariku can never place trades.
      </AppText>

      {!status.configured ? (
        <Badge tone="neutral" icon="information-circle-outline" label="Not available on this server yet" />
      ) : status.connected ? (
        <>
          {/* Broker tokens die each morning; saying so avoids "it keeps logging me out" confusion. */}
          <AppText variant="caption" color={colors.textSubtle}>
            {status.label} ends broker sessions daily, so you&apos;ll reconnect about once a day.
          </AppText>
          <Button
            title="Disconnect"
            variant="secondary"
            size="sm"
            loading={broker.disconnect.isPending}
            onPress={confirmDisconnect}
          />
        </>
      ) : (
        <Button
          title={status.needsReauth ? `Reconnect ${status.label}` : `Connect ${status.label}`}
          size="sm"
          loading={broker.isConnecting}
          onPress={onConnect}
          icon={<Ionicons name="link-outline" size={16} color={colors.textOnPrimary} />}
        />
      )}

      {!!status.lastError && !status.connected && (
        <AppText variant="caption" color={colors.danger}>
          {status.lastError}
        </AppText>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
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
});
