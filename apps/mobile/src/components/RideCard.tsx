import { Text, View } from "react-native";
import type { Ride, RideStatus } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime, formatPrice } from "@/lib/format";
import type { TextKey } from "@/lib/i18n";
import { Card, colors, Icon, Row, styles, Touchable } from "./ui";
import { fonts, night, radius } from "@/lib/theme";

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
    <View
      style={{
        backgroundColor: statusColor[status],
        borderRadius: radius.pill,
        paddingHorizontal: 8,
        paddingVertical: 3,
      }}
    >
      <Text
        style={{
          color: colors.primaryText,
          fontSize: 11,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          fontFamily: fonts.semibold,
        }}
      >
        {t(`status_${status}` as TextKey)}
      </Text>
    </View>
  );
}

/** The best price to show for a ride at its current stage. */
export function ridePrice(r: Ride) {
  return (
    r.final_price ?? r.agreed_price ?? r.proposed_price ?? r.estimated_price
  );
}

export function RideCard({
  ride,
  onPress,
  showCustomer,
  conflict,
}: {
  ride: Ride;
  onPress?: () => void;
  showCustomer?: boolean;
  conflict?: boolean;
}) {
  const { lang, t } = useAuth();
  return (
    // The whole card opens the ride: an edge that lights up on press and an arrow say so.
    <Touchable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      pressScale={0.98}
    >
      {({ pressed, hovered }) => (
        <Card
          style={[
            { paddingRight: onPress ? 44 : 16 },
            conflict
              ? { borderColor: colors.danger, borderWidth: 2 }
              : (pressed || hovered) && onPress
                ? { borderColor: night.primary }
                : null,
          ]}
        >
          <Row style={{ justifyContent: "space-between" }}>
            <Text style={[styles.text, { fontFamily: fonts.semibold }]}>
              {formatDateTime(ride.pickup_at, lang)}
            </Text>
            <StatusBadge status={ride.status} />
          </Row>
          {showCustomer && ride.contact ? (
            <Text style={[styles.text, { fontWeight: "600" }]}>
              {ride.contact.full_name}
            </Text>
          ) : null}
          <Text style={styles.text} numberOfLines={1}>
            ● {ride.pickup_address}
          </Text>
          <Text style={styles.text} numberOfLines={1}>
            ■ {ride.dropoff_address}
          </Text>
          <Row style={{ justifyContent: "space-between" }}>
            <Text style={styles.muted}>
              {ride.passengers} {t("passengersShort")} · {ride.luggage}{" "}
              {t("luggageShort")}
              {ride.travel_ref ? ` · ${ride.travel_ref}` : ""}
            </Text>
            <Text style={[styles.text, { fontFamily: fonts.semibold }]}>
              {formatPrice(ridePrice(ride), ride.currency, lang)}
            </Text>
          </Row>
          {conflict ? (
            <Text style={styles.error}>⚠ {t("conflict")}</Text>
          ) : null}
          {onPress ? (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                right: 12,
                top: 0,
                bottom: 0,
                justifyContent: "center",
              }}
            >
              <Icon
                name="chevron-right"
                size={22}
                color={pressed || hovered ? night.primary : night.label}
              />
            </View>
          ) : null}
        </Card>
      )}
    </Touchable>
  );
}
