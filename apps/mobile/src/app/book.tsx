import { LinearGradient } from 'expo-linear-gradient';
import { Link, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClientTopBar } from '@/components/ClientTopBar';
import { LegalLinks } from '@/components/LegalScreen';
import { hasVehicle, VehicleCard, VehicleGallery } from '@/components/Vehicle';
import { DateTimeField } from '@/components/DateTimeField';
import { MapScene } from '@/components/map/MapScene';
import { PARIS } from '@/components/map/shared';
import { Chip, CountUp, Display, MonoLine, PlaceRow, PriceDetail, Rise, Section, Tabs } from '@/components/scene';
import { ArrowRight, Button, Field, Icon, Muted, Notice, Stepper, Toggle } from '@/components/ui';
import type { BookingInput, BookingResult, DriverInfo, Place } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatKm, formatMinutes, formatPrice, formatTime, fromWallClock, toWallClock } from '@/lib/format';
import { reverseGeocode, searchAddress } from '@/lib/geocode';
import { decodePlace, firstName, forgetDetails, forgetGuest, lastTrip, loadProfile, recentPlaces, rememberGuest } from '@/lib/guestProfile';
import { rememberGuestRide, savedGuestRides, type SavedGuestRide } from '@/lib/guestRides';
import { apiUrl } from '@/lib/http';
import type { Lang } from '@/lib/i18n';
import { currentPosition, followPosition } from '@/lib/location';
import { distanceKm, formatCoords, type LngLat } from '@/lib/mapStyle';
import { shortName, SUGGESTED_PLACES, type PlaceKind } from '@/lib/places';
import { priceLines } from '@/lib/priceLines';
import { type BusinessInfo, getBusiness, getPublicDriver, guestBook, guestQuote } from '@/lib/publicApi';
import { getPublicReviews, type PublicReview } from '@/lib/reviews';
import { fonts, night } from '@/lib/theme';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { useNow } from '@/lib/useNow';
import { isEmail, isPhone } from '@/lib/validate';

type Stage = 'landing' | 'where' | 'pin' | 'trip';
type End = 'from' | 'to';

const MIN_NOTICE_MS = 3 * 3600_000;
const lngLatOf = (p: Place): LngLat => [p.lng, p.lat];

