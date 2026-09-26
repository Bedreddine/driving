import { Link, Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { Button, ErrorText, Field, Screen, styles, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { signIn } from '@/lib/http';

export default function SignIn() {
  const { t, err, signedIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (signedIn) return <Redirect href="/" />;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      router.replace('/');
    } catch (e) {
      setError(err((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>🚕 {t('appName')}</Title>
      <Field label={t('email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label={t('password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
      <ErrorText>{error}</ErrorText>
      <Button title={t('signIn')} onPress={submit} loading={busy} disabled={!email || !password} />
      <Link href="/sign-up" style={[styles.text, { textAlign: 'center', marginTop: 12 }]}>
        <Text>
          {t('noAccount')} <Text style={{ fontWeight: '700' }}>{t('signUp')}</Text>
        </Text>
      </Link>
    </Screen>
  );
}
