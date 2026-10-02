import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stars } from '@/components/scene';
import { Body, Button, Card, ErrorText, Muted, Row, Segmented, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { type AdminReview, approveReview, hideReview, listReviews, type ReviewStatus } from '@/lib/reviews';
import { fonts } from '@/lib/theme';

/** Reviews left by clients after their ride: only the ones published here appear on the booking page. */
export default function AdminReviews() {
  const { t, err, lang } = useAuth();
  const [status, setStatus] = useState<ReviewStatus>('pending');
  const [reviews, setReviews] = useState<AdminReview[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      listReviews(status)
        .then(setReviews)
        .catch((e) => setError(err((e as Error).message))),
    [status, err],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, fn: (id: string) => Promise<void>) => {
    setBusy(id);
    setError(null);
    try {
      await fn(id);
      await load();
    } catch (e) {
      setError(err((e as Error).message));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 12, maxWidth: 820 }}>
      <Title>{t('reviews')}</Title>
      <Segmented
        value={status}
        onChange={(s) => {
          setReviews(null);
          setStatus(s);
        }}
        options={(['pending', 'approved', 'hidden'] as const).map((s) => ({ value: s, label: t(`reviewStatus_${s}`) }))}
      />
      <ErrorText>{error}</ErrorText>
      {reviews?.length === 0 ? <Muted>{t('noReviews')}</Muted> : null}
      {reviews?.map((r) => (
        <Card key={r.id}>
          <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <Body style={{ fontFamily: fonts.semibold }}>
              {r.client_name}
              {r.city ? ` · ${r.city}` : ''}
            </Body>
            <Stars value={r.rating} />
          </Row>
          {r.comment ? <Body style={{ fontFamily: fonts.displayItalic, fontSize: 19, lineHeight: 26 }}>{r.comment}</Body> : null}
          <Muted>
            {r.show_publicly ? `${t('publicReview')} (« ${[r.display_name, r.city].filter(Boolean).join(', ')} »)` : t('privateReview')}
          </Muted>
          <Muted style={{ fontFamily: fonts.mono, fontSize: 12 }}>{formatDateTime(r.pickup_at, lang)}</Muted>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
            {r.status !== 'approved' ? (
              <Button title={t('approve')} loading={busy === r.id} onPress={() => act(r.id, approveReview)} style={{ flex: 1 }} />
            ) : null}
            {r.status !== 'hidden' ? (
              <Button kind="secondary" title={t('hide')} loading={busy === r.id} onPress={() => act(r.id, hideReview)} style={{ flex: 1 }} />
            ) : null}
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}
