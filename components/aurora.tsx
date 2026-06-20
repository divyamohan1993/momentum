"use client";

import { useEffect, useRef } from "react";

/**
 * "Sunrise Aurora" background. Theme-aware, GPU-light, paused when hidden, static under
 * prefers-reduced-motion. Light: soft drifting bokeh of positive colors. Dark: pure black with
 * colorful lightning bolts that flash + bloom, plus faint drifting color orbs so it stays alive.
 */
const HUES: [number, number, number][] = [
  [255, 122, 89], // coral
  [255, 77, 141], // rose
  [255, 209, 102], // gold
  [45, 212, 167], // mint
  [56, 189, 248], // sky
  [167, 139, 250], // violet
];

export default function Aurora() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let dark = document.documentElement.classList.contains("dark");
    const obs = new MutationObserver(() => {
      dark = document.documentElement.classList.contains("dark");
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;
    const resize = () => {
      w = canvas.width = Math.floor(innerWidth * dpr);
      h = canvas.height = Math.floor(innerHeight * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const orbs = Array.from({ length: 6 }, (_, i) => ({
      hue: HUES[i % HUES.length]!,
      x: Math.random(),
      y: Math.random(),
      r: 0.22 + Math.random() * 0.18,
      sx: (Math.random() - 0.5) * 0.00006,
      sy: (Math.random() - 0.5) * 0.00006,
      ph: Math.random() * 6,
    }));

    type Bolt = { pts: [number, number][]; hue: [number, number, number]; life: number; width: number };
    let bolts: Bolt[] = [];

    const jag = (x1: number, y1: number, x2: number, y2: number, d: number, out: [number, number][]) => {
      if (d < 6) {
        out.push([x2, y2]);
        return;
      }
      const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * d;
      const my = (y1 + y2) / 2 + (Math.random() - 0.5) * d;
      jag(x1, y1, mx, my, d / 2, out);
      jag(mx, my, x2, y2, d / 2, out);
    };

    const spawnBolt = () => {
      const x1 = Math.random() * w;
      const y1 = Math.random() * h * 0.25;
      const x2 = Math.random() * w;
      const y2 = h * 0.45 + Math.random() * h * 0.5;
      const pts: [number, number][] = [[x1, y1]];
      jag(x1, y1, x2, y2, Math.hypot(x2 - x1, y2 - y1) / 3.2, pts);
      const hue = HUES[Math.floor(Math.random() * HUES.length)]!;
      bolts.push({ pts, hue, life: 1, width: (1 + Math.random() * 1.6) * dpr });
      if (Math.random() < 0.6) {
        const bi = Math.max(1, Math.floor(pts.length * 0.4));
        const [bx, by] = pts[bi]!;
        const bp: [number, number][] = [[bx, by]];
        jag(bx, by, bx + (Math.random() - 0.5) * w * 0.3, by + Math.random() * h * 0.3, w * 0.08, bp);
        bolts.push({ pts: bp, hue, life: 1, width: 0.8 * dpr });
      }
    };

    const drawOrbs = (t: number, composite: GlobalCompositeOperation, alpha: number) => {
      ctx.globalCompositeOperation = composite;
      for (const o of orbs) {
        const cx = (o.x + Math.sin(t * o.sx + o.ph) * 0.12) * w;
        const cy = (o.y + Math.cos(t * o.sy + o.ph) * 0.12) * h;
        const rad = o.r * Math.max(w, h);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        g.addColorStop(0, `rgba(${o.hue[0]},${o.hue[1]},${o.hue[2]},${alpha})`);
        g.addColorStop(1, `rgba(${o.hue[0]},${o.hue[1]},${o.hue[2]},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
    };

    let raf = 0;
    let last = 0;
    let lastSpawn = 0;
    let gap = 700;

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (document.visibilityState !== "visible") return;
      if (!reduced && t - last < 33) return;
      last = t;
      ctx.clearRect(0, 0, w, h);

      if (dark) {
        drawOrbs(t, "lighter", 0.05);
        for (const b of bolts) {
          ctx.globalCompositeOperation = "lighter";
          ctx.lineJoin = "round";
          ctx.shadowColor = `rgb(${b.hue[0]},${b.hue[1]},${b.hue[2]})`;
          ctx.shadowBlur = 24 * b.life * dpr;
          ctx.strokeStyle = `rgba(${b.hue[0]},${b.hue[1]},${b.hue[2]},${b.life})`;
          ctx.lineWidth = b.width;
          ctx.beginPath();
          ctx.moveTo(b.pts[0]![0], b.pts[0]![1]);
          for (const [x, y] of b.pts) ctx.lineTo(x, y);
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = `rgba(255,255,255,${0.75 * b.life})`;
          ctx.lineWidth = b.width * 0.4;
          ctx.stroke();
          b.life -= 0.045;
        }
        bolts = bolts.filter((b) => b.life > 0);
        if (!reduced && t - lastSpawn > gap) {
          spawnBolt();
          lastSpawn = t;
          gap = 500 + Math.random() * 1500;
        }
      } else {
        drawOrbs(t, "source-over", 0.16);
      }
      if (reduced) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      obs.disconnect();
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 h-full w-full" style={{ zIndex: -1 }} />;
}
