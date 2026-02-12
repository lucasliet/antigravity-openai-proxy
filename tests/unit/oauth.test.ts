import { assertEquals, assertExists } from 'asserts';
import { getAccessToken, getCacheMetrics, clearTokenCache, getProjectId } from '../../src/antigravity/oauth.ts';

const VALID_REFRESH_TOKEN = 'test_refresh_token_valid';
const EXPIRED_REFRESH_TOKEN = 'test_refresh_token_expired';
const INVALID_REFRESH_TOKEN = 'test_refresh_token_invalid';

const originalFetch = globalThis.fetch;

async function mockTokenFetch(response: {
  ok: boolean;
  status: number;
  data?: unknown;
}) {
  globalThis.fetch = () =>
    Promise.resolve({
      ok: response.ok,
      status: response.status,
      json: () => Promise.resolve(response.data),
      text: () => Promise.resolve(JSON.stringify(response.data)),
    } as Response);
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

Deno.test('Deve retornar token em cache hit', async () => {
  clearTokenCache();

  const mockData = {
    access_token: 'cached_access_token',
    expires_in: 3600,
  };

  await mockTokenFetch({
    ok: true,
    status: 200,
    data: mockData,
  });

  const token1 = await getAccessToken(VALID_REFRESH_TOKEN);
  const metrics1 = getCacheMetrics();

  const token2 = await getAccessToken(VALID_REFRESH_TOKEN);
  const metrics2 = getCacheMetrics();

  assertEquals(token1, token2);
  assertEquals(metrics2.hits, metrics1.hits + 1);

  restoreFetch();
  clearTokenCache();
});

Deno.test('Deve fazer refresh quando token expira', async () => {
  clearTokenCache();

  const mockData = {
    access_token: 'new_access_token',
    expires_in: 3600,
  };

  await mockTokenFetch({
    ok: true,
    status: 200,
    data: mockData,
  });

  const token = await getAccessToken(EXPIRED_REFRESH_TOKEN);
  const metrics = getCacheMetrics();

  assertExists(token);
  assertEquals(token, mockData.access_token);
  assertEquals(metrics.refreshes, 1);

  restoreFetch();
  clearTokenCache();
});

Deno.test('Deve lançar erro quando token é inválido', async () => {
  clearTokenCache();

  await mockTokenFetch({
    ok: false,
    status: 401,
    data: { error: 'invalid_grant' },
  });

  let errorThrown = false;
  try {
    await getAccessToken(INVALID_REFRESH_TOKEN);
  } catch (e) {
    errorThrown = true;
    assertEquals((e as Error).name, 'OAuthError');
  }

  assertEquals(errorThrown, true);

  restoreFetch();
  clearTokenCache();
});

Deno.test('Deve evitar race condition em refresh simultâneo', async () => {
  clearTokenCache();

  const mockData = {
    access_token: 'shared_access_token',
    expires_in: 3600,
  };

  let fetchCount = 0;
  globalThis.fetch = () => {
    fetchCount++;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockData),
      text: () => Promise.resolve(JSON.stringify(mockData)),
    } as Response);
  };

  const promises = [
    getAccessToken('race_token'),
    getAccessToken('race_token'),
    getAccessToken('race_token'),
  ];

  await Promise.all(promises);
  const metrics = getCacheMetrics();

  assertEquals(fetchCount, 1, 'Deve fazer apenas uma requisição de refresh');
  assertEquals(metrics.refreshes, 1);

  restoreFetch();
  clearTokenCache();
});
