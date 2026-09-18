import { useAuth, useClerk, useUser } from '@clerk/expo';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Switch, View } from 'react-native';
import { usersApi } from '@/api/endpoints';
import { queryKeys } from '@/api/queryClient';
import type { Goal, Level, User } from '@/api/types';
import { useApi } from '@/api/useApi';
import { AppText, Avatar, Badge, Button, Card, FormError, PressableScale, Screen, SectionHeader, Sheet } from '@/components/ui';
import { API_URL } from '@/config/env';
import { useLearnerStats } from '@/features/learn/useLearn';
import { GOAL_OPTIONS, LEVEL_OPTIONS } from '@/features/onboarding/options';
import { OptionCard } from '@/features/onboarding/OptionCard';
import { usePersonalization } from '@/features/onboarding/usePersonalization';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { getErrorMessage } from '@/lib/errors';
import { currencySymbol } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';
import { SettingsRow } from './SettingsRow';

const CURRENCIES = [
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
];

export function ProfileScreen() {
  const { user } = useUser(); // identity, straight from Clerk
  const { signOut } = useClerk();
  const { userId } = useAuth();
  const backendUser = useCurrentUser(); // our Mongo record, via the backend
  const api = useApi();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [notifications, setNotifications] = useState(true); // placeholder until push is wired
  const [editing, setEditing] = useState<'level' | 'goal' | null>(null);
  const { level, plan } = usePersonalization();
  const learnStats = useLearnerStats().data;
  const streakDays = learnStats?.streakDays ?? 0;
  const totalXp = learnStats?.xp ?? 0;
  const badges = learnStats?.badges ?? 0;

  const updatePlan = useMutation({
    mutationFn: (updates: { level?: Level; goal?: Goal }) => usersApi.updateMe(api, updates),
    onSuccess: ({ user: updated }: { user: User }) => {
      queryClient.setQueryData([...queryKeys.me, userId], updated); // every tab re-personalises instantly
      setEditing(null);
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const updateCurrency = useMutation({
    mutationFn: (currency: string) => usersApi.updateMe(api, { currency }),
    onSuccess: ({ user: updated }: { user: User }) => {
      queryClient.setQueryData([...queryKeys.me, userId], updated);
      setCurrencyOpen(false);
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const deleteAccount = useMutation({
    mutationFn: () => usersApi.deleteMe(api),
    // Clerk has already revoked the session server-side; clear it locally too.
    onSuccess: () => signOut().catch(() => {}),
    onError: (err) => setError(getErrorMessage(err)),
  });

  const confirmDelete = () =>
    Alert.alert('Delete account?', 'This permanently deletes your account and all your data.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteAccount.mutate() },
    ]);

  const onSignOut = async () => {
    setError(null);
    try {
      await signOut(); // root layout guard returns to sign-in
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const name = user?.fullName || user?.firstName || 'Wariku learner';
  const currency = backendUser.data?.currency ?? 'INR';

  return (
    <Screen tabBarSpace>
      <AppText variant="title">Profile</AppText>

      <View style={styles.hero}>
        <View style={[styles.ring, { width: 240, height: 240, right: -90, top: -120 }]} />
        <View style={styles.heroTop}>
          <Avatar name={name} imageUrl={user?.imageUrl} size={64} />
          <View style={styles.flex}>
            <AppText variant="heading" color={colors.textOnPrimary} numberOfLines={1}>
              {name}
            </AppText>
            <AppText variant="caption" color={colors.textOnPrimaryMuted} numberOfLines={1}>
              {user?.primaryEmailAddress?.emailAddress}
            </AppText>
          </View>
        </View>
        <View style={styles.heroStats}>
          <HeroStat icon="flame" value={`${streakDays}`} label="Day streak" />
          <View style={styles.divider} />
          <HeroStat icon="flash" value={`${totalXp}`} label="Total XP" />
          <View style={styles.divider} />
          <HeroStat icon="ribbon" value={`${badges}`} label="Badges" />
        </View>
      </View>

      <FormError message={error} />

      <SectionHeader title="Your plan" />
      <Card elevated style={styles.list}>
        <SettingsRow icon={plan.icon} label="Main goal" value={plan.label} onPress={() => setEditing('goal')} />
        <SettingsRow icon={level.icon} label="Experience level" value={level.label} onPress={() => setEditing('level')} />
      </Card>

      <SectionHeader title="Preferences" />
      <Card elevated style={styles.list}>
        <SettingsRow icon="cash-outline" label="Currency" value={`${currency} ${currencySymbol(currency).trim()}`} onPress={() => setCurrencyOpen(true)} />
        <SettingsRow
          icon="notifications-outline"
          label="Notifications"
          right={
            <Switch
              value={notifications}
              onValueChange={setNotifications}
              trackColor={{ true: colors.primary, false: colors.surfaceMuted }}
              thumbColor={colors.surface}
            />
          }
        />
      </Card>

      <SectionHeader title="Account" />
      <Card elevated style={styles.list}>
        <SettingsRow
          icon="server-outline"
          label="Backend"
          onPress={() => backendUser.refetch()}
          right={
            backendUser.isPending || backendUser.isFetching ? (
              <ActivityIndicator color={colors.primary} />
            ) : backendUser.isError ? (
              <Badge tone="danger" icon="close-circle" label="Offline" />
            ) : (
              <Badge tone="success" icon="checkmark-circle" label="Connected" />
            )
          }
        />
        {backendUser.isError && (
          <AppText variant="caption" color={colors.danger}>
            {getErrorMessage(backendUser.error)} · {API_URL}
          </AppText>
        )}
        <SettingsRow icon="shield-checkmark-outline" label="Signed in with" value={user?.externalAccounts?.length ? 'Google' : 'Email'} />
        <SettingsRow icon="trash-outline" label="Delete account" tone="danger" onPress={confirmDelete} />
      </Card>

      <Button title="Sign out" variant="secondary" loading={deleteAccount.isPending} onPress={onSignOut} icon={<Ionicons name="log-out-outline" size={18} color={colors.text} />} />
      <AppText variant="caption" center color={colors.textSubtle}>
        Wariku v{Constants.expoConfig?.version ?? '1.0.0'}
      </AppText>

      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={editing === 'goal' ? 'Main goal' : 'Experience level'}>
        <View style={styles.currencyList}>
          {editing === 'level' &&
            LEVEL_OPTIONS.map((o) => (
              <OptionCard key={o.value} {...o} selected={o.value === level.value} onPress={() => updatePlan.mutate({ level: o.value })} />
            ))}
          {editing === 'goal' &&
            GOAL_OPTIONS.map((o) => (
              <OptionCard
                key={o.value}
                icon={o.icon}
                label={o.label}
                description={o.description}
                selected={o.value === plan.value}
                onPress={() => updatePlan.mutate({ goal: o.value })}
              />
            ))}
          {updatePlan.isPending && <ActivityIndicator color={colors.primary} />}
        </View>
      </Sheet>

      <Sheet visible={currencyOpen} onClose={() => setCurrencyOpen(false)} title="Currency">
        <View style={styles.currencyList}>
          {CURRENCIES.map((c) => {
            const active = c.code === currency;
            return (
              <PressableScale
                key={c.code}
                onPress={() => !active && updateCurrency.mutate(c.code)}
                disabled={updateCurrency.isPending}
                style={[styles.currency, active && styles.currencyActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <View style={[styles.currencySymbol, active && styles.currencySymbolActive]}>
                  <AppText variant="bodyStrong" color={active ? colors.primary : colors.text}>
                    {currencySymbol(c.code).trim()}
                  </AppText>
                </View>
                <View style={styles.flex}>
                  <AppText variant="bodyStrong">{c.code}</AppText>
                  <AppText variant="caption">{c.name}</AppText>
                </View>
                {updateCurrency.isPending && updateCurrency.variables === c.code ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  active && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                )}
              </PressableScale>
            );
          })}
        </View>
      </Sheet>
    </Screen>
  );
}

function HeroStat({ icon, value, label }: { icon: React.ComponentProps<typeof Ionicons>['name']; value: string; label: string }) {
  return (
    <View style={styles.heroStat}>
      <View style={styles.heroStatValue}>
        <Ionicons name={icon} size={14} color={colors.accent} />
        <AppText variant="heading" color={colors.textOnPrimary}>
          {value}
        </AppText>
      </View>
      <AppText variant="caption" color={colors.textOnPrimaryMuted}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { backgroundColor: colors.primary, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.xl, overflow: 'hidden' },
  ring: { position: 'absolute', borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(200,241,105,0.16)' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  heroStats: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
  },
  heroStat: { flex: 1, alignItems: 'center', gap: 2 },
  heroStatValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  divider: { width: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginVertical: spacing.xs },
  list: { paddingVertical: spacing.xs, gap: 0 },
  currencyList: { gap: spacing.sm },
  currency: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  currencyActive: { borderColor: colors.primary, backgroundColor: colors.accentSoft },
  currencySymbol: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currencySymbolActive: { backgroundColor: colors.accent },
});
