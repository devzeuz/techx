// Retrieves the current user's JWT from Amplify and attaches it to every API call.
import { fetchAuthSession } from 'aws-amplify/auth';

// HTTP API base URL (Terraform output `api_url`). Override with VITE_API_URL.
export const API_URL =
  import.meta.env.VITE_API_URL ?? 'https://c54htww8j8.execute-api.us-east-1.amazonaws.com';

/**
 * Full-detail request.
 * Returns { ok, status, data } — never throws. `data` is parsed JSON or null.
 */
export const apiFetch = async (endpoint, method = 'GET', body = null) => {
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();

    if (!token) {
      console.error('[apiFetch] No ID token — user may not be authenticated.');
      return { ok: false, status: 401, data: null };
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      method,
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : null,
    });

    let data = null;
    try { data = await response.json(); } catch { /* empty body */ }

    if (!response.ok) {
      console.error(`[apiFetch] HTTP ${response.status} — ${endpoint}`, data);
    }
    return { ok: response.ok, status: response.status, data };
  } catch (err) {
    console.error('[apiFetch] Exception:', err);
    return { ok: false, status: 0, data: null };
  }
};

/**
 * Central API helper (original contract, used across the app).
 * Returns:
 *   - parsed JSON on success
 *   - null  on any error (auth, network, HTTP 4xx/5xx)
 */
export const apiRequest = async (endpoint, method = 'GET', body = null) => {
  const { ok, data } = await apiFetch(endpoint, method, body);
  return ok ? data : null;  // [] is a valid success response
};