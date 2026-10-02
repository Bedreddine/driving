import { Redirect } from 'expo-router';
import { Platform } from 'react-native';
import { Loading, Screen } from '@/components/ui';
import { isStaff, useAuth } from '@/lib/auth';

/** Sends each person to their own area: back office (admin on web), driver, or customer. */
export default function Index() {
  const { loading, signedIn, roles } = useAuth();
  if (loading) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }
  if (!signedIn) return <Redirect href={Platform.OS === 'web' ? '/book' : '/sign-in'} />;
  if (Platform.OS === 'web' && roles.includes('admin')) return <Redirect href="/admin" />;
  if (isStaff(roles)) return <Redirect href="/driver" />;
  return <Redirect href="/customer" />;
}
