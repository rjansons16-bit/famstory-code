/**
 * HTTP client with automatic token refresh.
 *
 * Four things this layer solves so no call site has to:
 *
 *   1. TOKEN REFRESH. 401 -> refresh -> retry the request once.
 *   2. CONCURRENCY. If five requests get a 401 at the same time, the refresh
 *      happens ONCE and the others await the same promise. Without this, five
 *      parallel refresh calls with rotation would invalidate each other and
 *      sign the user out.
 *   3. ERROR SHAPE. The server returns { error: { code, message } }; here it
 *      becomes an ApiError with a `code` the UI can branch on.
 *   4. AN END. A request that is never answered used to be waited on forever:
 *      a phone that loses signal mid-request leaves a spinner turning with
 *      nothing behind it, and the person has no way to tell that from slow.
 *      Every request is given a deadline, and a connection that fails becomes
 *      the same readable ApiError as a refusal instead of "Failed to fetch".
 */

export interface ApiErrorBody {
  code: string;
  message: string;
  [key: string]: unknown;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body?: ApiErrorBody,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Does this error mean the user must be signed out? */
  get isAuthFailure(): boolean {
    return this.status === 401 || this.code === 'token_reuse_detected';
  }

  /** Did the user hit a free-plan limit? */
  get isPlanLimit(): boolean {
    return this.code === 'plan_limit_reached';
  }
}

export interface TokenStore {
  accessToken: string | null;
  refreshToken: string | null;
  save(tokens: { accessToken: string; refreshToken: string }): void | Promise<void>;
  clear(): void | Promise<void>;
}

export interface HttpClientOptions {
  baseUrl: string;
  tokens: TokenStore;
  locale?: () => string;
  /** Called when refresh fails and the session is over. */
  onSessionExpired?: () => void;
  fetchImpl?: typeof fetch;
  /**
   * How long to wait for an answer before giving up.
   *
   * Long enough for a first request to a server that has to wake up a laptop
   * disk, short enough that a dead connection is reported while the person is
   * still looking at the screen.
   */
  timeoutMs?: number;
}

/** Fifteen seconds. See `timeoutMs`. */
export const DEFAULT_TIMEOUT_MS = 15_000;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Bytes sent as they are - a photograph - instead of a JSON body. */
  raw?: { body: Blob; contentType: string };
  query?: Record<string, string | number | boolean | undefined>;
  /** Endpoints that must not attempt a refresh (refresh itself, sign-in). */
  skipAuth?: boolean;
}

export class HttpClient {
  private refreshing: Promise<boolean> | null = null;

  constructor(private readonly options: HttpClientOptions) {}

  get<T>(path: string, query?: RequestOptions['query']): Promise<T> {
    return this.request<T>(path, { method: 'GET', query });
  }

  post<T>(path: string, body?: unknown, opts?: { skipAuth?: boolean }): Promise<T> {
    return this.request<T>(path, { method: 'POST', body, skipAuth: opts?.skipAuth });
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body });
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  /**
   * A file as the whole body, signed in like any other request - so an
   * expired token is renewed and the upload retried, which a bare fetch would
   * not do. A Blob can be read twice, which is what makes the retry possible.
   */
  putBytes<T>(path: string, body: Blob, contentType: string): Promise<T> {
    return this.request<T>(path, { method: 'PUT', raw: { body, contentType } });
  }

  // -------------------------------------------------------------------------

  private async request<T>(path: string, opts: RequestOptions, isRetry = false): Promise<T> {
    const doFetch = this.options.fetchImpl ?? fetch;
    const url = this.buildUrl(path, opts.query);

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Accept-Language': this.options.locale?.() ?? 'en',
    };
    if (opts.raw) headers['Content-Type'] = opts.raw.contentType;
    else if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    const token = this.options.tokens.accessToken;
    if (token && !opts.skipAuth) headers.Authorization = `Bearer ${token}`;

    const response = await this.fetchWithDeadline(doFetch, url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.raw
        ? opts.raw.body
        : opts.body === undefined
          ? undefined
          : JSON.stringify(opts.body),
    });

    if (response.status === 401 && !opts.skipAuth && !isRetry) {
      const renewed = await this.ensureRefreshed();
      if (renewed) return this.request<T>(path, opts, true);

      await this.options.tokens.clear();
      this.options.onSessionExpired?.();
    }

    if (!response.ok) throw await toApiError(response);

    // 204 and empty responses.
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /**
   * The fetch itself, with a deadline and without the browser's wording.
   *
   * An AbortController with a timer rather than `AbortSignal.timeout`: the
   * static helper is not in every JavaScript engine this app runs on, and a
   * missing one would throw on the first request instead of the first timeout.
   */
  private async fetchWithDeadline(
    doFetch: typeof fetch,
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    try {
      return await doFetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      throw unreachable(error);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * One refresh shared by every in-flight request. This is the only way token
   * rotation survives concurrent calls.
   */
  private ensureRefreshed(): Promise<boolean> {
    if (!this.refreshing) {
      this.refreshing = this.refresh().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  private async refresh(): Promise<boolean> {
    const refreshToken = this.options.tokens.refreshToken;
    if (!refreshToken) return false;

    try {
      const pair = await this.request<{ accessToken: string; refreshToken: string }>(
        '/auth/refresh',
        { method: 'POST', body: { refreshToken }, skipAuth: true },
      );
      await this.options.tokens.save(pair);
      return true;
    } catch {
      return false;
    }
  }

  private buildUrl(path: string, query?: RequestOptions['query']): string {
    const base = this.options.baseUrl.replace(/\/+$/, '');
    const url = new URL(`${base}${path.startsWith('/') ? path : `/${path}`}`);

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }
}

/**
 * A connection that never became a response.
 *
 * Status 0, because there was none. The code is one the UI already knows how
 * to phrase (lib/auth-errors.ts), and the message never carries the engine's
 * own wording - "Failed to fetch" and "Network request failed" are the two
 * sentences a person is most likely to read here, and neither says what to do.
 */
function unreachable(error: unknown): ApiError {
  // An ApiError from a nested call (the refresh) travels unchanged.
  if (error instanceof ApiError) return error;

  const aborted = error instanceof Error && error.name === 'AbortError';

  return new ApiError(
    0,
    aborted ? 'request_timed_out' : 'network_unreachable',
    aborted
      ? 'The server took too long to answer. Check your connection and try again.'
      : 'Cannot reach the FamStory server. Check your connection.',
  );
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody | undefined;
  try {
    const parsed = (await response.json()) as { error?: ApiErrorBody };
    body = parsed.error;
  } catch {
    // Not JSON, e.g. a proxy 502 page.
  }

  return new ApiError(
    response.status,
    body?.code ?? `http_${response.status}`,
    body?.message ?? response.statusText ?? 'Request failed',
    body,
  );
}
