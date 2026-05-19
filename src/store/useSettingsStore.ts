// User preferences. Currently base currency for the portfolio + the Sunday
// Weekly Review reminder toggle. Persisted via Capacitor Preferences (with
// localStorage fallback for web dev).
import { create } from 'zustand';
import { Preferences } from '@capacitor/preferences';

export const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP', 'SEK', 'NOK', 'DKK', 'CHF', 'JPY'] as const;
export type BaseCurrency = (typeof SUPPORTED_CURRENCIES)[number];

const CURRENCY_KEY = 'settings.baseCurrency';
const REMINDER_KEY = 'settings.weeklyReminder';

interface SettingsStore {
  baseCurrency: BaseCurrency;
  weeklyReminder: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  setBaseCurrency: (c: BaseCurrency) => Promise<void>;
  setWeeklyReminder: (on: boolean) => Promise<void>;
}

async function readPref(key: string): Promise<string | null> {
  try {
    const { value } = await Preferences.get({ key });
    if (value) return value;
  } catch {
    return localStorage.getItem(key);
  }
  return null;
}

async function writePref(key: string, value: string): Promise<void> {
  try {
    await Preferences.set({ key, value });
  } catch {
    localStorage.setItem(key, value);
  }
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  baseCurrency: 'EUR',
  weeklyReminder: false,
  loaded: false,

  async load() {
    const [currency, reminder] = await Promise.all([
      readPref(CURRENCY_KEY),
      readPref(REMINDER_KEY),
    ]);
    set({
      baseCurrency:
        currency && (SUPPORTED_CURRENCIES as readonly string[]).includes(currency)
          ? (currency as BaseCurrency)
          : 'EUR',
      weeklyReminder: reminder === '1',
      loaded: true,
    });
  },

  async setBaseCurrency(c) {
    await writePref(CURRENCY_KEY, c);
    set({ baseCurrency: c });
  },

  async setWeeklyReminder(on) {
    await writePref(REMINDER_KEY, on ? '1' : '0');
    set({ weeklyReminder: on });
  },
}));
