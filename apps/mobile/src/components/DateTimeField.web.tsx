import { createElement, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { fromWallClock, toWallClock } from '@/lib/format';
import { fonts, useTheme } from '@/lib/theme';
import { FieldShell } from './ui';

const pad = (n: number) => String(n).padStart(2, '0');

// Browser version: a native <input type="datetime-local">, read as Paris time.
export function DateTimeField({ label, value, onChange }: { label: string; value: string; onChange: (iso: string) => void }) {
  const { t } = useAuth();
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const w = toWallClock(value);
  const inputValue = `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;

  return (
    <FieldShell label={`${label} (${t('parisTime')})`} floated focused={focused} icon="calendar">
      {createElement('input', {
        type: 'datetime-local',
        value: inputValue,
        step: 300,
        'aria-label': label,
        onFocus: () => setFocused(true),
        onBlur: () => setFocused(false),
        style: {
          width: '100%',
          padding: '24px 0 8px',
          fontSize: 16,
          border: 0,
          outline: 'none',
          background: 'transparent',
          color: theme.text,
          colorScheme: 'dark',
          fontFamily: fonts.mono,
          fontVariantNumeric: 'tabular-nums',
        },
        onChange: (e: { target: { value: string } }) => {
          const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(e.target.value);
          if (!m) return;
          onChange(fromWallClock({ year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5] }));
        },
      })}
    </FieldShell>
  );
}
