// Branded Type — TypeScript'te iki farklı string'i birbirine karıştırmamak için.
// Örnek: userId ile workspaceId her ikisi de string, ama birbirinin yerine geçemez.
//
// declare const __brand: unique symbol → her Brand<T, B> için benzersiz bir "damga" oluşturur.
// Bu damga sadece type seviyesinde var, runtime'da hiçbir etkisi yok.

type Brand<T, B extends string> = T & { readonly [__brand]: B };
declare const __brand: unique symbol;

export type UserId = Brand<string, 'UserId'>;

// request.user'ın tipi — JwtStrategy.validate()'den dönen şey bu tip olacak.
// @CurrentUser() decorator'ı bu tipi döndürür.
export type AuthenticatedUser = {
  id: UserId;
  email: string;
};
