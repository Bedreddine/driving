import { Link, Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { Button, ErrorText, Field, Screen, styles, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { signIn } from '@/lib/http';
import { getBusiness } from '@/lib/publicApi';
import { fonts } from '@/lib/theme';

export default function SignIn() {
  const { t, err, signedIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brand, setBrand] = useState('');

  useEffect(() => {
    void getBusiness()
      .then((b) => setBrand(b.name))
      .catch(() => undefined);
  }, []);

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
    <Screen top>
      <Text style={{ fontFamily: fonts.display, fontSize: 26, color: styles.text.color, marginBottom: 12 }}>{brand || ' '}</Text>
      <Title>{t('signIn')}</Title>
      <Field label={t('email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label={t('password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
      <ErrorText>{error}</ErrorText>
      <Button title={t('signIn')} onPress={submit} loading={busy} disabled={!email || !password} />
      <Link href="/book" style={[styles.text, { textAlign: 'center', marginTop: 4, fontFamily: fonts.semibold }]}>
        {t('bookWithoutAccount')}
      </Link>
      <Link href="/sign-up" style={[styles.text, { textAlign: 'center', marginTop: 12 }]}>
        <Text>
          {t('noAccount')} <Text style={{ fontFamily: fonts.semibold }}>{t('signUp')}</Text>
        </Text>
      </Link>
    </Screen>
  );
}
