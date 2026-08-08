import { Socket } from 'socket.io';

// socket.io'nun Socket tipi, `data` alanını varsayılan olarak `any` bırakır.
// WsAuthGuard, doğrulanan kullanıcıyı client.data.user'a yazıyor — bu tipi
// burada netleştirip hem guard hem gateway'de kullanıyoruz ki TypeScript
// artık `.user` erişimini `any` değil, bilinen bir tip olarak görsün.
export interface AuthenticatedSocket extends Socket {
  data: {
    user: {
      id: string;
      email: string;
    };
  };
}
