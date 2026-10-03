import { View } from 'react-native';
import { useAuth } from '@/lib/auth';
import type { TextKey } from '@/lib/i18n';
import { REQUIRED_LEGAL } from '@/lib/legalTexts';
import type { LegalInfo } from '@/lib/publicApi';
import { Card, CardTitle, Field, Notice, Row } from './ui';

export const emptyLegal: LegalInfo = {
  company_name: null,
  legal_form: null,
  siret: null,
  vat_number: null,
  address: null,
  evtc_number: null,
  publication_director: null,
  insurance: null,
  payment_methods: null,
  mediator_name: null,
  mediator_url: null,
  host_name: null,
  host_address: null,
};

const FIELDS: { key: keyof LegalInfo; wide?: boolean; mono?: boolean; placeholder?: string }[] = [
  { key: 'company_name' },
  { key: 'legal_form', placeholder: 'SASU au capital de 1 000 €' },
  { key: 'siret', mono: true, placeholder: '123 456 789 00012' },
  { key: 'vat_number', mono: true, placeholder: 'FR12345678901' },
  { key: 'address', wide: true },
  { key: 'evtc_number', mono: true, placeholder: 'EVTC075…' },
  { key: 'publication_director' },
  { key: 'insurance', wide: true },
  { key: 'payment_methods', placeholder: 'Carte bancaire, espèces' },
  { key: 'mediator_name' },
  { key: 'mediator_url', placeholder: 'https://' },
  { key: 'host_name', placeholder: 'Oracle Cloud / Hetzner…' },
  { key: 'host_address', wide: true },
];

/** The company details the legal pages need (saved with the page's "Save"). */
export function LegalEditor({ legal, onChange }: { legal: LegalInfo; onChange: (l: LegalInfo) => void }) {
  const { t } = useAuth();
  const missing = REQUIRED_LEGAL.filter((k) => !legal[k]?.trim());
  return (
    <Card>
      <CardTitle icon="file-text" help={t('legalHelp')}>
        {t('legalTitle')}
      </CardTitle>
      {missing.length ? <Notice tone="warning">{t('legalMissing').replace('{fields}', missing.map((k) => t(`legal_${k}` as TextKey)).join(', '))}</Notice> : null}
      <Row style={{ gap: 12, flexWrap: 'wrap' }}>
        {FIELDS.map((f) => (
          <View key={f.key} style={{ flexBasis: f.wide ? '100%' : 240, flexGrow: 1 }}>
            <Field
              label={t(`legal_${f.key}` as TextKey)}
              value={legal[f.key] ?? ''}
              onChangeText={(v) => onChange({ ...legal, [f.key]: v })}
              mono={f.mono}
              placeholder={f.placeholder}
              autoCapitalize={f.key === 'mediator_url' ? 'none' : 'sentences'}
              maxLength={f.key === 'address' || f.key === 'mediator_url' ? 300 : 200}
            />
          </View>
        ))}
      </Row>
    </Card>
  );
}
