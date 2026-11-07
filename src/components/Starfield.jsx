import { useEffect, useRef } from 'react';

// Static starfield background (redrawn only when the size changes)
export default function Starfield() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);
      let seed = 7;
      const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
      const n = Math.round((w * h) / 2600);
      for (let i = 0; i < n; i++) {
        const x = rand() * w;
        const y = rand() * h;
        const r = rand() < 0.92 ? rand() * 0.8 + 0.2 : rand() * 1.3 + 0.8;
        ctx.globalAlpha = rand() * 0.6 + 0.15;
        ctx.fillStyle = rand() < 0.15 ? '#ffe7c2' : rand() < 0.3 ? '#c9d8ff' : '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, []);
  return <canvas ref={ref} className="starfield" aria-hidden="true" />;
}
