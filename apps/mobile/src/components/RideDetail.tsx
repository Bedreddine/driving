import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import * as api from '@/lib/api';
import type { Ride } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirmAsk } from '@/lib/confirm';
import { formatDateTime, formatKm, formatMinutes, formatPrice, parsePrice } from '@/lib/format';
import { type BusinessInfo, getBusiness } from '@/lib/publicApi';
import { useNow } from '@/lib/useNow';
import { phoneDigits } from '@/lib/validate';
import { whatsappMessage, whatsappUrl } from '@/lib/whatsapp';
import { chatOpen } from '@/lib/chat';
import { subscribeRideMessages } from '@/lib/liveUpdates';
import { ChatPanel } from './ChatPanel';
import { LiveShare } from './LiveShare';
import { DriverMoments } from './Moments';
import { MapScene } from './map/MapScene';
import { StatusBadge } from './RideCard';
import { Button, Card, colors, ErrorText, Field, Label, Muted, Row, styles } from './ui';
import { fonts, radius } from '@/lib/theme';

type Props = { ride: Ride; as: 'customer' | 'driver'; onChanged: () => void; licence?: 'vtc' | 'taxi' };

function openNavigation(lat: number, lng: number) {
  const url =
    Platform.OS === 'ios'
      ? `maps:?daddr=${lat},${lng}`
      : Platform.OS === 'android'
        ? `geo:${lat},${lng}?q=${lat},${lng}`
        : `https://www.openstreetmap.org/directions?to=${lat}%2C${lng}`;
  void Linking.openURL(url);
}

