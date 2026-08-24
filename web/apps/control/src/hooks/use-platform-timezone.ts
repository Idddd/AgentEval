import { useEffect, useState } from "react";
import {
  getPlatformTimezone,
  PREFERENCES_CHANGED_EVENT,
} from "@/lib/platform-preferences";

export function usePlatformTimezone(): string {
  const [timezone, setTimezone] = useState(getPlatformTimezone);
  useEffect(() => {
    const update = () => setTimezone(getPlatformTimezone());
    window.addEventListener(PREFERENCES_CHANGED_EVENT, update);
    return () => window.removeEventListener(PREFERENCES_CHANGED_EVENT, update);
  }, []);
  return timezone;
}
