export const categories = ['Brincos', 'Colares', 'Pulseiras'] as const;

export function formatPrice(price: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);
}

export type BuyLinkResult = { link: string | null; error: string | null };

/**
 * Normaliza o link de compra digitado: vazio significa "sem link", endereço sem
 * protocolo recebe https:// e qualquer coisa que não seja uma página web é recusada.
 */
export function parseBuyLink(raw: string | null | undefined): BuyLinkResult {
  const value = (raw ?? '').trim();
  if (!value) return { link: null, error: null };

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
  const address = hasScheme ? value : `https://${value}`;

  if (/\s/.test(address)) {
    return { link: null, error: 'O link não pode ter espaços. Confira o endereço e tente de novo.' };
  }

  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return { link: null, error: 'Endereço incompleto. Escreva o link inteiro, por exemplo https://sualoja.com.br/colar' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { link: null, error: 'O link precisa começar com http:// ou https://' };
  }

  if (!url.hostname.includes('.')) {
    return { link: null, error: 'Falta o endereço completo no link, por exemplo https://sualoja.com.br/colar' };
  }

  return { link: address, error: null };
}
