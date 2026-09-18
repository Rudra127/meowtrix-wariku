/**
 * Email + password sign-up with email-code verification (Clerk Core 3 `useSignUp` API), plus Google.
 * First/last name are sent only when filled in — enable "First and last name" in the Clerk
 * Dashboard (User & authentication) for them to be accepted. See docs/AUTH.md.
 */
import { useSignUp } from '@clerk/expo';
import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, FormError, Screen, TextField } from '@/components/ui';
import { AuthHeader, OrDivider } from '@/features/auth/AuthHeader';
import { getBannerMessage, getErrorMessage } from '@/lib/errors';
import { GoogleSignInButton } from '@/features/auth/GoogleSignInButton';
import { colors, spacing } from '@/theme';

type Step = 'details' | 'verify-email';

export default function SignUpScreen() {
  const { signUp, errors, fetchStatus } = useSignUp();
  const [step, setStep] = useState<Step>('details');
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const busy = fetchStatus === 'fetching';

  const onSignUp = async () => {
    setFormError(null);
    const { error } = await signUp.password({
      emailAddress: email.trim(),
      password,
      ...(firstName.trim() && { firstName: firstName.trim() }),
    });
    if (error) return setFormError(getBannerMessage(error, ['emailAddress', 'password', 'firstName', 'captcha']));

    const { error: sendError } = await signUp.verifications.sendEmailCode();
    if (sendError) return setFormError(getErrorMessage(sendError));
    setStep('verify-email');
  };

  const onVerify = async () => {
    setFormError(null);
    const { error } = await signUp.verifications.verifyEmailCode({ code: code.trim() });
    if (error) return setFormError(getBannerMessage(error, ['code']));

    if (signUp.status === 'complete') {
      const { error: finalizeError } = await signUp.finalize();
      if (finalizeError) setFormError(getErrorMessage(finalizeError));
      // Success: the root layout guard switches to the app.
      return;
    }
    // e.g. Clerk is configured to require a phone number or username the app doesn't collect.
    setFormError(
      `Your email is verified, but sign-up still needs: ${signUp.missingFields.join(', ') || 'more information'}.`,
    );
  };

  const onResend = async () => {
    setFormError(null);
    const { error } = await signUp.verifications.sendEmailCode();
    if (error) setFormError(getErrorMessage(error));
  };

  if (step === 'verify-email') {
    return (
      <Screen edges={[]}>
        <AuthHeader title="Verify your email" subtitle={`Enter the 6-digit code we sent to ${email.trim()}.`} />
        <FormError message={formError} />
        <TextField
          label="Verification code"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          error={errors.fields.code?.message}
          onSubmitEditing={onVerify}
        />
        <Button title="Verify and continue" loading={busy} disabled={code.trim().length < 6} onPress={onVerify} />
        <Button title="Resend code" variant="ghost" disabled={busy} onPress={onResend} />
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      <AuthHeader title="Create your account" subtitle="Learn money skills, track spending, ask anything." />
      <FormError message={formError ?? errors.fields.captcha?.message} />
      <TextField
        label="First name (optional)"
        value={firstName}
        onChangeText={setFirstName}
        textContentType="givenName"
        autoComplete="given-name"
        error={errors.fields.firstName?.message}
      />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        placeholder="you@example.com"
        error={errors.fields.emailAddress?.message}
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword"
        autoComplete="new-password"
        placeholder="Use a long, unique password"
        error={errors.fields.password?.message}
        onSubmitEditing={onSignUp}
      />
      <Button title="Create account" loading={busy} disabled={!email.trim() || !password} onPress={onSignUp} />
      <OrDivider />
      <GoogleSignInButton onError={setFormError} />
      <View style={styles.footer}>
        <Text style={styles.muted}>Already have an account?</Text>
        <Link href="/sign-in" dismissTo style={styles.link}>
          Sign in
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  link: { color: colors.primary, fontWeight: '600', fontSize: 15 },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.md },
  muted: { color: colors.textMuted, fontSize: 15 },
});