export function RideDetail({ ride, as, onChanged, licence = 'vtc' }: Props) {
  const { t, err, lang } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [price, setPrice] = useState('');
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'none' | 'propose' | 'complete' | 'cancel' | 'decline'>('none');
  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  // A schedule warning the driver may override ("I know a shortcut"): which action to retry.
  const [warning, setWarning] = useState<{ code: string; retry: () => Promise<void> } | null>(null);
  // After "on the way": suggest sharing the live position if it is not on yet.
  const [nudgeShare, setNudgeShare] = useState(false);
  const rideId = ride.id;
  const loadMessages = useCallback(() => api.getRideMessages(rideId), [rideId]);
  const sendMessage = useCallback((body: string) => api.sendRideMessage(rideId, body), [rideId]);
  const onRideMessage = useCallback((reload: () => void) => subscribeRideMessages(rideId, reload), [rideId]);

  useEffect(() => {
    if (as === 'driver') void getBusiness().then(setBusiness).catch(() => undefined);
  }, [as]);

  const now = useNow();
  const pickup = new Date(ride.pickup_at).getTime();
  const canClose = now >= pickup;
  const canNoShow = now >= pickup + ride.pickup_allowance_min * 60_000;

  const run = async (name: string, fn: () => Promise<void>, overridable?: () => Promise<void>) => {
    setBusy(name);
    setError(null);
    setWarning(null);
    try {
      await fn();
      setMode('none');
      setPrice('');
      setReason('');
      onChanged();
    } catch (e) {
      const code = (e as Error).message;
      if (overridable && (code === 'TIGHT_SCHEDULE' || code === 'DRIVER_UNAVAILABLE')) {
        setWarning({ code, retry: overridable });
      } else {
        setError(err(code));
      }
    } finally {
      setBusy(null);
    }
  };

  const withPrice = (fn: (p: number, override: boolean) => Promise<void>) => () => {
    const p = parsePrice(price);
    if (p === null) {
      setError(err('BAD_INPUT'));
      return;
    }
    void run('price', () => fn(p, false), () => fn(p, true));
  };

  return (
    <View style={{ gap: 12 }}>
      <MapScene
        style={{ height: 220, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border }}
        mode="trip"
        pickup={[ride.pickup_lng, ride.pickup_lat]}
        dropoff={[ride.dropoff_lng, ride.dropoff_lat]}
        route={ride.route ?? [[ride.pickup_lng, ride.pickup_lat], [ride.dropoff_lng, ride.dropoff_lat]]}
        padding={{ top: 30, bottom: 30, left: 30, right: 30 }}
      />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={[styles.text, { fontFamily: fonts.semibold, fontSize: 18 }]}>{formatDateTime(ride.pickup_at, lang)}</Text>
          <StatusBadge status={ride.status} />
        </Row>
        <Label>{t('from')}</Label>
        <Text style={styles.text}>{ride.pickup_address}</Text>
        <Label>{t('to')}</Label>
        <Text style={styles.text}>{ride.dropoff_address}</Text>
        <Muted>
          {formatKm(ride.distance_m, lang)} · {formatMinutes(ride.duration_s)} · {ride.passengers} {t('passengersShort')} · {ride.luggage} {t('luggageShort')} ·{' '}
          {t(ride.vehicle)}
          {ride.meet_greet ? ` · ${t('meetGreet')}` : ''}
        </Muted>
        {ride.travel_ref ? <Muted>{`${t('travelRef')}: ${ride.travel_ref}`}</Muted> : null}
        {ride.customer_notes ? <Muted>{`${t('notes')}: ${ride.customer_notes}`}</Muted> : null}
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={styles.text}>{ride.is_fixed_price ? t('fixedPrice') : t('estimate')}</Text>
          <Text style={styles.text}>{formatPrice(ride.estimated_price, ride.currency, lang)}</Text>
        </Row>
        {ride.proposed_price !== null ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={styles.text}>{t('proposedPrice')}</Text>
            <Text style={[styles.text, { fontFamily: fonts.semibold }]}>{formatPrice(ride.proposed_price, ride.currency, lang)}</Text>
          </Row>
        ) : null}
        {ride.agreed_price !== null ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={styles.text}>{t('agreedPrice')}</Text>
            <Text style={[styles.text, { fontFamily: fonts.semibold }]}>{formatPrice(ride.agreed_price, ride.currency, lang)}</Text>
          </Row>
        ) : null}
        {ride.final_price !== null ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={styles.text}>{t('finalPrice')}</Text>
            <Text style={[styles.text, { fontFamily: fonts.semibold }]}>{formatPrice(ride.final_price, ride.currency, lang)}</Text>
          </Row>
        ) : null}
        {ride.answer_deadline && (as === 'driver' || ride.status === 'price_proposed') ? (
          <Muted>{`${t('answerBefore')} ${formatDateTime(ride.answer_deadline, lang)}`}</Muted>
        ) : null}
        {ride.cancel_reason ? <Muted>{`${t('reason')}: ${ride.cancel_reason}`}</Muted> : null}
      </Card>

      {as === 'driver' && ride.contact ? (
        <Card>
          <Label>{t('customer')}</Label>
          <Text style={[styles.text, { fontWeight: '600' }]}>{ride.contact.full_name}</Text>
          {ride.contact.phone ? <Muted>{ride.contact.phone}</Muted> : null}
          <Row style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            {ride.contact.phone ? (
              <Button kind="secondary" title={t('call')} onPress={() => void Linking.openURL(`tel:${ride.contact!.phone}`)} />
            ) : null}
            {phoneDigits(ride.contact.phone) ? (
              <Button
                kind="secondary"
                title={t('sendWhatsApp')}
                onPress={() => void Linking.openURL(whatsappUrl(ride.contact!.phone!, whatsappMessage(ride, business)))}
              />
            ) : null}
            <Button kind="secondary" title="GPS" onPress={() => openNavigation(ride.pickup_lat, ride.pickup_lng)} />
          </Row>
        </Card>
      ) : null}

      <ErrorText>{error}</ErrorText>
      {warning ? (
        <Card style={{ borderColor: colors.warning, borderWidth: 2 }}>
          <Text style={styles.text}>⚠ {err(warning.code)}</Text>
          <Button
            kind="secondary"
            title={t('overrideConfirm')}
            loading={busy === 'override'}
            onPress={() => {
              const retry = warning.retry;
              void run('override', retry);
            }}
          />
        </Card>
      ) : null}

      {/* ---------------- Driver actions ---------------- */}
      {as === 'driver' && ride.status === 'accepted' ? (
        <DriverMoments ride={ride} onChanged={onChanged} onSent={(kind) => kind === 'on_the_way' && setNudgeShare(true)} />
      ) : null}
      {as === 'driver' && ride.status === 'accepted' ? (
        <Card>
          <LiveShare nudge={nudgeShare} />
        </Card>
      ) : null}
      {as === 'driver' ? (
        <ChatPanel
          key={ride.id}
          me="driver"
          load={loadMessages}
          send={sendMessage}
          subscribe={onRideMessage}
          open={chatOpen(ride.status, ride.pickup_at, now)}
          quickReplies={[t('qrDriverOnTheWay'), t('qrDriverEntrance'), t('qrDriverParked'), t('qrDriverWaiting')]}
        />
      ) : null}

      {as === 'driver' && ride.status === 'requested' && mode === 'none' ? (
        <View style={{ gap: 8 }}>
          <Button
            title={t('accept')}
            loading={busy === 'accept'}
            onPress={() => run('accept', () => api.acceptRide(ride.id), () => api.acceptRide(ride.id, true))}
          />
          {licence === 'vtc' ? (
            <Button kind="secondary" title={t('proposePrice')} onPress={() => setMode('propose')} />
          ) : null}
          <Button kind="danger" title={t('decline')} onPress={() => setMode('decline')} />
        </View>
      ) : null}
      {as === 'driver' && mode === 'propose' ? (
        <Card>
          <Field label={t('price')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" autoFocus />
          <Button title={t('proposePrice')} loading={busy === 'price'} onPress={withPrice((p, override) => api.proposePrice(ride.id, p, override))} />
          <Button kind="secondary" title={t('back')} onPress={() => setMode('none')} />
        </Card>
      ) : null}
      {as === 'driver' && mode === 'decline' ? (
        <Card>
          <Field label={t('reason')} value={reason} onChangeText={setReason} />
          <Button kind="danger" title={t('decline')} loading={busy === 'decline'} onPress={() => run('decline', () => api.declineRide(ride.id, reason || undefined))} />
          <Button kind="secondary" title={t('back')} onPress={() => setMode('none')} />
        </Card>
      ) : null}
      {as === 'driver' && ride.status === 'price_proposed' ? (
        <Button kind="danger" title={t('withdraw')} loading={busy === 'withdraw'} onPress={() => run('withdraw', () => api.declineRide(ride.id))} />
      ) : null}
      {as === 'driver' && ride.status === 'accepted' && mode === 'none' ? (
        <View style={{ gap: 8 }}>
          {canClose ? <Button title={t('complete')} onPress={() => setMode('complete')} /> : null}
          {canNoShow ? (
            <Button kind="secondary" title={t('noShow')} loading={busy === 'noshow'} onPress={() => run('noshow', () => api.markNoShow(ride.id))} />
          ) : null}
          <Button kind="danger" title={t('cancelRide')} onPress={() => setMode('cancel')} />
        </View>
      ) : null}
      {as === 'driver' && mode === 'complete' ? (
        <Card>
          <Field
            label={t('finalPrice')}
            value={price}
            placeholder={ride.agreed_price !== null ? String(ride.agreed_price) : ''}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
          />
          <Field label={t('reason')} value={reason} onChangeText={setReason} />
          <Button
            title={t('complete')}
            loading={busy === 'complete'}
            onPress={() => {
              const p = price.trim() ? parsePrice(price) : undefined;
              if (p === null) return setError(err('BAD_INPUT'));
              void run('complete', () => api.completeRide(ride.id, p, reason || undefined));
            }}
          />
          <Button kind="secondary" title={t('back')} onPress={() => setMode('none')} />
        </Card>
      ) : null}
      {as === 'driver' && mode === 'cancel' ? (
        <Card>
          <Field label={t('reason')} value={reason} onChangeText={setReason} />
          <Button
            kind="danger"
            title={t('cancelRide')}
            loading={busy === 'cancel'}
            onPress={() => (reason.trim() ? run('cancel', () => api.cancelRide(ride.id, reason)) : setError(t('reasonNeeded')))}
          />
          <Button kind="secondary" title={t('back')} onPress={() => setMode('none')} />
        </Card>
      ) : null}

      {/* ---------------- Customer actions ---------------- */}
      {as === 'customer' && ride.status === 'price_proposed' ? (
        <View style={{ gap: 8 }}>
          <Button title={t('acceptPrice')} loading={busy === 'yes'} onPress={() => run('yes', () => api.respondToPrice(ride.id, true))} />
          <Button kind="secondary" title={t('refusePrice')} loading={busy === 'no'} onPress={() => run('no', () => api.respondToPrice(ride.id, false))} />
        </View>
      ) : null}
      {as === 'customer' && ['requested', 'price_proposed', 'accepted'].includes(ride.status) ? (
        <Button
          kind="danger"
          title={t('cancelRide')}
          loading={busy === 'ccancel'}
          onPress={async () => {
            if (await confirmAsk(`${t('cancelRide')} ?`, t('confirm'), t('back'))) {
              void run('ccancel', () => api.cancelRide(ride.id));
            }
          }}
        />
      ) : null}
      {as === 'customer' ? (
        <Button kind="secondary" title={t('rebook')} onPress={() => router.push({ pathname: '/customer/book', params: { from: ride.id } })} />
      ) : null}
    </View>
  );
}
