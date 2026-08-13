import type { AuthenticatedSocket } from './authenticated-socket.type';
import { AUTH_CONSTANTS } from '../modules/auth/constants/auth.constants';

// Tarayıcıdan gelen bağlantılarda access token httpOnly cookie'de tutuluyor
// (bkz. auth.controller.ts setTokenCookies) — bu yüzden JS tarafından
// okunamıyor, socket.io-client'a auth.token olarak elle verilemiyor.
// withCredentials: true ile handshake isteğine cookie otomatik ekleniyor,
// burada onu parse edip token'ı çıkarıyoruz. auth.token/query.token
// (test-websocket.js'in manuel test script'i) öncelikli kalıyor, geriye
// dönük uyumluluk için.
//
// ÖNEMLİ: Bu fonksiyon hem bağlantı seviyesindeki middleware'de
// (workspace.gateway.ts afterInit) HEM DE mesaj bazlı guard'da
// (ws-auth.guard.ts) kullanılıyor. İkisi ayrı ayrı token çıkarma mantığı
// taşırsa (daha önce olduğu gibi) biri güncellenip diğeri unutulabiliyor —
// tam olarak bu yüzden bağlantı kuruluyordu ama workspace:join reddediliyordu.
export function extractTokenFromHandshake(
  socket: AuthenticatedSocket,
): string | undefined {
  const authToken = socket.handshake.auth?.token as string | undefined;
  if (authToken) return authToken;

  const queryToken = socket.handshake.query?.token as string | undefined;
  if (queryToken) return queryToken;

  return parseCookies(socket.handshake.headers.cookie)[
    AUTH_CONSTANTS.ACCESS_TOKEN_COOKIE
  ];
}

function parseCookies(
  cookieHeader: string | undefined,
): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  for (const pair of cookieHeader.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}
