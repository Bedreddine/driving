import { Pressable, Text, View } from 'react-native';
import type { Ride, RideStatus } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatPrice } from '@/lib/format';
import type { TextKey } from '@/lib/i18n';
import { Card, colors, Row, styles } from './ui';

const statusColor: Record<RideStatus, string> = {
  requested: colors.warning,
  price_proposed: colors.warning,
  accepted: colors.success,
  declined: colors.muted,
  declined_by_customer: colors.muted,
  expired: colors.muted,
  cancelled: colors.danger,
  completed: colors.primary,
  no_show: colors.danger,
};

export function StatusBadge({ status }: { status: RideStatus }) {
  const { t } = useAuth();
  return (
    <View style={{ backgroundColor: statusColor[status], borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{t(`status_${status}` as TextKey)}</Text>
    </View>
  );
}

/** The best price to show for a ride at its current stage. */
export function ridePrice(r: Ride) {
  return r.final_price ?? r.agreed_price ?? r.proposed_price ?? r.estimated_price;
}

export function RideCard({ ride, onPress, showCustomer, conflict }: { ride: Ride; onPress?: () => void; showCustomer?: boolean; conflict?: boolean }) {
  const { lang, t } = useAuth();
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card style={conflict ? { borderColor: colors.danger, borderWidth: 2 } : undefined}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={[styles.text, { fontWeight: '700' }]}>{formatDateTime(ride.pickup_at, lang)}</Text>
          <StatusBadge status={ride.status} />
        </Row>
        {showCustomer && ride.contact ? (
          <Text style={[styles.text, { fontWeight: '600' }]}>{ride.contact.full_name}</Text>
        ) : null}
        <Text style={styles.text} numberOfLines={1}>
          ● {ride.pickup_address}
        </Text>
        <Text style={styles.text} numberOfLines={1}>
          ■ {ride.dropoff_address}
        </Text>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={styles.muted}>
            {ride.passengers} 👤 · {ride.luggage} 🧳{ride.travel_ref ? ` · ${ride.travel_ref}` : ''}
          </Text>
          <Text style={[styles.text, { fontWeight: '700' }]}>{formatPrice(ridePrice(ride), ride.currency, lang)}</Text>
        </Row>
        {conflict ? <Text style={styles.error}>⚠ {t('conflict')}</Text> : null}
      </Card>
    </Pressable>
  );
}
