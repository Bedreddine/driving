import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { formatDateTime, fromWallClock, toWallClock } from '@/lib/format';
import { useTheme } from '@/lib/theme';
import { FieldShell, styles } from './ui';

// The picker works with the phone's local clock. We read the numbers the user picked
// (day, hour, minute) and interpret them as Paris time, so the booking is always in Paris time.
const toPickerDate = (iso: string) => {
  const w = toWallClock(iso);
  return new Date(w.year, w.month - 1, w.day, w.hour, w.minute);
};
const fromPickerDate = (d: Date) =>
  fromWallClock({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes() });

export function DateTimeField({ label, value, onChange }: { label: string; value: string; onChange: (iso: string) => void }) {
  const { lang, t } = useAuth();
  const [iosOpen, setIosOpen] = useState(false);
  const theme = useTheme();

  const openAndroid = () => {
    DateTimePickerAndroid.open({
      value: toPickerDate(value),
      mode: 'date',
      minimumDate: toPickerDate(new Date().toISOString()),
      onChange: (e, date) => {
        if (e.type !== 'set' || !date) return;
        DateTimePickerAndroid.open({
          value: date,
          mode: 'time',
          is24Hour: true,
          minuteInterval: 5,
          onChange: (e2, time) => {
            if (e2.type === 'set' && time) onChange(fromPickerDate(time));
          },
        });
      },
    });
  };

  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => (Platform.OS === 'android' ? openAndroid() : setIosOpen((o) => !o))}>
        <FieldShell label={`${label} (${t('parisTime')})`} floated focused={iosOpen} icon="calendar">
          <Text style={[styles.text, styles.mono, { color: theme.text, paddingTop: 24, paddingBottom: 8 }]}>{formatDateTime(value, lang)}</Text>
        </FieldShell>
      </Pressable>
      {Platform.OS === 'ios' && iosOpen ? (
        <DateTimePicker
          value={toPickerDate(value)}
          mode="datetime"
          display="inline"
          themeVariant="dark"
          accentColor={theme.primary}
          minimumDate={toPickerDate(new Date().toISOString())}
          minuteInterval={5}
          locale={lang === 'en' ? 'en-GB' : 'fr-FR'}
          onChange={(_e, date) => date && onChange(fromPickerDate(date))}
        />
      ) : null}
    </View>
  );
}
