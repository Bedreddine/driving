import { useLastNotificationResponse } from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { isStaff, useAuth } from '@/lib/auth';

/** Phone app: tapping a notification opens the ride it is about (a new review: the reviews to approve). (Website: see NotificationTap.web.tsx.) */
export function NotificationTap() {
  const { profile, roles } = useAuth();
  const router = useRouter();
  const tapped = useLastNotificationResponse();

  useEffect(() => {
    const data = tapped?.notification.request.content.data;
    if (profile && data?.kind === 'new_review' && roles.includes('admin')) {
      router.push('/admin/reviews');
      return;
    }
    const rideId = data?.ride_id;
    if (!profile || typeof rideId !== 'string') return;
    router.push({ pathname: isStaff(roles) ? '/driver/ride/[id]' : '/customer/ride/[id]', params: { id: rideId } });
  }, [tapped, profile, roles, router]);
  return null;
}
