// Health Connect integration. Pulls steps + weight from the Android Health
// Connect data layer (which Samsung Health writes to on Samsung phones).

import { Capacitor } from '@capacitor/core';

export interface HealthCapability {
  available: boolean;
  reason: string;
  needsInstall?: boolean;
}

type RecordType = 'Steps' | 'Weight' | 'ActivitySession' | 'SleepSession' | 'RestingHeartRate';
type AggregateRecordType = 'Steps' | 'Distance' | 'TotalCaloriesBurned' | 'ActiveCaloriesBurned' | 'HeartRate';

interface PermissionsResponse {
  read: RecordType[];
  write: RecordType[];
}

interface AggregateData {
  startTime: string;
  endTime: string;
  value: number;
  unit?: string;
}

interface HealthConnectModule {
  HealthConnect: {
    checkAvailability: () => Promise<{ availability: 'Available' | 'NotInstalled' | 'NotSupported' | string }>;
    requestPermissions: (opts: { read: RecordType[]; write: RecordType[] }) => Promise<PermissionsResponse>;
    getGrantedPermissions: () => Promise<PermissionsResponse>;
    readRecords: (opts: {
      start: string;
      end: string;
      type: RecordType;
      pageSize?: number;
      pageToken?: string;
    }) => Promise<{ records: any[]; nextPageToken?: string }>;
    aggregateRecords: (opts: {
      start: string;
      end: string;
      type: AggregateRecordType;
      groupBy?: 'day' | 'hour' | 'week' | 'month';
    }) => Promise<{ aggregates: AggregateData[] }>;
  };
}

let cached: HealthConnectModule | null | undefined;

async function loadPlugin(): Promise<HealthConnectModule | null> {
  if (cached !== undefined) return cached;
  if (!Capacitor.isNativePlatform()) {
    cached = null;
    return null;
  }
  try {
    cached = (await import('@devmaxime/capacitor-health-connect')) as unknown as HealthConnectModule;
    return cached;
  } catch {
    cached = null;
    return null;
  }
}

export async function healthCapability(): Promise<HealthCapability> {
  if (!Capacitor.isNativePlatform()) {
    return {
      available: false,
      reason: 'Health Connect is Android-only. Use manual entry in the browser.',
    };
  }
  const mod = await loadPlugin();
  if (!mod) {
    return {
      available: false,
      reason: 'Health Connect plugin not installed yet.',
      needsInstall: true,
    };
  }
  try {
    const status = await mod.HealthConnect.checkAvailability();
    if (status.availability === 'Available') {
      return { available: true, reason: 'Ready.' };
    }
    if (status.availability === 'NotInstalled') {
      return {
        available: false,
        reason: 'Health Connect app not installed on this phone. Open Play Store and install Health Connect by Google.',
      };
    }
    return { available: false, reason: `Health Connect unavailable: ${status.availability}` };
  } catch (e) {
    return { available: false, reason: (e as Error).message };
  }
}

const READ_PERMS: RecordType[] = ['Steps', 'Weight'];

export async function requestHealthPermissions(): Promise<{ ok: boolean; reason?: string }> {
  const mod = await loadPlugin();
  if (!mod) return { ok: false, reason: 'Plugin missing.' };
  try {
    const result = await mod.HealthConnect.requestPermissions({
      read: READ_PERMS,
      write: [],
    });
    const granted = result.read ?? [];
    if (granted.length === 0) {
      return { ok: false, reason: 'No permissions granted. Open Health Connect settings and allow Steps/Weight.' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

export async function hasHealthPermissions(): Promise<boolean> {
  const mod = await loadPlugin();
  if (!mod) return false;
  try {
    const result = await mod.HealthConnect.getGrantedPermissions();
    return (result.read?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function readTodaySteps(): Promise<number | null> {
  const mod = await loadPlugin();
  if (!mod) return null;
  try {
    const start = startOfDay(new Date());
    const end = new Date();
    const result = await mod.HealthConnect.aggregateRecords({
      start: start.toISOString(),
      end: end.toISOString(),
      type: 'Steps',
      groupBy: 'day',
    });
    const total = (result.aggregates ?? []).reduce((sum, a) => sum + (a.value || 0), 0);
    return total;
  } catch {
    return null;
  }
}

export async function readWeeklySteps(): Promise<number[] | null> {
  // Returns 7 numbers Monday → Sunday for the current ISO week.
  const mod = await loadPlugin();
  if (!mod) return null;
  try {
    const today = startOfDay(new Date());
    const day = today.getDay() === 0 ? 7 : today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (day - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 7);
    const result = await mod.HealthConnect.aggregateRecords({
      start: monday.toISOString(),
      end: sunday.toISOString(),
      type: 'Steps',
      groupBy: 'day',
    });
    const buckets: number[] = [0, 0, 0, 0, 0, 0, 0];
    for (const a of result.aggregates ?? []) {
      const d = startOfDay(new Date(a.startTime));
      const idx = Math.floor((d.getTime() - monday.getTime()) / 86400000);
      if (idx >= 0 && idx < 7) buckets[idx] = a.value || 0;
    }
    return buckets;
  } catch {
    return null;
  }
}

export async function readLatestWeightKg(): Promise<number | null> {
  const mod = await loadPlugin();
  if (!mod) return null;
  try {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 90);
    const result = await mod.HealthConnect.readRecords({
      type: 'Weight',
      start: start.toISOString(),
      end: end.toISOString(),
    });
    const records = result.records ?? [];
    if (records.length === 0) return null;
    const sorted = records
      .slice()
      .sort((a: any, b: any) => {
        const at = new Date(a.time ?? a.startTime ?? a.endTime ?? 0).getTime();
        const bt = new Date(b.time ?? b.startTime ?? b.endTime ?? 0).getTime();
        return bt - at;
      });
    const latest = sorted[0];
    const kg =
      latest?.weight?.kilograms ??
      latest?.weight?.value ??
      latest?.value ??
      latest?.kilograms ??
      null;
    return typeof kg === 'number' ? Math.round(kg * 10) / 10 : null;
  } catch {
    return null;
  }
}
