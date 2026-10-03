import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { api } from '@/lib/http';
import { useAuth } from '@/lib/auth';
import { backgroundSupported, isTracking, startTracking, stopTracking } from '@/lib/driverTracking';
import { followPosition } from '@/lib/location';
import { LiveDot } from './scene';
import { Button, Muted, Notice, Row, Body } from './ui';

type Mode = 'off' | 'background' | 'foreground';

/**
 * The driver shares their live position for a confirmed ride: the client sees the car approach on their page.
 * Phones keep sharing with the screen locked when "always" location is allowed; otherwise (and on the website)
 * only while this screen is open. The server shows it only around the ride's time.
 */
export function LiveShare() {
  const { t, err } = useAuth();
  const [mode, setMode] = useState<Mode>('off');
  const [error, setError] = useState<string | null>(null);

  // Background sharing survives closing the app: show it as on when coming back.
  useEffect(() => {
    void isTracking().then((on) => on && setMode('background'));
  }, []);

  useEffect(() => {
    if (mode !== 'foreground') return;
    let stop: (() => void) | null = null;
    let alive = true;
    void followPosition((p) => {
      api
        .post('/api/driver/location', { lat: p.lngLat[1], lng: p.lngLat[0], heading: p.heading, speed: p.speed, accuracy: p.accuracy })
        .then(() => setError(null))
        .catch((e) => setError(err((e as Error).message)));
    }).then((s) => {
      if (!alive) s?.();
      else if (!s) {
        setError(t('locationRefused'));
        setMode('off');
      } else stop = s;
    });
    return () => {
      alive = false;
      stop?.();
    };
  }, [mode, t, err]);

  const toggle = async () => {
    setError(null);
    if (mode === 'background') {
      await stopTracking();
      setMode('off');
    } else if (mode === 'foreground') {
      setMode('off');
    } else {
      const got = await startTracking({ title: t('sharingLocation'), body: t('sharingNotice') }).catch(() => 'foreground-only' as const);
      if (got === 'denied') setError(t('locationRefused'));
      else setMode(got === 'background' ? 'background' : 'foreground');
    }
  };

  const on = mode !== 'off';
  return (
    <View style={{ gap: 8 }}>
      {on ? (
        <Row style={{ gap: 10 }}>
          <LiveDot />
          <Body style={{ flex: 1 }}>{t('sharingLocation')}</Body>
        </Row>
      ) : null}
      <Button kind={on ? 'secondary' : 'primary'} title={on ? t('stopSharing') : t('shareLocation')} onPress={() => void toggle()} />
      <Muted>{mode === 'background' ? t('shareHelpBackground') : t('shareHelp')}</Muted>
      {mode === 'foreground' && backgroundSupported ? <Notice tone="info">{t('shareAlwaysHint')}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </View>
  );
}
