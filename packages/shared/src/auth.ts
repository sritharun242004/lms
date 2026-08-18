import { UserRole } from "./constants";

export function isValidJwtIdentity(payload: { sub?: unknown; role?: unknown }): boolean {
  return typeof payload.sub === "string" && payload.sub.length > 0 &&
    Object.values(UserRole).includes(payload.role as UserRole);
}

export function isValidJwtSessionClaims(
  payload: { sub?: unknown; role?: unknown; authVersion?: unknown }
): boolean {
  return isValidJwtIdentity(payload) && (
    payload.authVersion === undefined ||
    (Number.isInteger(payload.authVersion) && (payload.authVersion as number) >= 0)
  );
}

export function isAuthVersionCurrent(claim: unknown, currentVersion: number): boolean {
  const normalizedClaim = claim === undefined ? 0 : claim;
  return Number.isInteger(normalizedClaim) &&
    (normalizedClaim as number) >= 0 &&
    normalizedClaim === currentVersion;
}
