// Primitivos de UI portados da landing (backup Work/) — versão sem Tailwind/Radix.
// Mantém as mesmas classes CSS usadas no layout original; o visual vem de ./landing.css.
import React from 'react';

export function Button({ variant = 'default', size, className = '', asChild = false, children, ...props }) {
  const cls = ['btn', `btn-${variant}`, size === 'icon' ? 'btn-icon' : '', className].filter(Boolean).join(' ');
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, { className: [cls, children.props.className].filter(Boolean).join(' ') });
  }
  return <button type="button" className={cls} {...props}>{children}</button>;
}

export function Dialog({ open, onOpenChange, children }) {
  if (!open) return null;
  return (
    <>
      <div className="dialog-overlay" onClick={() => onOpenChange?.(false)} aria-hidden="true" />
      <div role="dialog" aria-modal="true">{children}</div>
    </>
  );
}

export function DialogContent({ className = '', children, onClose }) {
  return (
    <div className={`dialog-content ${className}`}>
      <button type="button" className="dialog-close" aria-label="Fechar" onClick={onClose}>✕</button>
      {children}
    </div>
  );
}

export function DialogTitle({ children, className = '' }) {
  return <h2 className={className}>{children}</h2>;
}

export function DialogDescription({ children, className = '' }) {
  return <p className={className}>{children}</p>;
}
