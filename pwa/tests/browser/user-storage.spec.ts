import { expect, test, type Page } from '@playwright/test';
import type { Mutation, MutationResult, OperationReceipt, UserRecord, UserStore } from '../../src/storage/user';

// Serialize the fixture bridge explicitly; Playwright's recursive mapped types cannot model JsonValue.
async function call<T = unknown>(page: Page, method: string, args: unknown[] = []): Promise<T> {
  const serialized = await page.evaluate(async ({ method, args }) => {
    const harness = window.storageHarness as unknown as Record<string, (...args: unknown[]) => unknown>;
    return JSON.stringify({ value: await harness[method]!(...JSON.parse(args) as unknown[]) });
  }, { method, args: JSON.stringify(args) });
  return (JSON.parse(serialized) as { value: T }).value;
}
const pageErrors = new WeakMap<Page, string[]>();
test.afterEach(async ({ page }) => { expect(pageErrors.get(page)).toEqual([]); });
test.beforeEach(async ({ page }) => {
  const errors: string[] = []; pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/tests/browser/user-storage.html');
  await page.waitForFunction(() => !!window.storageHarness);
});
const command = (operationId: string, store: UserStore = 'preferences'): Mutation => ({ namespace: 'guest', store, id: 'example', value: { selected: 'synth_clarinet' }, operationId, createdAt: 100 });

test('records and outbox survive reload, namespace changes and isolated catalog replacement', async ({ page }) => {
  const name = 'test-user-restart';
  await call(page, 'open', [name]);
  for (const store of ['preferences', 'playlists', 'playlistEntries', 'history', 'harvests', 'songOctaveOffsets', 'learningEvidence', 'learningSummaries', 'quizPreferences', 'learningProfiles'] as UserStore[]) {
    await call(page, 'mutate', [command(`save-${store}`, store)]);
  }
  await page.reload(); await page.waitForFunction(() => !!window.storageHarness);
  await call(page, 'open', [name]);
  const serialized = await page.evaluate(async () => {
    const h = window.storageHarness;
    const catalog = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('test-replaceable-catalog'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    catalog.close();
    await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase('test-replaceable-catalog'); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
    return JSON.stringify({ guest: await Promise.all(h.stores.map(store => h.get('guest', store, 'example'))), account: await h.get(h.account, 'preferences', 'example'), pending: await h.pending('guest') });
  });
  const snapshot = JSON.parse(serialized) as { guest: unknown[]; account: unknown; pending: unknown[] };
  expect(snapshot.guest).toHaveLength(10); expect(snapshot.guest.every(Boolean)).toBe(true);
  expect(snapshot.account).toBeNull(); expect(snapshot.pending).toHaveLength(10);
});

test('one command commits atomically and replay cannot duplicate or overwrite an acknowledged operation', async ({ page }) => {
  await call(page, 'open', ['test-user-atomic']);
  const cmd = command('op-1');
  expect((await call<MutationResult>(page, 'mutate', [cmd])).applied).toBe(true);
  expect((await call<MutationResult>(page, 'mutate', [cmd])).applied).toBe(false);
  expect(await call(page, 'abortNextMutation', [{ ...command('op-failure'), value: { selected: 'wrong' } }])).toBe(true);
  expect(await call(page, 'pending', ['guest'])).toHaveLength(1);
  expect((await call<UserRecord>(page, 'get', ['guest', 'preferences', 'example'])).value).toEqual(cmd.value);
  await call(page, 'acknowledge', ['guest', ['op-1'], 200]);
  expect(await call(page, 'pending', ['guest'])).toHaveLength(0);
  expect((await call<MutationResult>(page, 'mutate', [cmd])).applied).toBe(false);
  await expect(call(page, 'mutate', [{ ...cmd, value: 'changed' }])).rejects.toThrow();
  const third = await call<MutationResult>(page, 'mutate', [command('op-3')]);
  expect(third.receipt.sequence).toBe(2);
});

test('tombstones and missing-ack rollback retain durable evidence', async ({ page }) => {
  await call(page, 'open', ['test-user-delete']);
  await call(page, 'mutate', [command('op-1')]);
  await call(page, 'mutate', [{ ...command('op-delete'), deleted: true }]);
  expect(await call(page, 'list', ['guest', 'preferences'])).toHaveLength(0);
  expect((await call<UserRecord>(page, 'get', ['guest', 'preferences', 'example'])).deleted).toBe(true);
  await expect(call(page, 'acknowledge', ['guest', ['op-1', 'unknown'], 200])).rejects.toThrow();
  expect(await call<OperationReceipt[]>(page, 'pending', ['guest'])).toHaveLength(2);
});

test('non-destructive v1 upgrade and blocked other-connection upgrade preserve old records', async ({ page }) => {
  const serialized = await page.evaluate(async () => {
    const h = window.storageHarness;
    const held = await h.seedV1('test-user-migration', true);
    let blocked = false;
    try { await h.open('test-user-migration'); } catch { blocked = true; }
    held!.close();
    await h.open('test-user-migration');
    return JSON.stringify({ blocked, row: await h.get('guest', 'playlists', 'old'), pending: await h.pending('guest') });
  });
  const result = JSON.parse(serialized) as { blocked: boolean; row: UserRecord; pending: unknown[] };
  expect(result.blocked).toBe(true); expect(result.row.value).toEqual({ name: 'Preserved' }); expect(result.pending).toEqual([]);
});
