export interface JwtPayload {
  sub: string; // userId
  email: string;
  iat?: number; // issued at
  exp?: number; // expires at
}

export interface JwtRefreshPayload extends JwtPayload {
  refreshToken: string;
}
