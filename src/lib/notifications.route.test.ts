import { describe, it, expect, beforeEach, vi } from 'vitest';

// v1.16 (limecore#36) — MainActivity is exported, so the notification tap
// route can come from any installed app. Only plain in-app paths are followed.

type Listener = (event: any) => void;
const plugin = vi.hoisted(() => ({
  listeners: {} as Record<string, Listener>,
  pendingTap: { route: '' },
  pendingAction: { actionId: '', route: '', extraJson: '' },
}));

vi.mock('@capacitor/core', async (orig) => ({
  ...(await orig<typeof import('@capacitor/core')>()),
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}));
vi.mock('./nexusNotificationsPlugin', () => ({
  NexusNotifications: {
    addListener: async (name: string, fn: Listener) => {
      plugin.listeners[name] = fn;
      return { remove: () => {} };
    },
    consumePendingTap: async () => plugin.pendingTap,
    consumePendingAction: async () => plugin.pendingAction,
  },
}));

const { isAppRoute, onNotificationTap, onNotificationAction } = await import('./notifications');

beforeEach(() => {
  plugin.listeners = {};
  plugin.pendingTap = { route: '' };
  plugin.pendingAction = { actionId: '', route: '', extraJson: '' };
});

describe('isAppRoute', () => {
  it.each(['/', '/finance/budgets', '/tasks/add?id=0b6f2c1e-8a2d-4b8e-9c61-3f1f0c9d2a11', '/habits#today'])(
    'accepts the in-app path %s',
    (r) => expect(isAppRoute(r)).toBe(true),
  );

  it.each([
    ['protocol-relative', '//evil.example'],
    ['slash-backslash', '/\\evil.example'],
    ['backslash-backslash', '\\\\evil.example'],
    ['backslash later in the path', '/finance\\..\\x'],
    ['absolute URL', 'https://evil.example/'],
    ['javascript: URL', 'javascript:alert(1)'],
    ['relative path', 'finance/budgets'],
    ['control character', '/finance\n//evil.example'],
    ['empty', ''],
    ['too long', '/' + 'a'.repeat(600)],
  ])('refuses a %s route', (_label, r) => expect(isAppRoute(r)).toBe(false));

  it('refuses a non-string', () => {
    expect(isAppRoute(undefined)).toBe(false);
    expect(isAppRoute(42)).toBe(false);
  });
});

describe('tap and action routing', () => {
  it('follows a warm tap on an in-app route, and drops a hostile one', async () => {
    const onOpen = vi.fn();
    await onNotificationTap(onOpen);
    plugin.listeners.notificationTap({ route: '/finance/budgets' });
    plugin.listeners.notificationTap({ route: '//evil.example' });
    plugin.listeners.notificationTap({ route: '/\\evil.example' });
    expect(onOpen.mock.calls).toEqual([['/finance/budgets']]);
  });

  it('drops a hostile cold-start tap from the buffer', async () => {
    plugin.pendingTap = { route: '\\\\evil.example' };
    const onOpen = vi.fn();
    await onNotificationTap(onOpen);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('keeps an action but blanks a hostile route, so "done" still works and "view" goes nowhere', async () => {
    const handler = vi.fn();
    await onNotificationAction(handler);
    plugin.listeners.notificationAction({ actionId: 'view', route: '//evil.example', extraJson: '{"taskId":"t1"}' });
    plugin.listeners.notificationAction({ actionId: 'view', route: '/finance/budgets', extraJson: '' });
    expect(handler.mock.calls.map(([p]) => [p.actionId, p.route])).toEqual([
      ['view', ''],
      ['view', '/finance/budgets'],
    ]);
  });
});
