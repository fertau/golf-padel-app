import { adminAuth } from "./firebaseAdmin.js";
import type { VercelRequestLike } from "./http.js";

export const getBearerToken = (req: VercelRequestLike & { headers?: Record<string, string | string[] | undefined> }) => {
  const rawHeader = req.headers?.authorization ?? req.headers?.Authorization;
  const raw = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (!raw) return null;
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
};

export const requireAuthUid = async (
  req: VercelRequestLike & { headers?: Record<string, string | string[] | undefined> }
): Promise<string> => {
  const token = getBearerToken(req);
  if (!token) {
    throw new Error("Falta token de autenticación.");
  }

  const decoded = await adminAuth.verifyIdToken(token);
  return decoded.uid;
};
