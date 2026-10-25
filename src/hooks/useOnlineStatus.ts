import { useEffect, useState } from 'react';

/**
 * Tracks real browser connectivity via navigator.onLine + the online/offline
 * events. This only reflects "does the device have a network interface up"
 * (browsers can't reliably detect true internet reachability) — which is
 * exactly the signal Nightingale's SMS-over-cellular fallback relies on too:
 * SMS still goes out over plain cellular signal even when there's no usable
 * data connection, so "offline" here means "don't bother hitting our
 * backend, go straight to the phone's native SMS composer instead."
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return isOnline;
}