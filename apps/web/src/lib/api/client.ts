import type { ApiResponse } from "@lms/shared";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// ============================================================
// BASE FETCH WRAPPER
// ============================================================

interface FetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
}

/**
 * Typed fetch wrapper with automatic JSON handling,
 * error normalization, and auth header injection.
 */
async function apiFetch<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<ApiResponse<T>> {
  const { body, params, headers: customHeaders, ...restOptions } = options;

  // Build URL with query parameters
  const url = new URL(`/api/v1${endpoint}`, BASE_URL);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...customHeaders,
  };

  const config: RequestInit = {
    ...restOptions,
    headers,
    credentials: "include", // Include cookies for auth
  };
  if (body !== undefined) {
    config.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url.toString(), config);
    const data: ApiResponse<T> = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || {
          code: "REQUEST_FAILED",
          message: `Request failed with status ${response.status}`,
        },
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: {
        code: "NETWORK_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      },
    };
  }
}

/**
 * Multipart upload — deliberately skips `apiFetch`'s JSON content-type
 * and stringify step so the browser can set its own
 * `multipart/form-data; boundary=...` header for the FormData body.
 */
async function apiFormFetch<T>(endpoint: string, formData: FormData): Promise<ApiResponse<T>> {
  const url = new URL(`/api/v1${endpoint}`, BASE_URL);

  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    const data: ApiResponse<T> = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || {
          code: "REQUEST_FAILED",
          message: `Request failed with status ${response.status}`,
        },
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: {
        code: "NETWORK_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      },
    };
  }
}

// ============================================================
// API CLIENT
// ============================================================

export const apiClient = {
  get: <T>(endpoint: string, params?: FetchOptions["params"]) =>
    apiFetch<T>(endpoint, { method: "GET", params }),

  post: <T>(endpoint: string, body?: unknown) =>
    apiFetch<T>(endpoint, { method: "POST", body }),

  postForm: <T>(endpoint: string, formData: FormData) => apiFormFetch<T>(endpoint, formData),

  patch: <T>(endpoint: string, body?: unknown) =>
    apiFetch<T>(endpoint, { method: "PATCH", body }),

  put: <T>(endpoint: string, body?: unknown) =>
    apiFetch<T>(endpoint, { method: "PUT", body }),

  delete: <T>(endpoint: string) =>
    apiFetch<T>(endpoint, { method: "DELETE" }),
};
