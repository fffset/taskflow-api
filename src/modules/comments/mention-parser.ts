// src/modules/comments/mention-parser.ts — yeni dosya

// Yorum içeriğinden @isim formatındaki mention'ları çıkarır.
// Örnek: "Bu konuda @erkan ve @ayse_yilmaz görüşsün" → ['erkan', 'ayse_yilmaz']
//
// Not: İsimlerde boşluk olabileceği için basit bir yaklaşım kullanıyoruz —
// @'dan sonra harf/rakam/alt çizgi kabul ediyoruz. Kullanıcı adında boşluk
// varsa (örn. "Erkan Yılmaz"), mention'da alt çizgi kullanılması beklenir
// (örn. @Erkan_Yılmaz) ya da frontend'de mention seçilirken userId
// gömülü bir format kullanılır (bkz. aşağıdaki not).
//
// Daha sağlam bir çözüm: frontend'de mention seçilince plain metne
// "@isim" yazmak yerine "@[isim](userId)" gibi gömülü bir format
// yazılır, backend bu formatı parse eder. Şimdilik basit metin
// tabanlı (isme göre eşleştirme) yaklaşımla başlıyoruz.

const MENTION_REGEX = /@\[([^\]]+)\]\(([^)]+)\)/g;

export interface ParsedMention {
  name: string;
  userId: string;
}

// content içindeki @[isim](userId) formatındaki tüm mention'ları çıkarır.
export function parseMentions(content: string): ParsedMention[] {
  const mentions: ParsedMention[] = [];
  let match: RegExpExecArray | null;

  // Regex'in lastIndex'i her exec sonrası ilerliyor, global flag ile
  // tüm eşleşmeleri tek seferde toplarız.
  while ((match = MENTION_REGEX.exec(content)) !== null) {
    mentions.push({ name: match[1], userId: match[2] });
  }

  return mentions;
}

// Kullanıcıya gösterilecek düz metne çevirir — @[isim](userId) → @isim
export function renderMentionsAsPlainText(content: string): string {
  return content.replace(MENTION_REGEX, '@$1');
}