/** The earliest bookable time: three hours ahead, on the next quarter hour. */
function earliestPickup(now: number) {
  const d = new Date(now + MIN_NOTICE_MS + 10 * 60_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return d.toISOString();
}

/** A given Paris wall-clock time, `days` after today. */
function parisAt(now: number, days: number, hour: number, minute = 0) {
  const w = toWallClock(new Date(now + days * 86_400_000));
  return fromWallClock({ ...w, hour, minute });
}

/** Name of a place as clients know it: the suggested name, or the first part of the address. */
function placeName(p: Place, lang: Lang) {
  const s = SUGGESTED_PLACES.find((x) => x.address === p.address);
  return s ? s.name[lang] : p.address.split(',')[0];
}
const placeShort = (p: Place) => SUGGESTED_PLACES.find((x) => x.address === p.address)?.short ?? shortName(p.address);

/**
 * The page the business-card QR code opens, and the home of the website: Paris at night on a living map,
 * then booking over the map (suggested places, search, or a pin), the price, and the request. No account needed.
 */
export default function Experience() {
  const { t, err, lang } = useAuth();
  const router = useRouter();
  // "Book this trip again" links: /book?from=lat,lng,address&to=…
  const params = useLocalSearchParams<{ from?: string; to?: string }>();
  const [linkedTrip] = useState(() => {
    const from = decodePlace(params.from);
    const to = decodePlace(params.to);
    return from && to ? { from, to } : null;
  });
  // "Remember me on this device" (opt-in): details, recent places and the last trip, kept on the device only.
  const [profile, setProfile] = useState(() => loadProfile());
  const [recents, setRecents] = useState(() => recentPlaces());
  const [again, setAgain] = useState(() => lastTrip());
  const [remember, setRemember] = useState(() => !!loadProfile());
  const [editDetails, setEditDetails] = useState(false);
  const [forgot, setForgot] = useState(false);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const wide = width >= 900;
  const now = useNow(60_000);

  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [driver, setDriver] = useState<DriverInfo | null>(null);
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [mine] = useState<SavedGuestRide[]>(() =>
    savedGuestRides().filter((r) => new Date(r.pickup_at).getTime() > Date.now() - 6 * 3600_000),
  );

  const [stage, setStage] = useState<Stage>(() => (linkedTrip ? 'trip' : 'landing'));
  const [editing, setEditing] = useState<End>('from');
  const [pickup, setPickup] = useState<Place | null>(() => linkedTrip?.from ?? null);
  const [dropoff, setDropoff] = useState<Place | null>(() => linkedTrip?.to ?? null);
  const [tab, setTab] = useState<PlaceKind>('palace');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);
  const [pinFocus, setPinFocus] = useState<LngLat>(PARIS);
  const [pinCenter, setPinCenter] = useState<LngLat | null>(null);
  const [pinAt, setPinAt] = useState<Place | null>(null);

  const [when, setWhen] = useState(() => earliestPickup(Date.now()));
  const [otherTime, setOtherTime] = useState(false);
  const [passengers, setPassengers] = useState(1);
  const [luggage, setLuggage] = useState(1);
  const [meetGreet, setMeetGreet] = useState(false);
  const [travelRef, setTravelRef] = useState('');
  const [notes, setNotes] = useState('');
  const [name, setName] = useState(() => loadProfile()?.full_name ?? '');
  const [phone, setPhone] = useState(() => loadProfile()?.phone ?? '');
  const [email, setEmail] = useState(() => loadProfile()?.email ?? '');
  const [quote, setQuote] = useState<{ key: string; result?: BookingResult; error?: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [childSeats, setChildSeats] = useState(0);
  const [showDetail, setShowDetail] = useState(false);
  const [gallery, setGallery] = useState(false);
  // The client's own position, once they asked for it ("My location"); it follows the phone.
  const [you, setYou] = useState<LngLat | null>(null);
  const [locError, setLocError] = useState(false);
  const [following, setFollowing] = useState<'from' | 'to' | null>(null);

  useDocumentTitle(business ? `${business.name} – ${t('bookYourChauffeur')}` : null);

  useEffect(() => {
    void getBusiness().then(setBusiness).catch(() => undefined);
    void getPublicDriver().then(setDriver).catch(() => undefined);
    void getPublicReviews().then(setReviews).catch(() => undefined);
  }, []);

  // Address search, once the client has typed three letters.
  const searching = query.trim().length >= 3;
  useEffect(() => {
    if (!searching) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void searchAddress(query, lang, controller.signal)
        .then(setResults)
        .catch(() => undefined);
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, lang, searching]);

  // A pin moved by hand: its address, once the map stops.
  useEffect(() => {
    if (stage !== 'pin' || !pinCenter) return;
    const controller = new AbortController();
    void reverseGeocode(pinCenter[0], pinCenter[1], lang, controller.signal)
      .then(setPinAt)
      .catch(() => undefined);
    return () => controller.abort();
  }, [pinCenter, stage, lang]);

  const ride: BookingInput | null = useMemo(
    () =>
      pickup && dropoff
        ? {
            pickup_at: when,
            pickup,
            dropoff,
            passengers,
            luggage,
            vehicle: driver?.vehicle ?? 'sedan',
            meet_greet: meetGreet,
            child_seats: childSeats,
            travel_ref: travelRef.trim() || undefined,
            customer_notes: notes.trim() || undefined,
          }
        : null,
    [pickup, dropoff, when, passengers, luggage, driver, meetGreet, childSeats, travelRef, notes],
  );
  // The price depends on the trip, the time and the load; not on the notes.
  const priceKey = ride ? JSON.stringify([ride.pickup, ride.dropoff, ride.pickup_at, passengers, luggage, meetGreet, childSeats]) : '';
  const current = quote?.key === priceKey ? quote : null;
  const priced = current?.result?.ok ? current.result : null;

  useEffect(() => {
    if (stage !== 'trip' || !ride) return;
    let alive = true;
    const timer = setTimeout(() => {
      guestQuote(ride)
        .then((r) => {
          if (!alive) return;
          const error = r.ok ? undefined : (r.errors ?? []).map((c) => err(c)).join('\n') || err('generic');
          setQuote({ key: priceKey, result: r, error });
        })
        .catch((e) => alive && setQuote({ key: priceKey, error: err((e as Error).message) }));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // Re-price only when what the price depends on changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceKey, stage]);

  // "My location": the dot follows the phone; the chosen end follows too until the client moves its pin.
  useEffect(() => {
    if (!you) return;
    let stop: (() => void) | null = null;
    let alive = true;
    void followPosition((p) => alive && setYou(p.lngLat)).then((s) => {
      if (alive) stop = s;
      else s?.();
    });
    return () => {
      alive = false;
      stop?.();
    };
    // Start once, when the client first shares their position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [you !== null]);
  useEffect(() => {
    if (!you || !following) return;
    const end = following === 'from' ? pickup : dropoff;
    // Only re-address when the phone moved more than ~30 m.
    if (end && distanceKm(lngLatOf(end), you) < 0.03) return;
    let alive = true;
    void reverseGeocode(you[0], you[1], lang).then((p) => {
      if (!alive) return;
      if (following === 'from') setPickup(p);
      else setDropoff(p);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [you, following]);

  const client = { full_name: name.trim(), phone: phone.trim(), email: email.trim(), language: lang };
  const phoneOk = isPhone(client.phone);
  const emailOk = isEmail(client.email);
  const clientOk = client.full_name.length > 0 && phoneOk && emailOk;

  const send = async () => {
    if (!ride || !clientOk || !priced) return;
    setSending(true);
    setSendError(null);
    try {
      const r = await guestBook(client, ride);
      if (r.ok && r.access_token) {
        rememberGuestRide({ token: r.access_token, pickup_at: ride.pickup_at, from: ride.pickup.address, to: ride.dropoff.address });
        if (remember) rememberGuest({ full_name: client.full_name, phone: client.phone, email: client.email }, ride.pickup, ride.dropoff);
        else forgetDetails();
        router.replace({ pathname: '/b/[token]', params: { token: r.access_token } });
        return;
      }
      setSendError((r.errors ?? []).map((c) => err(c)).join('\n') || err('generic'));
    } catch (e) {
      setSendError(err((e as Error).message));
    } finally {
      setSending(false);
    }
  };

  // ----- choosing the two ends of the trip -----
  const edit = (end: End) => {
    setEditing(end);
    setQuery('');
    setResults(null);
    setTab(end === 'from' ? 'palace' : 'airport');
    setStage('where');
  };
  const choose = (place: Place) => {
    setQuery('');
    setResults(null);
    if (editing === 'from') {
      setPickup(place);
      if (dropoff) setStage('trip');
      else {
        setEditing('to');
        setTab('airport');
        setStage('where');
      }
    } else {
      setDropoff(place);
      if (pickup) setStage('trip');
      else {
        setEditing('from');
        setTab('palace');
        setStage('where');
      }
    }
  };
  const openPin = (at?: LngLat) => {
    const here = editing === 'from' ? pickup : dropoff;
    const other = editing === 'from' ? dropoff : pickup;
    const focus = at ?? (here ? lngLatOf(here) : other ? lngLatOf(other) : PARIS);
    setPinFocus(focus);
    setPinCenter(focus);
    setPinAt(null);
    setStage('pin');
  };
  const reference = editing === 'from' ? dropoff : pickup;
  const distanceTo = (ll: LngLat) => formatKm(distanceKm(reference ? lngLatOf(reference) : PARIS, ll) * 1000 * 1.25, lang);

  // ----- the map as an input: tap to place, drag to adjust, numbered search results -----
  const placeAt = (ll: LngLat) => reverseGeocode(ll[0], ll[1], lang);
  const tapMap = async (ll: LngLat) => {
    if (stage === 'where') choose(await placeAt(ll));
  };
  const movePickup = async (ll: LngLat) => {
    setFollowing((f) => (f === 'from' ? null : f));
    setPickup(await placeAt(ll));
  };
  const moveDropoff = async (ll: LngLat) => {
    setFollowing((f) => (f === 'to' ? null : f));
    setDropoff(await placeAt(ll));
  };
  const useMyLocation = async () => {
    setLocError(false);
    const ll = await currentPosition();
    if (!ll) {
      setLocError(true);
      return;
    }
    setYou(ll);
    setFollowing(editing);
    choose(await placeAt(ll));
  };

  // ----- time choices -----
  const earliest = earliestPickup(now);
  const tonight = parisAt(now, 0, 21);
  const tomorrow = parisAt(now, 1, 8);
  const timeChoices = [
    { iso: earliest, label: `${t('earliest')} · ${formatTime(earliest, lang)}` },
    ...(new Date(tonight).getTime() > new Date(earliest).getTime() ? [{ iso: tonight, label: `${t('tonight')} · 21:00` }] : []),
    { iso: tomorrow, label: `${t('tomorrow')} · 08:00` },
  ];
  const pickTime = (iso: string) => {
    setOtherTime(false);
    setWhen(iso);
  };

  // ----- layout -----
  const route: LngLat[] | null =
    stage === 'trip' && pickup && dropoff ? (priced?.route ?? (current ? [lngLatOf(pickup), lngLatOf(dropoff)] : null)) : null;
  const mapPadding = wide
    ? { left: 24 + 440 + 32, top: 80, bottom: 40, right: 48 }
    : { top: insets.top + 70, bottom: (stage === 'landing' ? height * 0.45 : sheetHeight) + 16, left: 32, right: 32 };
  const hour = toWallClock(new Date(now)).hour;
  const hero = hour >= 17 || hour < 5 ? t('heroNight') : t('heroDay');
  const amenityLabels = (business?.amenities ?? []).map((a) => (lang === 'en' ? a.label_en : a.label_fr));
  const driverName = business?.driver_name ?? null;
  const latestReview = reviews[0];
  const price = (n: number | null | undefined) => formatPrice(n, priced?.currency ?? 'EUR', lang);
  const whatsapp = business?.phone?.replace(/\D/g, '');
  const extras = driver?.extras;
  /** "Child seats · +€10.00" when the driver charges for it. */
  const withFee = (label: string, fee: number | null | undefined) => (fee ? `${label} · +${formatPrice(fee, priced?.currency ?? 'EUR', lang)}` : label);

  const sheetFrame = wide
    ? { position: 'absolute' as const, left: 24, top: insets.top + 76, bottom: 24, width: 440 }
    : { position: 'absolute' as const, left: 0, right: 0, bottom: 0, maxHeight: stage === 'pin' ? undefined : height * 0.66 };

  return (
    <View style={{ flex: 1, backgroundColor: night.paper }}>
      <Stack.Screen options={{ headerShown: false, title: business?.name ?? t('bookYourChauffeur') }} />
      <StatusBar style="light" />

      <MapScene
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        mode={stage === 'landing' ? 'orbit' : stage === 'pin' ? 'pick' : 'trip'}
        focus={stage === 'pin' ? pinFocus : undefined}
        pickup={pickup ? lngLatOf(pickup) : null}
        dropoff={dropoff ? lngLatOf(dropoff) : null}
        route={route}
        padding={mapPadding}
        onPress={tapMap}
        onCenterChange={setPinCenter}
        onPickupMove={stage === 'where' || stage === 'trip' ? movePickup : undefined}
        onDropoffMove={stage === 'where' || stage === 'trip' ? moveDropoff : undefined}
        candidates={stage === 'where' && searching && results ? results.map((r) => ({ lngLat: lngLatOf(r), label: r.address })) : null}
        onCandidatePress={(i) => results?.[i] && choose(results[i])}
        you={you}
      />

      {stage === 'landing' ? (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(13,15,18,0.8)', 'rgba(13,15,18,0)', 'rgba(13,15,18,0)', 'rgba(13,15,18,0.94)', night.paper]}
          locations={[0, 0.2, 0.36, 0.62, 1]}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : null}

      <ClientTopBar name={business?.name} onBrandPress={() => setStage('landing')} />

      {stage === 'landing' ? (
        <View
          style={{
            position: 'absolute',
            left: wide ? 48 : 0,
            right: wide ? undefined : 0,
            bottom: 0,
            width: wide ? 520 : undefined,
            paddingHorizontal: 22,
            paddingBottom: insets.bottom + 22,
          }}
        >
          <Rise index={0}>
            <Display size={wide ? 64 : 46}>{hero}</Display>
          </Rise>
          {driverName ? (
            <Rise index={1} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}>
              {business?.photo_url ? (
                <Image
                  source={{ uri: `${apiUrl}${business.photo_url}` }}
                  accessibilityIgnoresInvertColors
                  style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: night.rule }}
                />
              ) : null}
              <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: night.muted }}>
                {`${t('yourDriver')} · `}
                <Text style={{ color: night.text, fontFamily: fonts.semibold }}>{driverName}</Text>
                {business?.vehicle?.model ? ` · ${business.vehicle.model}` : business?.car ? ` · ${business.car}` : ''}
                {business?.vehicle?.photos.length ? (
                  <Text style={{ color: night.primary, fontFamily: fonts.semibold }} onPress={() => setGallery(true)}>
                    {`  ${t('seeCar')} →`}
                  </Text>
                ) : null}
              </Text>
            </Rise>
          ) : null}
          {forgot ? (
            <Rise index={1} style={{ marginTop: 14 }}>
              <Notice tone="success">{t('forgotten')}</Notice>
            </Rise>
          ) : null}
          {profile || (again && !forgot) ? (
            <Rise index={1} style={{ marginTop: 14, gap: 10 }}>
              {profile ? (
                <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: night.text }}>
                  {t('welcomeBack').replace('{name}', firstName(profile.full_name))}
                  {again ? <Text style={{ fontFamily: fonts.body, color: night.label }}>{` ${t('bookAgainQ')}`}</Text> : null}
                </Text>
              ) : null}
              {again ? (
                <Button
                  kind="secondary"
                  icon="repeat"
                  title={`${placeShort(again.from)} → ${placeShort(again.to)}`}
                  accessibilityLabel={`${t('bookAgain')} · ${placeShort(again.from)} → ${placeShort(again.to)}`}
                  onPress={() => {
                    setPickup(again.from);
                    setDropoff(again.to);
                    setStage('trip');
                  }}
                />
              ) : null}
            </Rise>
          ) : null}
          <Rise index={2} style={{ marginTop: 18 }}>
            <Button size="lg" title={t('whereTo')} onPress={() => edit('from')} trailing={<ArrowRight />} />
          </Rise>
          {amenityLabels.length > 0 ? (
            <Rise index={3} style={{ marginTop: 16 }}>
              <MonoLine muted>
                <Text style={{ color: night.text }}>{t('aboard').toUpperCase()}</Text>
                {` · ${amenityLabels.join(' · ').toLowerCase()}`}
              </MonoLine>
            </Rise>
          ) : null}
          {latestReview?.comment ? (
            <Rise index={4} style={{ marginTop: 14 }}>
              <Text style={{ fontFamily: fonts.displayItalic, fontSize: 19, lineHeight: 24, color: night.text }}>
                {lang === 'fr' ? `« ${latestReview.comment} »` : `“${latestReview.comment}”`}
              </Text>
              <MonoLine muted style={{ fontSize: 11 }}>
                {[latestReview.display_name, latestReview.city].filter(Boolean).join(' · ').toUpperCase()}
              </MonoLine>
            </Rise>
          ) : null}
          <Rise index={5} style={{ marginTop: 14, gap: 4 }}>
            {mine.slice(0, 2).map((r) => (
              <Link key={r.token} href={{ pathname: '/b/[token]', params: { token: r.token } }} style={{ fontFamily: fonts.mono, fontSize: 12.5, color: night.primary }}>
                {formatDateTime(r.pickup_at, lang)} · {shortName(r.from)} → {shortName(r.to)}
              </Link>
            ))}
            <View style={{ flexDirection: 'row', gap: 18, flexWrap: 'wrap', marginTop: 4 }}>
              {business?.phone ? (
                <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: night.muted }} onPress={() => void Linking.openURL(`tel:${business.phone}`)}>
                  {t('call')}
                </Text>
              ) : null}
              {whatsapp ? (
                <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: night.muted }} onPress={() => void Linking.openURL(`https://wa.me/${whatsapp}`)}>
                  WhatsApp
                </Text>
              ) : null}
              {profile || again || recents.length ? (
                <Text
                  accessibilityRole="button"
                  style={{ fontFamily: fonts.medium, fontSize: 13, color: night.muted, textDecorationLine: 'underline' }}
                  onPress={() => {
                    forgetGuest();
                    setProfile(null);
                    setRecents([]);
                    setAgain(null);
                    setRemember(false);
                    setName('');
                    setPhone('');
                    setEmail('');
                    setForgot(true);
                  }}
                >
                  {t('forgetMe')}
                </Text>
              ) : null}
              <Link href="/sign-in" style={{ fontFamily: fonts.medium, fontSize: 13, color: night.muted }}>
                {t('alreadyClient')}
              </Link>
            </View>
            <LegalLinks />
          </Rise>
        </View>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={sheetFrame} pointerEvents="box-none">
          <View
            onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
            style={{
              flexShrink: 1,
              backgroundColor: night.paper,
              borderColor: night.rule,
              borderWidth: 1,
              borderBottomWidth: wide ? 1 : 0,
              borderLeftWidth: wide ? 1 : 0,
              borderRightWidth: wide ? 1 : 0,
              borderRadius: wide ? 14 : 0,
              borderTopLeftRadius: 14,
              borderTopRightRadius: 14,
              overflow: 'hidden',
            }}
          >
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 20 }}>
              <Rise key={stage}>
                {stage === 'where' ? (
                  <WhereSheet
                    lang={lang}
                    editing={editing}
                    pickup={pickup}
                    dropoff={dropoff}
                    query={query}
                    results={searching ? results : null}
                    tab={tab}
                    onBack={() => setStage(pickup && dropoff ? 'trip' : 'landing')}
                    onEdit={edit}
                    onQuery={setQuery}
                    onTab={setTab}
                    onChoose={choose}
                    onPin={() => openPin()}
                    onMyLocation={useMyLocation}
                    recents={recents}
                    locError={locError}
                    distanceTo={distanceTo}
                  />
                ) : null}

                {stage === 'pin' ? (
                  <View style={{ gap: 10 }}>
                    <Muted>{t('moveMapHint')}</Muted>
                    <Text style={{ fontFamily: fonts.semibold, fontSize: 16.5, color: night.text }}>{pinAt?.address ?? t('locating')}</Text>
                    {pinCenter ? <MonoLine muted>{formatCoords(pinCenter)}</MonoLine> : null}
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                      <Button kind="secondary" title={t('back')} onPress={() => setStage('where')} style={{ flex: 1 }} />
                      <Button title={t('confirmSpot')} disabled={!pinAt} onPress={() => pinAt && choose(pinAt)} style={{ flex: 2 }} />
                    </View>
                  </View>
                ) : null}

                {stage === 'trip' && pickup && dropoff ? (
                  <View style={{ gap: 14 }}>
                    <Button kind="ghost" size="sm" icon="arrow-left" title={t('edit')} onPress={() => edit('to')} style={{ alignSelf: 'flex-start', marginLeft: -12 }} />

                    <Section n={1} title={t('step_trip')}>
                      <View>
                        <MonoLine>{`${placeShort(pickup)} → ${placeShort(dropoff)}`}</MonoLine>
                        <MonoLine muted>
                          {priced?.distance_m
                            ? `${formatKm(priced.distance_m, lang)} · ${formatMinutes(priced.duration_s ?? 0)} · ${priced.is_fixed ? t('fixedPrice').toLowerCase() : t('estimateShort')}`
                            : current?.error
                              ? ' '
                              : t('pricingNow')}
                        </MonoLine>
                      </View>
                      {priced ? <CountUp value={Number(priced.estimate ?? 0)} format={price} /> : null}
                      {current?.error ? <Notice tone="error">{current.error}</Notice> : null}
                      {priced?.breakdown?.length ? (
                        <>
                          <Pressable accessibilityRole="button" onPress={() => setShowDetail((v) => !v)} hitSlop={6}>
                            <Text style={{ fontFamily: fonts.semibold, fontSize: 13.5, color: night.primary }}>
                              {showDetail ? t('hidePriceDetail') : `${t('priceDetail')} →`}
                            </Text>
                          </Pressable>
                          {showDetail ? (
                            <PriceDetail lines={priceLines(priced.breakdown, t, lang, (n) => price(n))} total={price(priced.estimate)} />
                          ) : null}
                        </>
                      ) : null}
                      <Muted style={{ fontSize: 12.5 }}>{t('dragHint')}</Muted>
                      {business?.vehicle && hasVehicle(business.vehicle) ? <VehicleCard vehicle={business.vehicle} fallback={business.car} /> : null}
                    </Section>

                    <Section n={2} title={t('step_time')}>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {timeChoices.map((c) => (
                          <Chip key={c.iso} label={c.label} selected={!otherTime && when === c.iso} onPress={() => pickTime(c.iso)} />
                        ))}
                        <Chip label={`${t('otherTime')}…`} selected={otherTime || !timeChoices.some((c) => c.iso === when)} onPress={() => setOtherTime(true)} />
                      </View>
                      {otherTime ? <DateTimeField label={t('when')} value={when} onChange={setWhen} /> : null}
                    </Section>

                    <Section n={3} title={t('step_options')}>
                      <View>
                        <Stepper label={t('passengers')} value={passengers} min={1} max={driver?.seats ?? 4} onChange={setPassengers} />
                        <Stepper label={withFee(t('luggage'), luggage > (extras?.included_luggage ?? 99) ? extras?.extra_luggage_fee : 0)} value={luggage} max={driver?.luggage ?? 3} onChange={setLuggage} />
                        <Stepper label={withFee(t('childSeats'), extras?.child_seat_fee)} value={childSeats} max={3} onChange={setChildSeats} />
                        <Toggle label={withFee(t('meetGreet'), extras?.meet_greet_fee)} value={meetGreet} onChange={setMeetGreet} />
                        <Field label={t('travelRef')} value={travelRef} onChangeText={setTravelRef} autoCapitalize="characters" placeholder="AF1234 / TGV 6201" mono />
                        <Field label={t('notes')} value={notes} onChangeText={setNotes} multiline />
                      </View>
                    </Section>

                    <Section n={4} title={t('step_details')}>
                      {profile && !editDetails ? (
                        <View style={{ gap: 10 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 3, borderWidth: 1.5, borderColor: night.edge, backgroundColor: night.control }}>
                            <Icon name="user-check" size={22} color={night.primary} />
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontFamily: fonts.semibold, fontSize: 16.5, color: night.text }}>{name}</Text>
                              <Text style={{ fontFamily: fonts.mono, fontSize: 13.5, color: night.label }}>{phone}</Text>
                              <Text style={{ fontFamily: fonts.body, fontSize: 14, color: night.label }}>{email}</Text>
                            </View>
                            <Button kind="secondary" size="sm" icon="edit-2" title={t('editDetails')} onPress={() => setEditDetails(true)} />
                          </View>
                          <Muted style={{ fontSize: 12.5 }}>{t('savedDetails')}</Muted>
                        </View>
                      ) : (
                        <View>
                          <Field label={t('fullName')} value={name} onChangeText={setName} autoComplete="name" />
                          <Field
                            label={t('phone')}
                            value={phone}
                            onChangeText={setPhone}
                            keyboardType="phone-pad"
                            autoComplete="tel"
                            placeholder="+33 6 12 34 56 78"
                            mono
                            error={phone.trim() && !phoneOk ? err('BAD_PHONE') : null}
                          />
                          <Field
                            label={t('email')}
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoComplete="email"
                            error={email.trim() && !emailOk ? err('BAD_EMAIL') : null}
                          />
                          <Toggle label={t('rememberMe')} value={remember} onChange={setRemember} />
                          <Muted style={{ fontSize: 12.5 }}>{t('rememberHint')}</Muted>
                        </View>
                      )}
                    </Section>

                    {sendError ? <Notice tone="error">{sendError}</Notice> : null}
                    <Button
                      size="lg"
                      title={driverName ? t('bookWith').replace('{name}', driverName) : t('bookNow')}
                      onPress={send}
                      loading={sending}
                      disabled={!clientOk || !priced}
                      trailing={priced ? price(priced.estimate) : undefined}
                    />
                    {!clientOk ? <Muted>{t('fillDetailsHint')}</Muted> : null}
                    <Muted style={{ fontSize: 12.5 }}>
                      {t('acceptTerms')}{' '}
                      <Link href="/terms" style={{ color: night.primary, textDecorationLine: 'underline' }}>
                        {t('termsShort')}
                      </Link>
                    </Muted>
                    <Muted style={{ fontSize: 12 }}>
                      {t('privacyNote')}{' '}
                      <Link href="/privacy" style={{ color: night.primary, textDecorationLine: 'underline' }}>
                        {t('privacyShort')}
                      </Link>
                    </Muted>
                  </View>
                ) : null}
              </Rise>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      )}
      {business?.vehicle ? <VehicleGallery vehicle={business.vehicle} visible={gallery} onClose={() => setGallery(false)} /> : null}
    </View>
  );
}

