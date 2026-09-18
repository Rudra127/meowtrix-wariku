/**
 * Email + password sign-in (Clerk Core 3 `useSignIn` API) with:
 *  - email-code second step for "new device" checks (`needs_client_trust`) and email MFA
 *  - Google SSO
 * On success we only call `finalize()`; the root layout's guard moves the user into the app.
 */
import { useSignIn } from '@clerk/expo';
import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, CodeInput, FormError, TextField } from '@/components/ui';
import { AuthLayout, OrDivider } from '@/features/auth/AuthLayout';
import { GoogleSignInButton } from '@/features/auth/GoogleSignInButton';
import { getBannerMessage, getErrorMessage } from '@/lib/errors';
import { colors, fonts, spacing } from '@/theme';

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

  const onVerifyCode = async (value = code) => {
    setFormError(null);
    const { error } = await signIn.mfa.verifyEmailCode({ code: value.trim() });
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
      <AuthLayout
        hero={['Quick check,', "it's you."]}
        title="Check your email"
        subtitle={`New device detected. Enter the 6-digit code we sent to ${email.trim()}.`}
      >
        <FormError message={formError} />
        <CodeInput value={code} onChange={setCode} onComplete={onVerifyCode} error={errors.fields.code?.message} />
        <Button title="Verify" loading={busy} disabled={code.length < 6} onPress={() => onVerifyCode()} />
        <View style={styles.row}>
          <Button title="Resend code" variant="ghost" size="sm" disabled={busy} onPress={onResendCode} />
          <Button title="Use another account" variant="ghost" size="sm" disabled={busy} onPress={onStartOver} />
        </View>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout hero={['Money skills,', 'made simple.']} title="Welcome back" subtitle="Sign in to continue your streak.">
      <FormError message={formError} />
      <TextField
        label="Email"
        icon="mail-outline"
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
        icon="lock-closed-outline"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        autoComplete="current-password"
        placeholder="Your password"
        error={errors.fields.password?.message}
        onSubmitEditing={onSignIn}
      />
      <Link href="/forgot-password" style={styles.forgot}>
        Forgot password?
      </Link>
      <Button title="Sign in" loading={busy} disabled={!email.trim() || !password} onPress={onSignIn} />
      <OrDivider label="or continue with" />
      <GoogleSignInButton onError={setFormError} />
      <View style={styles.footer}>
        <AppText variant="body" color={colors.textMuted}>
          New to Wariku?
        </AppText>
        <Link href="/sign-up" style={styles.link}>
          Create an account
        </Link>
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  forgot: { alignSelf: 'flex-end', color: colors.primary, fontFamily: fonts.bold, fontSize: 14, marginTop: -spacing.xs },
  link: { color: colors.primary, fontFamily: fonts.bold, fontSize: 15 },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
});
