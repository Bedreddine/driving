import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Button, ErrorText, Field, Label, Notice, Screen, Segmented } from '@/components/ui';
import { deleteMyAccount } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirmAsk } from '@/lib/confirm';
import type { Lang } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

export default function Account() {
  const { profile } = useAuth();
  // Remount the form when the profile arrives, so its fields start from the saved values.
  return <AccountForm key={profile?.id ?? 'loading'} />;
}

function AccountForm() {
  const { t, err, lang, profile, setLanguage, signOut, reloadProfile } = useAuth();
  const router = useRouter();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!profile) return;
    const { error: e } = await supabase
      .from('profiles')
      .update({ full_name: name.trim(), phone: phone.trim() || null })
      .eq('id', profile.id);
    if (e) return setError(err('generic'));
    setSaved(true);
    await reloadProfile();
  };

  const remove = async () => {
    if (!(await confirmAsk(t('deleteAccountConfirm'), t('delete'), t('back')))) return;
    setBusy(true);
    try {
      await deleteMyAccount();
      await signOut();
      router.replace('/sign-in');
    } catch (e) {
      setError(err((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Label>{t('language')}</Label>
      <Segmented<Lang>
        options={[
          { value: 'fr', label: 'Français' },
          { value: 'en', label: 'English' },
        ]}
        value={lang}
        onChange={(l) => void setLanguage(l)}
      />
      <Field label={t('fullName')} value={name} onChangeText={(v) => (setName(v), setSaved(false))} />
      <Field label={t('phone')} value={phone} onChangeText={(v) => (setPhone(v), setSaved(false))} keyboardType="phone-pad" />
      {saved ? <Notice tone="success">{t('saved')}</Notice> : null}
      <Button title={t('save')} onPress={save} />
      <ErrorText>{error}</ErrorText>
      <Button kind="secondary" title={t('signOut')} onPress={() => void signOut().then(() => router.replace('/sign-in'))} />
      <Button kind="danger" title={t('deleteAccount')} onPress={remove} loading={busy} />
    </Screen>
  );
}
