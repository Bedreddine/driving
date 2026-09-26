import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/** Taxi or VTC: decides whether the driver may propose prices. */
export function useLicence(driverId: string | undefined) {
  const [licence, setLicence] = useState<'vtc' | 'taxi'>('vtc');
  useEffect(() => {
    if (!driverId) return;
    void supabase
      .from('pricing_settings')
      .select('licence')
      .eq('driver_id', driverId)
      .maybeSingle()
      .then(({ data }) => data && setLicence(data.licence as 'vtc' | 'taxi'));
  }, [driverId]);
  return licence;
}
