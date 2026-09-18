/**
 * Password reset via emailed code (Clerk Core 3 `signIn.resetPasswordEmailCode`).
 * After a successful reset the user is signed in; other sessions are signed out.
 */
import { useSignIn } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Button, FormError, Screen, TextField } from '@/components/ui';
import { AuthHeader } from '@/features/auth/AuthHeader';
import { getBannerMessage, getErrorMessage } from '@/lib/errors';

type Step = 'email' | 'reset';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { signIn, errors, fetchStatus } = useSignIn();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const busy = fetchStatus === 'fetching';

  const onSendCode = async () => {
    setFormError(null);
    const { error } = await signIn.create({ identifier: email.trim() });
    if (error) return setFormError(getBannerMessage(error, ['identifier']));
    const { error: sendError } = await signIn.resetPasswordEmailCode.sendCode();
    if (sendError) return setFormError(getErrorMessage(sendError));
    setStep('reset');
  };

  const onReset = async () => {
    setFormError(null);
    const { error } = await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() });
    if (error) return setFormError(getBannerMessage(error, ['code']));

    const { error: pwError } = await signIn.resetPasswordEmailCode.submitPassword({
      password,
      signOutOfOtherSessions: true,
    });
    if (pwError) return setFormError(getBannerMessage(pwError, ['password']));

    if (signIn.status === 'complete') {
      const { error: finalizeError } = await signIn.finalize();
      if (finalizeError) setFormError(getErrorMessage(finalizeError));
      return; // root layout guard takes over
    }
    // Password changed, but this device still needs a second step — send them to normal sign-in.
    await signIn.reset();
    router.dismissTo('/sign-in');
  };

  if (step === 'reset') {
    return (
      <Screen edges={[]}>
        <AuthHeader title="Set a new password" subtitle={`Enter the code sent to ${email.trim()}.`} />
        <FormError message={formError} />
        <TextField
          label="Reset code"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          error={errors.fields.code?.message}
        />
        <TextField
          label="New password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          error={errors.fields.password?.message}
          onSubmitEditing={onReset}
        />
        <Button
          title="Reset password"
          loading={busy}
          disabled={code.trim().length < 6 || !password}
          onPress={onReset}
        />
        <Button title="Resend code" variant="ghost" disabled={busy} onPress={onSendCode} />
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      <AuthHeader title="Forgot password?" subtitle="We'll email you a code to reset it." />
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
        autoFocus
        error={errors.fields.identifier?.message}
        onSubmitEditing={onSendCode}
      />
      <Button title="Send reset code" loading={busy} disabled={!email.trim()} onPress={onSendCode} />
    </Screen>
  );
}
