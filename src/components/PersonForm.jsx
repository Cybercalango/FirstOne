import React, { useState, useEffect } from 'react';

// Formulário de pessoa em blocos universais:
// 1) Identificação  2) Contato  3) Endereço (com busca automática de CEP via ViaCEP)
export default function PersonForm({ initial, onSubmit, submitLabel = 'Salvar', onCancel }) {
  const empty = {
    name: '', cpf_cnpj: '', birth_date: '',
    phone: '', email: '',
    zip: '', street: '', number: '', district: '', city: '', state: '', complement: '',
    is_client: true, is_consignor: false,
  };
  const [f, setF] = useState({ ...empty, ...(initial || {}) });
  const [cepLoading, setCepLoading] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => { if (initial) setF({ ...empty, ...initial }); }, [initial]);

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  // Busca automática do endereço pelo CEP (ViaCEP — gratuito, sem cadastro)
  const lookupCep = async () => {
    const cep = f.zip.replace(/\D/g, '');
    if (cep.length !== 8) { setErro('CEP deve ter 8 dígitos.'); return; }
    setErro(''); setCepLoading(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await r.json();
      if (d.erro) setErro('CEP não encontrado. Verifique os dígitos.');
      else setF((p) => ({
        ...p,
        street: d.logradouro || p.street,
        district: d.bairro || p.district,
        city: d.localidade || p.city,
        state: d.uf || p.state,
      }));
    } catch {
      setErro('Falha ao consultar o CEP (sem internet?). Preencha manualmente.');
    } finally { setCepLoading(false); }
  };

  const maskCpfCnpj = (v) => v.replace(/\D/g, '').slice(0, 14);
  const maskPhone = (v) => v.replace(/\D/g, '').slice(0, 11);
  const maskZip = (v) => v.replace(/\D/g, '').slice(0, 8);

  const submit = (e) => {
    e.preventDefault();
    if (!f.name.trim()) { setErro('Informe o nome.'); return; }
    if (!f.phone.trim()) { setErro('Informe o telefone/WhatsApp.'); return; }
    if (!f.zip.trim() || !f.street.trim() || !f.number.trim() || !f.district.trim() || !f.city.trim() || !f.state.trim()) {
      setErro('Complete todo o endereço: CEP, logradouro, número, bairro, cidade e estado.'); return;
    }
    setErro('');
    const address = [`${f.street}, ${f.number}${f.complement ? ` - ${f.complement}` : ''}`, f.district, `${f.city}/${f.state}`, `CEP ${maskZip(f.zip)}`].filter(Boolean).join(' - ');
    onSubmit({ ...f, address, zip: maskZip(f.zip), cpf_cnpj: maskCpfCnpj(f.cpf_cnpj), phone: maskPhone(f.phone) });
  };

  return (
    <form onSubmit={submit} className="cad-form people-form person-blocks">
      {/* Bloco 1 — Identificação */}
      <fieldset className="person-fieldset">
        <legend>1. Identificação</legend>
        <input placeholder="Nome completo *" value={f.name} onChange={set('name')} />
        <input placeholder="CPF ou CNPJ (somente números)" value={f.cpf_cnpj} onChange={(e) => setF((p) => ({ ...p, cpf_cnpj: maskCpfCnpj(e.target.value) }))} />
        <label className="person-label">Data de nascimento
          <input type="date" value={f.birth_date || ''} onChange={set('birth_date')} />
        </label>
        <div className="person-checks">
          <label><input type="checkbox" checked={f.is_client} onChange={set('is_client')} /> Cliente</label>
          <label><input type="checkbox" checked={f.is_consignor} onChange={set('is_consignor')} /> Vendedor / Consignatário</label>
        </div>
      </fieldset>

      {/* Bloco 2 — Contato */}
      <fieldset className="person-fieldset">
        <legend>2. Contato</legend>
        <input placeholder="Telefone / WhatsApp *" inputMode="tel" value={f.phone} onChange={(e) => setF((p) => ({ ...p, phone: maskPhone(e.target.value) }))} />
        <input placeholder="E-mail" type="email" value={f.email} onChange={set('email')} />
      </fieldset>

      {/* Bloco 3 — Endereço */}
      <fieldset className="person-fieldset">
        <legend>3. Endereço</legend>
        <div className="person-cep-row">
          <input placeholder="CEP *" inputMode="numeric" value={f.zip} onChange={(e) => setF((p) => ({ ...p, zip: maskZip(e.target.value) }))} />
          <button type="button" onClick={lookupCep} disabled={cepLoading}>{cepLoading ? '...' : '🔎 Buscar'}</button>
        </div>
        <input placeholder="Logradouro (rua/avenida) *" value={f.street} onChange={set('street')} />
        <div className="person-row-3">
          <input placeholder="Número *" value={f.number} onChange={set('number')} />
          <input placeholder="Complemento" value={f.complement} onChange={set('complement')} />
        </div>
        <input placeholder="Bairro *" value={f.district} onChange={set('district')} />
        <div className="person-row-3">
          <input placeholder="Cidade *" value={f.city} onChange={set('city')} />
          <input placeholder="UF *" maxLength={2} value={f.state} onChange={(e) => setF((p) => ({ ...p, state: e.target.value.toUpperCase() }))} style={{ maxWidth: 70 }} />
        </div>
      </fieldset>

      {erro && <p className="cad-msg erro">{erro}</p>}
      <div className="person-actions">
        <button type="submit">{submitLabel}</button>
        {onCancel && <button type="button" onClick={onCancel}>Cancelar</button>}
      </div>
    </form>
  );
}
