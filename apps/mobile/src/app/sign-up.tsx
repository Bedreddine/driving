import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { Button, ErrorText, Field, Notice, Screen, styles, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function SignUp() {
  const { t, lang } = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim(), phone: phone.trim(), language: lang } },
    });
    setBusy(false);
    if (e) return setError(e.message);
    if (data.session) router.replace('/');
    else setDone(true);
  };

  return (
    <Screen>
      <Title>{t('signUp')}</Title>
      {done ? <Notice tone="success">{t('checkEmail')}</Notice> : null}
      <Field label={t('fullName')} value={fullName} onChangeText={setFullName} autoComplete="name" />
      <Field label={t('phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
      <Field label={t('email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label={t('password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
      <ErrorText>{error}</ErrorText>
      <Button title={t('signUp')} onPress={submit} loading={busy} disabled={!fullName || !email || password.length < 6} />
      <Link href="/sign-in" style={[styles.text, { textAlign: 'center', marginTop: 12 }]}>
        <Text>
          {t('haveAccount')} <Text style={{ fontWeight: '700' }}>{t('signIn')}</Text>
        </Text>
      </Link>
    </Screen>
  );
}
