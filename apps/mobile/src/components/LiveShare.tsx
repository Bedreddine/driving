import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { api } from '@/lib/http';
import { useAuth } from '@/lib/auth';
import { followPosition } from '@/lib/location';
import { LiveDot } from './scene';
import { Button, Muted, Notice, Row, Body } from './ui';

/**
 * The driver shares their live position for a confirmed ride: the client sees the car approach on their page.
 * Only while this screen is open (foreground); the server shows it only around the ride's time.
 */
export function LiveShare() {
  const { t, err } = useAuth();
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!on) return;
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
        setOn(false);
      } else stop = s;
    });
    return () => {
      alive = false;
      stop?.();
    };
  }, [on, t, err]);

  return (
    <View style={{ gap: 8 }}>
      {on ? (
        <Row style={{ gap: 10 }}>
          <LiveDot />
          <Body style={{ flex: 1 }}>{t('sharingLocation')}</Body>
        </Row>
      ) : null}
      <Button kind={on ? 'secondary' : 'primary'} title={on ? t('stopSharing') : t('shareLocation')} onPress={() => setOn((v) => !v)} />
      <Muted>{t('shareHelp')}</Muted>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </View>
  );
}