/** Choosing one end of the trip: the two ends, a search, the suggested places, or a pin on the map. */
function WhereSheet(props: {
  lang: Lang;
  editing: End;
  pickup: Place | null;
  dropoff: Place | null;
  query: string;
  results: Place[] | null;
  tab: PlaceKind;
  onBack: () => void;
  onEdit: (end: End) => void;
  onQuery: (q: string) => void;
  onTab: (k: PlaceKind) => void;
  onChoose: (p: Place) => void;
  onPin: () => void;
  onMyLocation: () => void;
  recents: Place[];
  locError: boolean;
  distanceTo: (ll: LngLat) => string;
}) {
  const { t } = useAuth();
  const { lang, editing, pickup, dropoff, query, results, tab } = props;
  const end = (which: End, value: Place | null) => {
    const on = editing === which;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        onPress={() => props.onEdit(which)}
        style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: night.rule }}
      >
        <Text style={{ width: 64, fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 0.66, color: on ? night.primary : night.muted }}>
          {(which === 'from' ? t('from') : t('to')).toUpperCase()}
        </Text>
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: value ? fonts.semibold : fonts.body, fontSize: 15.5, color: value ? night.text : night.muted }}>
          {value ? placeName(value, lang) : '—'}
        </Text>
      </Pressable>
    );
  };
  const suggestions = SUGGESTED_PLACES.filter((p) => p.kind === tab);
  return (
    <View style={{ gap: 10 }}>
      <Button kind="ghost" size="sm" icon="arrow-left" title={t('back')} onPress={props.onBack} style={{ alignSelf: 'flex-start', marginLeft: -12 }} />
      <View>
        {end('from', pickup)}
        {end('to', dropoff)}
      </View>
      <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 30, lineHeight: 33, color: night.text, marginTop: 4 }}>
        {editing === 'from' ? t('pickFrom') : t('pickTo')}
      </Text>
      <Field label={t('searchAddress')} value={query} onChangeText={props.onQuery} icon="search" clearable autoCorrect={false} placeholder={t('searchAddress')} />
      {results ? (
        <View>
          {results.length === 0 ? <Muted>{t('noResults')}</Muted> : null}
          {results.map((p, i) => (
            <PlaceRow
              key={`${p.lat},${p.lng},${i}`}
              title={p.address.split(',')[0]}
              detail={p.address.split(',').slice(1).join(',').trim()}
              distance={props.distanceTo([p.lng, p.lat])}
              onPress={() => props.onChoose(p)}
            />
          ))}
        </View>
      ) : (
        <>
          <PlaceRow icon="crosshair" title={t('myLocation')} detail={t('myLocationHint')} onPress={props.onMyLocation} />
          {props.locError ? <Notice tone="error">{t('locationRefused')}</Notice> : null}
          <PlaceRow icon="map" title={t('chooseOnMap')} detail={t('moveMapHint')} onPress={props.onPin} />
          <Muted style={{ fontSize: 12.5 }}>{t('tapMapHint')}</Muted>
          {props.recents.length ? (
            <View style={{ marginTop: 6 }}>
              <MonoLine muted>{t('recent').toUpperCase()}</MonoLine>
              {props.recents.map((p) => (
                <PlaceRow key={p.address} icon="clock" title={placeName(p, lang)} detail={p.address.split(',').slice(1).join(',').trim()} distance={props.distanceTo([p.lng, p.lat])} onPress={() => props.onChoose(p)} />
              ))}
            </View>
          ) : null}
          <View style={{ marginTop: 6 }}>
            <Tabs
              value={tab}
              onChange={props.onTab}
              options={[
                { value: 'airport', label: t('tabAirports') },
                { value: 'station', label: t('tabStations') },
                { value: 'palace', label: t('tabPalaces') },
              ]}
            />
          </View>
          <View>
            {suggestions.map((s) => (
              <PlaceRow
                key={s.id}
                title={s.name[lang]}
                detail={s.detail[lang]}
                distance={props.distanceTo(s.lngLat)}
                onPress={() => props.onChoose({ lat: s.lngLat[1], lng: s.lngLat[0], address: s.address })}
              />
            ))}
          </View>
        </>
      )}
      <Text style={{ fontFamily: fonts.body, fontSize: 11, color: night.muted }}>© OpenStreetMap · OpenFreeMap</Text>
    </View>
  );
}
