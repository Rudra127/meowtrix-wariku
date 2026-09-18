import { useClerk, useUser } from '@clerk/expo';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, View } from 'react-native';
import { usersApi } from '@/api/endpoints';
import { useApi } from '@/api/useApi';
import { Button, Card, FormError, Screen } from '@/components/ui';
import { API_URL } from '@/config/env';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { getErrorMessage } from '@/lib/errors';
import { colors, spacing, typography } from '@/theme';

export default function ProfileScreen() {
  const { user } = useUser(); // identity, straight from Clerk
  const { signOut } = useClerk();
  const backendUser = useCurrentUser(); // our Mongo record, via the backend
  const api = useApi();
  const [error, setError] = useState<string | null>(null);

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

  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Wariku learner';

  return (
    <Screen>
      <View style={styles.hero}>
        {user?.imageUrl ? <Image source={{ uri: user.imageUrl }} style={styles.avatar} /> : null}
        <Text style={typography.heading}>{name}</Text>
        <Text style={styles.muted}>{user?.primaryEmailAddress?.emailAddress}</Text>
      </View>

      <FormError message={error} />

      <Card>
        <Text style={styles.cardTitle}>Backend connection</Text>
        {backendUser.isPending ? (
          <ActivityIndicator color={colors.primary} />
        ) : backendUser.isError ? (
          <>
            <Status ok={false} label={getErrorMessage(backendUser.error)} />
            <Text style={styles.small}>API: {API_URL}</Text>
            <Button title="Retry" variant="secondary" onPress={() => backendUser.refetch()} />
          </>
        ) : (
          <>
            <Status ok label="Connected and authenticated" />
            <Row label="User ID" value={backendUser.data.id} />
            <Row label="Currency" value={backendUser.data.currency} />
            <Row label="Role" value={backendUser.data.role} />
          </>
        )}
      </Card>

      <Button title="Sign out" variant="secondary" onPress={onSignOut} />
      <Button
        title="Delete account"
        variant="danger"
        loading={deleteAccount.isPending}
        onPress={confirmDelete}
      />
    </Screen>
  );
}

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: ok ? colors.success : colors.danger }]} />
      <Text style={[typography.body, styles.flex]}>{label}</Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={[typography.body, styles.flex, styles.right]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg },
  avatar: { width: 80, height: 80, borderRadius: 40, marginBottom: spacing.sm },
  muted: { color: colors.textMuted, fontSize: 15 },
  small: { color: colors.textMuted, fontSize: 12 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  flex: { flex: 1 },
  right: { textAlign: 'right' },
});
