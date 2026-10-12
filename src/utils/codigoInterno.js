// =====================================================================
// Código interno de 8 dígitos para peças de joias folheadas
// ---------------------------------------------------------------------
// Estrutura (conforme padrão da empresa):
//   D1 D2 D3 D4 | V1 V2 | G | C
//   ├─ modelo ─┘  ├var.┘  │  └ dígito verificador
//                 │       └ grade (1-9)
//                 └ variação: ouro=01, prata=02, rhodio=03, aco=04...
//
// Exemplo: 1234 + 56 + 7 + DV  ->  "1234567" + verificador = 8 dígitos
//
// O dígito verificador usa pesos 2..8 (mesma lógica do módulo EAN),
// calculado sobre os 7 primeiros dígitos, da direita para a esquerda.
// =====================================================================

export const VARICOES_PADRAO = [
  { nome: 'Ouro', codigo: '01' },
  { nome: 'Prata', codigo: '02' },
  { nome: 'Rhódio', codigo: '03' },
  { nome: 'Aço', codigo: '04' },
  { nome: 'Banho Premium', codigo: '05' },
];

/** Retorna o dígito verificador (0-9) para os 7 primeiros dígitos. */
export function digitoVerificador(base7) {
  const digits = String(base7).replace(/\D/g, '');
  if (digits.length !== 7) throw new Error('Base deve ter 7 dígitos');
  let soma = 0;
  // pesos 2..8 aplicados da direita para a esquerda
  for (let i = 0; i < 7; i++) {
    const peso = 2 + i; // posição mais à direita tem peso 2
    const d = Number(digits[6 - i]);
    soma += d * peso;
  }
  const resto = soma % 11;
  const dv = 11 - resto;
  if (dv >= 10) return 0; // regra: DV 10 ou 11 vira 0
  return dv;
}

/** Monta o código completo de 8 dígitos a partir das partes. */
export function gerarCodigoInterno({ modelo, variacao, grade }) {
  const m = String(modelo).padStart(4, '0').slice(-4);
  const v = String(variacao).padStart(2, '0').slice(-2);
  const g = String(grade).slice(0, 1);
  if (!/^\d{4}$/.test(m)) throw new Error('Modelo deve ser numérico (4 dígitos)');
  if (!/^\d{2}$/.test(v)) throw new Error('Variação deve ser numérica (2 dígitos)');
  if (!/^[1-9]$/.test(g)) throw new Error('Grade deve ser um dígito de 1 a 9');
  const base7 = m + v + g;
  return base7 + String(digitoVerificador(base7));
}

/** Valida um código interno de 8 dígitos (estrutura + verificador). */
export function validarCodigoInterno(codigo) {
  const c = String(codigo || '').replace(/[\s-]/g, '');
  if (!/^\d{8}$/.test(c)) return { valido: false, motivo: 'Código deve ter 8 dígitos' };
  const esperado = digitoVerificador(c.slice(0, 7));
  if (Number(c[7]) !== esperado)
    return { valido: false, motivo: `Dígito verificador inválido (esperado ${esperado})` };
  return {
    valido: true,
    modelo: c.slice(0, 4),
    variacao: c.slice(4, 6),
    grade: c.slice(6, 7),
    digito: c[7],
  };
}
