import { useEffect, useState } from 'react';
import { getDriver } from './api';

/** Taxi or VTC: decides whether the driver may propose prices. */
export function useLicence() {
  const [licence, setLicence] = useState<'vtc' | 'taxi'>('vtc');
  useEffect(() => {
    void getDriver().then((d) => d && setLicence(d.licence));
  }, []);
  return licence;
}
