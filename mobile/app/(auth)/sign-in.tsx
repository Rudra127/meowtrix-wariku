/**
 * Email + password sign-in (Clerk Core 3 `useSignIn` API) with:
 *  - email-code second step for "new device" checks (`needs_client_trust`) and email MFA
 *  - Google SSO
 * On success we only call `finalize()`; the root layout's guard moves the user into the app.
 */
import { useSignIn } from '@clerk/expo';
import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, FormError, Screen, TextField } from '@/components/ui';
import { AuthHeader, OrDivider } from '@/features/auth/AuthHeader';
import { getBannerMessage, getErrorMessage } from '@/lib/errors';
import { GoogleSignInButton } from '@/features/auth/GoogleSignInButton';
import { colors, spacing } from '@/theme';

type Step = 'credentials' | 'email-code';

export default function SignInScreen() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const busy = fetchStatus === 'fetching';

  /** Decides what to do after any sign-in step based on Clerk's status. */
  const continueFlow = async () => {
    switch (signIn.status) {
      case 'complete': {
        const { error } = await signIn.finalize();
        if (error) setFormError(getErrorMessage(error));
        return;
      }
      case 'needs_client_trust':
      case 'needs_second_factor': {
        const supportsEmailCode = signIn.supportedSecondFactors.some((f) => f.strategy === 'email_code');
        if (!supportsEmailCode) {
          setFormError('This account requires a verification method the app does not support yet.');
          return;
        }
        const { error } = await signIn.mfa.sendEmailCode();
        if (error) return setFormError(getErrorMessage(error));
        setStep('email-code');
        return;
      }
      default:
        setFormError(`Sign-in could not be completed (status: ${signIn.status}).`);
    }
  };

  const onSignIn = async () => {
    setFormError(null);
    const { error } = await signIn.password({ emailAddress: email.trim(), password });
    // Field errors render inline via `errors.fields`; anything else goes in the banner.
    if (error) return setFormError(getBannerMessage(error, ['identifier', 'password']));
    await continueFlow();
  };

  const onVerifyCode = async () => {
    setFormError(null);
    const { error } = await signIn.mfa.verifyEmailCode({ code: code.trim() });
    if (error) return setFormError(getBannerMessage(error, ['code']));
    await continueFlow();
  };

  const onResendCode = async () => {
    setFormError(null);
    const { error } = await signIn.mfa.sendEmailCode();
    if (error) setFormError(getErrorMessage(error));
  };

  const onStartOver = async () => {
    await signIn.reset();
    setCode('');
    setFormError(null);
    setStep('credentials');
  };

  if (step === 'email-code') {
    return (
      <Screen>
        <AuthHeader title="Check your email" subtitle={`We sent a 6-digit code to ${email.trim()}.`} />
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
          onSubmitEditing={onVerifyCode}
        />
        <Button title="Verify" loading={busy} disabled={code.trim().length < 6} onPress={onVerifyCode} />
        <Button title="Resend code" variant="ghost" disabled={busy} onPress={onResendCode} />
        <Button title="Use a different account" variant="ghost" disabled={busy} onPress={onStartOver} />
      </Screen>
    );
  }

  return (
    <Screen>
      <AuthHeader title="Welcome back" subtitle="Sign in to keep learning and tracking your money." />
      <FormError message={formError} />
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
        error={errors.fields.identifier?.message}
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        autoComplete="current-password"
        error={errors.fields.password?.message}
        onSubmitEditing={onSignIn}
      />
      <Link href="/forgot-password" style={styles.link}>
        Forgot password?
      </Link>
      <Button title="Sign in" loading={busy} disabled={!email.trim() || !password} onPress={onSignIn} />
      <OrDivider />
      <GoogleSignInButton onError={setFormError} />
      <View style={styles.footer}>
        <Text style={styles.muted}>New to Wariku?</Text>
        <Link href="/sign-up" style={styles.link}>
          Create an account
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
