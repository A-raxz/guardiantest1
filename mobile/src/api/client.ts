import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'guardians.auth.token';

/**
 * Where the API lives.
 *
 * EXPO_PUBLIC_API_URL wins (that is what the EAS build profiles set). In local
 * development we fall back to the host running `expo start` on port 4000, which
 * is the address a phone on the same Wi-Fi can actually reach — "localhost"
 * would point the phone at itself.
 */
function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  const hostUri = Constants.expoConfig?.hostUri ?? (Constants as any).expoGoConfig?.debuggerHost;
  const host = typeof hostUri === 'string' ? hostUri.split(':')[0] : null;
  if (host) return `http://${host}:4000`;

  // Android emulators reach the host machine on 10.0.2.2.
  return Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
}

export const API_BASE_URL = resolveBaseUrl();

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

let inMemoryToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

/** Called by the auth context so a stale session bounces the user to login. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export async function loadToken(): Promise<string | null> {
  if (inMemoryToken) return inMemoryToken;
  try {
    inMemoryToken = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    inMemoryToken = null;
  }
  return inMemoryToken;
}

export async function saveToken(token: string | null) {
  inMemoryToken = token;
  try {
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // A device without a keystore still works for the life of the session.
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Skip the automatic sign-out on a 401 (used by the login screen itself). */
  anonymous?: boolean;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, anonymous = false } = options;
  const token = anonymous ? null : await loadToken();

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError(0, `Cannot reach the Guardians server at ${API_BASE_URL}. Check your connection.`);
  }

  const text = await response.text();
  const payload = text ? safeParse(text) : null;

  if (!response.ok) {
    const message = payload?.error?.message ?? `Request failed (${response.status})`;
    if (response.status === 401 && !anonymous) onUnauthorized?.();
    throw new ApiError(response.status, message, payload?.error?.details);
  }
  return payload as T;
}

function safeParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
