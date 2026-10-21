import type { Request } from 'express';

/**
 * Where this server is reachable, as the client just reached it.
 *
 * Links the server hands out - photographs, calendar feeds, guest links - are
 * built against this, so the same server answers correctly on the LAN,
 * through a tunnel and on a domain without being told which one it is behind.
 */
export function originOf(req: Request): string {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = typeof forwardedProto === 'string' ? forwardedProto.split(',')[0] : req.protocol;

  return `${protocol}://${req.headers.host ?? 'localhost'}`;
}
