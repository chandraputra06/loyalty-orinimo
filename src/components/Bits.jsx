// Komponen kecil yang dipakai bersama.
import { useEffect, useRef } from 'react';

export function Empty({ img = 'thinking', children }) {
  return <div className="empty"><img src={`/assets/${img}.webp`} alt="" />{children}</div>;
}

export function Loading({ text = 'Memuat…' }) {
  return <div className="loading"><img src="/assets/thinking.webp" alt="" style={{ width: 120 }} /><span><i className="spin" /> {text}</span></div>;
}

export function Modal({ open, onClose, children, width }) {
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    ref.current?.querySelector('button,input')?.focus();
    return () => removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="box" ref={ref} style={width ? { width } : undefined}>{children}</div>
    </div>
  );
}

// Maskot yang membal setiap kali `bump` berubah
export function Mascot({ img = 'hello', bump = 0, onClick, size, label = 'Maskot Orinimo' }) {
  return (
    <button key={bump} type="button" className={'mascot' + (bump ? ' boing' : '')} aria-label={label} onClick={onClick}
      style={size ? { width: size, height: size } : undefined}>
      <img src={`/assets/${img}.webp`} alt="" />
    </button>
  );
}

export function Pow({ id, style, go }) {
  return <svg className={'powb' + (go ? ' go' : '')} id={id} aria-hidden="true" style={style}><use href="#pow" /></svg>;
}
