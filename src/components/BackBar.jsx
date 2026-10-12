import React from 'react';
import { useNavigate } from 'react-router-dom';

// Barra de navegação exibida no topo de todas as páginas internas.
// Permite voltar à tela anterior (desistência, erro ou mudança)
// ou retornar direto ao menu principal.
export default function BackBar({ title }) {
  const navigate = useNavigate();

  return (
    <div className="back-bar" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="btn-back"
        style={{
          padding: '10px 14px',
          minHeight: 44,
          borderRadius: 6,
          border: '1px solid #ccc',
          background: '#fff',
          cursor: 'pointer',
          fontSize: 15,
        }}
      >
        ← Voltar
      </button>
      <button
        type="button"
        onClick={() => navigate('/')}
        className="btn-home"
        style={{
          padding: '10px 14px',
          minHeight: 44,
          borderRadius: 6,
          border: '1px solid #ccc',
          background: '#f5f5f5',
          cursor: 'pointer',
          fontSize: 15,
        }}
      >
        🏠 Menu
      </button>
      {title && <strong style={{ marginLeft: 'auto', fontSize: 14 }}>{title}</strong>}
    </div>
  );
}
