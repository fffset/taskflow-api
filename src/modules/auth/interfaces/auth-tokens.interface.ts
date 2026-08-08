export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// Login/register response'u için — token'ları cookie'ye koyuyoruz,
// body'de sadece user bilgisi dönüyor. Ama iç servislerde AuthTokens kullanılıyor.
export interface AuthResponse {
  id: string;
  email: string;
  name: string;
  twoFactorEnabled: boolean;
}
