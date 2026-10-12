// =====================================================================
// LeitorCodigo — componente reutilizável de captura de código de peça
// ---------------------------------------------------------------------
// Funciona em:
//   • Celular  -> botão "Ler com a câmera" (usa html5-qrcode; aceita
//                 Code128/EAN do nosso padrão interno e também QR Code)
//   • Computador -> leitor USB tipo teclado: basta digitar/scannear no
//                 campo, o Enter confirma automaticamente
// Valida o código interno de 8 dígitos antes de aceitar.
// =====================================================================
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { validarCodigoInterno } from '../utils/codigoInterno';

export default function LeitorCodigo({ onCodigo, placeholder = 'Código da peça (8 dígitos)', autoFocus = false }) {
  const [valor, setValor] = useState('');
  const [erro, setErro] = useState('');
  const [cameraAtiva, setCameraAtiva] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const scannerRef = useRef(null);
  const inputRef = useRef(null);
  const ultimoRef = useRef('');

  // Evita leituras duplicadas consecutivas da mesma etiqueta
  function receber(raw) {
    const codigo = String(raw || '').replace(/[\s-]/g, '');
    if (!codigo) return;
    if (codigo === ultimoRef.current) return; // já processado há instantes
    const v = validarCodigoInterno(codigo);
    if (!v.valido) {
      setErro(v.motivo || 'Código inválido');
      setMensagem('');
      return;
    }
    ultimoRef.current = codigo;
    setTimeout(() => { if (ultimoRef.current === codigo) ultimoRef.current = ''; }, 1500);
    setErro('');
    setMensagem(`✓ ${codigo}`);
    setValor('');
    onCodigo(codigo, v);
  }

  function onSubmit(e) {
    e.preventDefault();
    receber(valor);
  }

  async function ligarCamera() {
    setErro('');
    try {
      flushSync(() => setCameraAtiva(true)); // garante que a div #leitor-cam exista no DOM
      const scanner = new Html5Qrcode('leitor-cam');
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 140 } },
        (texto) => {
          receber(texto);
          desligarCamera();
        },
        () => {} // erros por frame são ignorados
      );
    } catch (e) {
      setErro('Não foi possível acessar a câmera. Verifique as permissões do navegador.');
      setCameraAtiva(false);
      scannerRef.current = null;
    }
  }

  async function desligarCamera() {
    try {
      if (scannerRef.current && cameraAtiva) await scannerRef.current.stop();
    } catch (_) { /* já parada */ }
    scannerRef.current = null;
    setCameraAtiva(false);
  }

  useEffect(() => () => { desligarCamera(); }, []);

  return (
    <div className="leitor-codigo">
      <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          ref={inputRef}
          value={valor}
          autoFocus={autoFocus}
          onChange={(e) => { setValor(e.target.value); setErro(''); }}
          placeholder={placeholder}
          inputMode="numeric"
          style={{ flex: '1 1 180px' }}
        />
        <button type="submit" className="btn-secundario">Confirmar</button>
        <button
          type="button"
          className={cameraAtiva ? 'btn-perigo' : 'btn-primario'}
          onClick={cameraAtiva ? desligarCamera : ligarCamera}
        >
          {cameraAtiva ? '✕ Fechar câmera' : '📷 Ler com a câmera'}
        </button>
      </form>
      {cameraAtiva && (
        <div id="leitor-cam" style={{ marginTop: 8, maxWidth: 360 }} />
      )}
      {erro && <p className="erro" style={{ color: '#c0392b', margin: '6px 0 0' }}>{erro}</p>}
      {mensagem && !erro && <p style={{ color: '#27ae60', margin: '6px 0 0' }}>{mensagem} — adicionado</p>}
    </div>
  );
}
