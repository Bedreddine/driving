import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { BookingForm } from '@/components/BookingForm';
import { Loading, Screen } from '@/components/ui';
import { getRide, type Ride } from '@/lib/api';

export default function Book() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [previous, setPrevious] = useState<Ride | null | undefined>(from ? undefined : null);

  useEffect(() => {
    if (from) void getRide(from).then(setPrevious);
  }, [from]);

  if (previous === undefined) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }
  return (
    <Screen>
      <BookingForm
        key={previous?.id ?? 'new'}
        mode="request"
        from={previous}
        onBooked={(id) => router.replace({ pathname: '/customer/ride/[id]', params: { id, sent: '1' } })}
      />
    </Screen>
  );
}
