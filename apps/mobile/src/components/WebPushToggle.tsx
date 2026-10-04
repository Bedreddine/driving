// "Me prévenir" on the guest ride page (website only): browser notifications when the driver sets off,
// arrives or writes. Hidden on the phone apps, in browsers without push, and when the server has it off.
import { Text, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { fonts, radius, useTheme } from '@/lib/theme';
import { useWebPush } from '@/lib/useWebPush';
import { Button, Icon } from './controls';
import { ErrorText } from './ui';

export function WebPushToggle({ token }: { token: string }) {
  const { t, err } = useAuth();
  const theme = useTheme();
  const { state, busy, error, enable, disable } = useWebPush(token);
  if (state.kind === 'hidden') return null;

  const on = state.kind === 'ready' && state.on;
  const text =
    state.kind === 'ios-install' ? t('pushIosHint') : on ? t('pushIsOn') : state.denied ? t('pushDenied') : t('pushIntro');
  return (
    <View style={{ gap: 10, padding: 14, borderRadius: radius.card, borderWidth: 1, borderColor: theme.rule, backgroundColor: theme.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ width: 32, height: 32, borderRadius: radius.sm, borderWidth: 1, borderColor: theme.rule, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={on ? 'bell' : state.kind === 'ios-install' ? 'share' : 'bell-off'} size={16} color={on ? theme.success : theme.label} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text accessibilityRole="header" style={{ fontFamily: fonts.bold, fontSize: 15.5, color: theme.text }}>
            {t('pushTitle')}
          </Text>
          <Text accessibilityLiveRegion="polite" style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: on ? theme.success : theme.muted }}>
            {text}
          </Text>
        </View>
      </View>
      {state.kind === 'ready' ? (
        on ? (
          <Button kind="ghost" size="sm" icon="bell-off" title={t('pushDisable')} loading={busy} onPress={() => void disable()} />
        ) : (
          <Button kind="secondary" icon="bell" title={t('pushEnable')} loading={busy} onPress={() => void enable()} />
        )
      ) : null}
      <ErrorText>{error ? err(error) : null}</ErrorText>
    </View>
  );
}
