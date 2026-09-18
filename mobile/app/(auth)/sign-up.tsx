/**
 * Email + password sign-up with email-code verification (Clerk Core 3 `useSignUp` API), plus Google.
 * First name is sent only when filled in (requires "First and last name" enabled in the Clerk
 * Dashboard). See docs/AUTH.md.
 */
import { useSignUp } from '@clerk/expo';
import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, CodeInput, FormError, TextField } from '@/components/ui';
import { AuthLayout, OrDivider } from '@/features/auth/AuthLayout';
import { GoogleSignInButton } from '@/features/auth/GoogleSignInButton';
import { getBannerMessage, getErrorMessage } from '@/lib/errors';
import { colors, fonts, spacing } from '@/theme';

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

  const onVerify = async (value = code) => {
    setFormError(null);
    const { error } = await signUp.verifications.verifyEmailCode({ code: value.trim() });
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
      <AuthLayout
        showBack
        hero={['Almost', 'there.']}
        title="Verify your email"
        subtitle={`Enter the 6-digit code we sent to ${email.trim()}.`}
      >
        <FormError message={formError} />
        <CodeInput value={code} onChange={setCode} onComplete={onVerify} error={errors.fields.code?.message} />
        <Button title="Verify and continue" loading={busy} disabled={code.length < 6} onPress={() => onVerify()} />
        <Button title="Resend code" variant="ghost" size="sm" disabled={busy} onPress={onResend} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      showBack
      hero={['Start your', 'money journey.']}
      title="Create your account"
      subtitle="Bite-sized lessons, smarter spending, and an AI that gets money."
    >
      <FormError message={formError ?? errors.fields.captcha?.message} />
      <TextField
        label="First name (optional)"
        icon="person-outline"
        value={firstName}
        onChangeText={setFirstName}
        textContentType="givenName"
        autoComplete="given-name"
        placeholder="What should we call you?"
        error={errors.fields.firstName?.message}
      />
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
        error={errors.fields.emailAddress?.message}
      />
      <TextField
        label="Password"
        icon="lock-closed-outline"
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
      <OrDivider label="or continue with" />
      <GoogleSignInButton onError={setFormError} />
      <View style={styles.footer}>
        <AppText variant="body" color={colors.textMuted}>
          Already have an account?
        </AppText>
        <Link href="/sign-in" dismissTo style={styles.link}>
          Sign in
        </Link>
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  link: { color: colors.primary, fontFamily: fonts.bold, fontSize: 15 },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.sm },
});
