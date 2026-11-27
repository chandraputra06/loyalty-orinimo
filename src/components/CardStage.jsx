import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { stageHTML, mountStage, playStamps, paintSlots } from '../lib/stage.js';

// Kartu 3D. Markup dibuat oleh stage.js agar animasi cap tidak terganggu render ulang React.
// Kartu dibangun ulang hanya jika data/tema berubah; perubahan jumlah stamp cukup dicat ulang.
const CardStage = forwardRef(function CardStage({ card, customer, settings, theme, sm, flipped, idle, stamps, onFlip, guides }, ref) {
  const host = useRef();
  const stage = useRef(null);
  const flipCb = useRef(onFlip);
  flipCb.current = onFlip;
  const n = stamps ?? card.stamps;
  const nRef = useRef(n);
  nRef.current = n;

  useLayoutEffect(() => {
    const wasFlipped = stage.current ? stage.current._isFlipped() : flipped;
    host.current.innerHTML = stageHTML({ card, customer, settings, theme, sm, flipped: wasFlipped, stamps: nRef.current });
    stage.current = host.current.firstElementChild;
    stage.current.classList.toggle('show-guides', !!guides);
    return mountStage(stage.current, { idle, onFlip: (f) => flipCb.current && flipCb.current(f) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id, card.token, card.code, card.revision, customer.nickname, customer.code, customer.phoneMasked, settings.pct, settings.unit,
      theme.id, theme.base, theme.ink, theme.shape, theme.frontImg, theme.backImg, sm, idle]);

  useLayoutEffect(() => { paintSlots(stage.current, n); }, [n]);
  useLayoutEffect(() => { stage.current?.classList.toggle('show-guides', !!guides); }, [guides]);

  useImperativeHandle(ref, () => ({
    flip: () => stage.current?._flip(),
    isFlipped: () => !!stage.current?._isFlipped?.(),
    play: (from, earned, opts) => (stage.current ? playStamps(stage.current, from, earned, { pct: settings.pct, ...opts }) : Promise.resolve()),
    paint: (k) => paintSlots(stage.current, k),
    el: () => stage.current,
  }), [settings.pct]);

  return <div className="cardhost" ref={host} />;
});
export default CardStage;
