import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { displayName, monthLabel } from '@/lib/format';
import type { PublicRide } from '@/lib/publicApi';
import { getPublicReviews, sendReview, type PublicReview } from '@/lib/reviews';
import { fonts, useTheme } from '@/lib/theme';
import { Display, StarRating, Stars } from './scene';
import { Body, Button, ErrorText, Field, Muted, Notice, Toggle } from './ui';

const quoted = (text: string, lang: 'fr' | 'en') => (lang === 'fr' ? `« ${text} »` : `“${text}”`);

/** Approved reviews of clients who agreed to be shown. Nothing at all when there are none: no invented proof. */
export function GuestBook() {
  const { t, lang } = useAuth();
  const theme = useTheme();
  const [items, setItems] = useState<PublicReview[]>([]);

  useEffect(() => {
    void getPublicReviews()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  if (items.length === 0) return null;
  return (
    <View>
      <Display size={28}>{t('guestBookTitle')}</Display>
      <View style={{ marginTop: 12 }}>
        {items.map((r, i) => (
          <View key={i} style={{ paddingVertical: 16, borderTopWidth: 1, borderTopColor: theme.rule, gap: 6 }}>
            <Stars value={r.rating} />
            {r.comment ? (
              <Text style={{ fontFamily: fonts.displayItalic, fontSize: 21, lineHeight: 27, color: theme.text }}>{quoted(r.comment, lang)}</Text>
            ) : null}
            <Text style={{ fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 0.6, color: theme.muted, textTransform: 'uppercase' }}>
              {[r.display_name, r.city, monthLabel(r.month, lang)].filter(Boolean).join(' · ')}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * After a completed ride, on its private link: stars, a word for the driver, and the client's choice
 * to appear as a reference. Can be changed until the driver handles it.
 */
export function ReviewForm({ token, ride, onSaved }: { token: string; ride: PublicRide; onSaved: () => Promise<unknown> }) {
  const { t, err, lang } = useAuth();
  const review = ride.review;
  const [editing, setEditing] = useState(!review);
  const [rating, setRating] = useState(review?.rating ?? 0);
  const [comment, setComment] = useState(review?.comment ?? '');
  const [city, setCity] = useState(review?.city ?? '');
  const [publicly, setPublicly] = useState(review?.show_publicly ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = displayName(ride.client_name);
  const greeting = name ? t('thanksName').replace('{name}', ride.client_name ?? name) : t('thanks');
  const asShown = [name, city.trim()].filter(Boolean).join(', ');

  const submit = async () => {
    if (rating < 1) {
      setError(t('pickRating'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendReview(token, { rating, comment: comment.trim(), city: city.trim(), show_publicly: publicly });
      await onSaved();
      setEditing(false);
    } catch (e) {
      setError(err((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  if (review && !editing) {
    return (
      <View style={{ gap: 10 }}>
        <Display size={32}>{greeting}</Display>
        <Notice tone="success">
          {review.status === 'approved' ? t('reviewPublished') : review.status === 'hidden' ? t('reviewReceived') : t('reviewThanks')}
        </Notice>
        <Stars value={review.rating} />
        {review.comment ? <Body>{quoted(review.comment, lang)}</Body> : null}
        {ride.can_review ? <Button kind="secondary" icon="edit-2" title={t('editReview')} onPress={() => setEditing(true)} /> : null}
      </View>
    );
  }
  if (!ride.can_review) return null;

  return (
    <View style={{ gap: 6 }}>
      <Display size={32}>{greeting}</Display>
      <Muted>{t('howWasRide')}</Muted>
      <StarRating value={rating} onChange={setRating} label={t('yourRating')} />
      <Field label={t('reviewComment')} value={comment} onChangeText={setComment} multiline maxLength={1000} />
      <Field label={t('reviewCity')} value={city} onChangeText={setCity} maxLength={60} autoComplete="off" />
      <Toggle
        label={asShown ? t('showAsReference').replace('{name}', quoted(asShown, lang)) : t('showAsReference').replace(' ({name})', '')}
        value={publicly}
        onChange={setPublicly}
      />
      <ErrorText>{error}</ErrorText>
      <Button icon="send" title={t('sendReview')} onPress={submit} loading={busy} />
      {publicly ? <Muted>{t('reviewModerated')}</Muted> : null}
    </View>
  );
}
