import { createElement } from 'react';
import { View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { fromWallClock, toWallClock } from '@/lib/format';
import { Label, styles } from './ui';

const pad = (n: number) => String(n).padStart(2, '0');

// Browser version: a native <input type="datetime-local">, read as Paris time.
export function DateTimeField({ label, value, onChange }: { label: string; value: string; onChange: (iso: string) => void }) {
  const { t } = useAuth();
  const w = toWallClock(value);
  const inputValue = `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;

  return (
    <View style={styles.field}>
      <Label>
        {label} ({t('parisTime')})
      </Label>
      {createElement('input', {
        type: 'datetime-local',
        value: inputValue,
        step: 300,
        style: { padding: 12, fontSize: 16, borderRadius: 10, border: '1px solid #E2E2E0', fontFamily: 'inherit' },
        onChange: (e: { target: { value: string } }) => {
          const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(e.target.value);
          if (!m) return;
          onChange(fromWallClock({ year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5] }));
        },
      })}
    </View>
  );
}
