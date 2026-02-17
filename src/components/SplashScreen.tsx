import { useEffect, useRef, useState } from "react";

type Props = {
  visible: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export default function SplashScreen({ visible }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    if (!visible || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 0. Pre-generate noise texture for the turf
    const noiseCanvas = document.createElement("canvas");
    noiseCanvas.width = 128;
    noiseCanvas.height = 128;
    const nctx = noiseCanvas.getContext("2d")!;
    for (let i = 0; i < 128; i++) {
      for (let j = 0; j < 128; j++) {
        nctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.1})`;
        nctx.fillRect(i, j, 1, 1);
      }
    }
    const noisePattern = ctx.createPattern(noiseCanvas, "repeat")!;

    let raf = 0;
    const start = performance.now();
    const duration = 3000;

    const render = (now: number) => {
      const elapsed = now - start;
      const t = clamp(elapsed / duration, 0, 1);
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;

      if (canvas.width !== Math.floor(w * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Animation Stages
      const impactT = 0.45;
      const cutT = 0.75;

      if (t > cutT && !showContent) setShowContent(true);

      // 1. Background (Turf Macro)
      ctx.fillStyle = "#0056b3";
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = noisePattern;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      // 2. Court Line (Macro Diagonal)
      ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
      ctx.lineWidth = 18;
      ctx.beginPath();
      ctx.moveTo(-100, h * 0.85);
      ctx.lineTo(w + 100, h * 0.15);
      ctx.stroke();

      // 3. Padel Racket Drawing (Carbon Fiber Professional)
      const racketX = w / 2;
      const racketY = h / 2 + 60;
      const racketAngle = -Math.PI / 12; // 15 degrees

      ctx.save();
      ctx.translate(racketX, racketY);
      ctx.rotate(racketAngle);

      // Shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
      ctx.beginPath();
      ctx.ellipse(12, 18, 110, 134, 0, 0, Math.PI * 2);
      ctx.fill();

      // Body
      const racketGrad = ctx.createLinearGradient(-100, -120, 100, 120);
      racketGrad.addColorStop(0, "#1c1c1c");
      racketGrad.addColorStop(0.5, "#2a2a2a");
      racketGrad.addColorStop(1, "#0d0d0d");

      ctx.fillStyle = racketGrad;
      ctx.beginPath();
      ctx.ellipse(0, 0, 110, 134, 0, 0, Math.PI * 2);
      ctx.fill();

      // Edge Accent (Cian/Blue)
      ctx.strokeStyle = "rgba(0, 112, 243, 0.3)";
      ctx.lineWidth = 4;
      ctx.stroke();

      // Handle
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(-22, 134, 44, 90);
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(-22, 210, 44, 14); // Handle cap

      // Sweet Spot Pulse
      if (t > impactT) {
        const pulseRatio = clamp((t - impactT) / 0.35, 0, 1);
        ctx.strokeStyle = `rgba(232, 255, 61, ${0.75 * (1 - pulseRatio)})`;
        ctx.lineWidth = 2 + pulseRatio * 8;
        ctx.beginPath();
        ctx.arc(0, 0, 15 + pulseRatio * 220, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Racket Holes
      ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
      for (let ix = -3; ix <= 3; ix++) {
        for (let iy = -3; iy <= 3; iy++) {
          if (ix * ix + iy * iy < 10 && ix * ix + iy * iy > 1) {
            ctx.beginPath();
            ctx.arc(ix * 26, iy * 26, 4.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.restore();

      // 4. Ball Falling Sequence
      const ballR = 25;
      const targetX = racketX + 8; // Offset for the angle
      const targetY = racketY - 35;

      if (t < impactT) {
        const p = t / impactT;
        // Natural ease-in for gravity
        const pIn = p * p;
        const ballY = -120 + pIn * (targetY + 120);

        ctx.save();
        ctx.translate(targetX, ballY);

        const ballGrad = ctx.createRadialGradient(-7, -7, 2, 0, 0, ballR);
        ballGrad.addColorStop(0, "#f9ffb4");
        ballGrad.addColorStop(0.5, "#e8ff3d");
        ballGrad.addColorStop(1, "#a2b500");
        ctx.fillStyle = ballGrad;
        ctx.beginPath();
        ctx.arc(0, 0, ballR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (t < cutT) {
        // Post-impact bounce sit
        ctx.save();
        ctx.translate(targetX, targetY);
        const ballGrad = ctx.createRadialGradient(-7, -7, 2, 0, 0, ballR);
        ballGrad.addColorStop(0, "#fafa9d");
        ballGrad.addColorStop(0.5, "#e8ff3d");
        ballGrad.addColorStop(1, "#a2b500");
        ctx.fillStyle = ballGrad;
        ctx.beginPath();
        ctx.arc(0, 0, ballR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 5. Fade to Logo Reveal
      if (t > cutT) {
        const alpha = clamp((t - cutT) / 0.1, 0, 1);
        ctx.fillStyle = `rgba(1, 6, 20, ${alpha})`;
        ctx.fillRect(0, 0, w, h);
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [visible, showContent]);

  if (!visible) return null;

  return (
    <div className="splash" aria-hidden>
      <canvas ref={canvasRef} className="splash-canvas" />
      <div className={`splash-content ${showContent ? "visible" : ""}`}>
        <h1 className="splash-brand">
          Golf <span>Padel</span> App
        </h1>
        <p className="splash-subtitle">Premium Experience</p>
      </div>
    </div>
  );
}
