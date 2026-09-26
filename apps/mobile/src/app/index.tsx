import { Redirect } from 'expo-router';
import { Platform } from 'react-native';
import { Loading, Screen } from '@/components/ui';
import { isStaff, useAuth } from '@/lib/auth';

/** Sends each person to their own area: back office (admin on web), driver, or customer. */
export default function Index() {
  const { loading, session, roles } = useAuth();
  if (loading || (session && roles.length === 0)) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }
  if (!session) return <Redirect href="/sign-in" />;
  if (Platform.OS === 'web' && roles.includes('admin')) return <Redirect href="/admin" />;
  if (isStaff(roles)) return <Redirect href="/driver" />;
  return <Redirect href="/customer" />;
}
