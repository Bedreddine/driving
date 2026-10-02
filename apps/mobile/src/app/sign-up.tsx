import { Link, Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { Button, ErrorText, Field, Screen, styles, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { signUp } from '@/lib/http';
import { fonts } from '@/lib/theme';

export default function SignUp() {
  const { t, err, lang, signedIn } = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (signedIn) return <Redirect href="/" />;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signUp({ email: email.trim(), password, full_name: fullName.trim(), phone: phone.trim(), language: lang });
      router.replace('/');
    } catch (e) {
      setError(err((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen top>
      <Title>{t('signUp')}</Title>
      <Field label={t('fullName')} value={fullName} onChangeText={setFullName} autoComplete="name" />
      <Field label={t('phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
      <Field label={t('email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label={t('password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
      <ErrorText>{error}</ErrorText>
      <Button title={t('signUp')} onPress={submit} loading={busy} disabled={!fullName || !email || password.length < 8} />
      <Link href="/sign-in" style={[styles.text, { textAlign: 'center', marginTop: 12 }]}>
        <Text>
          {t('haveAccount')} <Text style={{ fontFamily: fonts.semibold }}>{t('signIn')}</Text>
        </Text>
      </Link>
    </Screen>
  );
}
