import { Redirect } from 'expo-router';
import { Platform, useWindowDimensions } from 'react-native';
import { Loading, Screen } from '@/components/ui';
import { isStaff, useAuth } from '@/lib/auth';

/** Sends each person to their own area: back office (admin on web), driver, or customer. */
export default function Index() {
  const { loading, signedIn, roles } = useAuth();
  const { width } = useWindowDimensions();
  if (loading) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }
  if (!signedIn) return <Redirect href="/book" />;
  // The back office is a desktop page; on a phone-sized screen the owner gets the driver screens.
  if (Platform.OS === 'web' && roles.includes('admin') && width >= 900) return <Redirect href="/admin" />;
  if (isStaff(roles)) return <Redirect href="/driver" />;
  return <Redirect href="/customer" />;
}
