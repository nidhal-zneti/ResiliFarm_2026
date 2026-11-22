import { Redirect, type Href } from 'expo-router';
import { useEffect, useState } from 'react';

import { getToken } from '@/api/session';

/**
 * Landing route. Sends signed-in users to the tabs and everyone else to the
 * welcome/auth screen, so protected endpoints are never called while signed out.
 */
export default function Index() {
  const [href, setHref] = useState<Href | null>(null);

  useEffect(() => {
    getToken().then((token) => setHref(token ? '/(tabs)' : '/(auth)/welcome'));
  }, []);

  if (!href) return null;
  return <Redirect href={href} />;
}
