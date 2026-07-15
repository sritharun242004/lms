import { NextRequest, NextResponse } from "next/server";
import { ZodError, ZodSchema } from "zod";
import type { ApiResponse, PaginationMeta } from "@cms/shared";

// ============================================================
// API RESPONSE HELPERS
// ============================================================

/**
 * Create a success response with data.
 */
export function successResponse<T>(
  data: T,
  meta?: PaginationMeta,
  status = 200
): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      ...(meta && { meta }),
    },
    { status }
  );
}

/**
 * Create an error response.
 */
export function errorResponse(
  message: string,
  code: string = "INTERNAL_ERROR",
  status = 500,
  details?: Record<string, string[]>
): NextResponse<ApiResponse<never>> {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        ...(details && { details }),
      },
    },
    { status }
  );
}

/**
 * Create a validation error response from Zod errors.
 */
export function validationErrorResponse(
  error: ZodError
): NextResponse<ApiResponse<never>> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    if (!details[path]) {
      details[path] = [];
    }
    details[path].push(issue.message);
  }

  return errorResponse(
    "Validation failed",
    "VALIDATION_ERROR",
    400,
    details
  );
}

// ============================================================
// REQUEST PARSING
// ============================================================

/**
 * Parse and validate the request body against a Zod schema.
 */
export async function parseBody<T>(
  req: NextRequest,
  schema: ZodSchema<T>
): Promise<{ data: T; error?: never } | { data?: never; error: NextResponse }> {
  try {
    const body = await req.json();
    const result = schema.safeParse(body);

    if (!result.success) {
      return { error: validationErrorResponse(result.error) };
    }

    return { data: result.data };
  } catch {
    return {
      error: errorResponse("Invalid request body", "PARSE_ERROR", 400),
    };
  }
}

/**
 * Parse query parameters against a Zod schema.
 */
export function parseQuery<T>(
  req: NextRequest,
  schema: ZodSchema<T>
): { data: T; error?: never } | { data?: never; error: NextResponse } {
  const searchParams = Object.fromEntries(req.nextUrl.searchParams);
  const result = schema.safeParse(searchParams);

  if (!result.success) {
    return { error: validationErrorResponse(result.error) };
  }

  return { data: result.data };
}

// ============================================================
// PAGINATION HELPER
// ============================================================

/**
 * Create pagination metadata from total count and current page/limit.
 */
export function createPaginationMeta(
  total: number,
  page: number,
  limit: number
): PaginationMeta {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/**
 * Calculate skip value for Prisma pagination.
 */
export function getSkip(page: number, limit: number): number {
  return (page - 1) * limit;
}
