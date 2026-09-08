import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, setCsrfToken } from './api.js';

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api CSRF recovery', () => {
  beforeEach(() => {
    localStorage.clear();
    setCsrfToken('');
    vi.restoreAllMocks();
  });

  it('shares the latest CSRF token through localStorage', async () => {
    setCsrfToken('token-from-another-tab');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, { ok: true }));

    await api('/api/crm/v1/opportunities/123/claim', { method: 'POST', body: { version: 1 } });

    expect(fetchMock.mock.calls[0][1].headers['X-CSRF-Token']).toBe('token-from-another-tab');
  });

  it('refreshes the session and retries once after an expired CSRF token', async () => {
    setCsrfToken('expired-token');
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(403, { error: 'Solicitud no autorizada' }))
      .mockResolvedValueOnce(jsonResponse(200, { authenticated: true, csrfToken: 'fresh-token', user: { id: '1' } }))
      .mockResolvedValueOnce(jsonResponse(200, { claimed: true }));

    await expect(api('/api/crm/v1/opportunities/123/claim', { method: 'POST', body: { version: 1 } }))
      .resolves.toEqual({ claimed: true });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/crm/v1/auth/session');
    expect(fetchMock.mock.calls[2][1].headers['X-CSRF-Token']).toBe('fresh-token');
  });
});
