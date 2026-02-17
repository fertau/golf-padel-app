import { useEffect, useRef, useState } from "react";

type Props = {
  visible: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

export default function SplashScreen({ visible }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    if (!visible || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const start = performance.now();
    const duration = 2800; // Total duration of animation

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
      // 0.0 - 0.35: High-velocity shot (traveling)
      // 0.35: IMPACT
      // 0.35 - 0.7: Post-impact travel & spin & zoom start
      // 0.7 - 0.9: Intense cinematic zoom & fade to logo

      const impactT = 0.35;
      const zoomStartT = 0.5;
      const finishT = 0.85;

      if (t > 0.75 && !showContent) setShowContent(true);

      // Background
      ctx.fillStyle = "#010614";
      ctx.fillRect(0, 0, w, h);

      // Court Piso Azul
      ctx.save();
      ctx.translate(w / 2, h / 2);

      let zoom = 1;
      if (t > zoomStartT) {
        const zoomProgress = clamp((t - zoomStartT) / (finishT - zoomStartT), 0, 1);
        zoom = 1 + easeOutExpo(zoomProgress) * 18;
      }
      ctx.scale(zoom, zoom);
      ctx.translate(-w / 2, -h / 2);

      // Floor (Synthetic Turf)
      ctx.fillStyle = "#0070f3"; // Saturated WPT Blue
      ctx.fillRect(0, 0, w, h);

      // Lines
      ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
      ctx.lineWidth = 4 / zoom;

      // Center Line
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, h);
      ctx.stroke();

      // Service lines
      const serviceY = h * 0.7;
      ctx.beginPath();
      ctx.moveTo(0, serviceY);
      ctx.lineTo(w, serviceY);
      ctx.stroke();

      // Net
      const netY = h * 0.3;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
      ctx.lineWidth = 12 / zoom;
      ctx.beginPath();
      ctx.moveTo(0, netY);
      ctx.lineTo(w, netY);
      ctx.stroke();

      // Ball Physics
      const ballR = 22;
      let ballX = w / 2;
      let ballY = h * 0.5;
      let ballRotation = t * 25; // Continuous spin

      if (t < impactT) {
        // FAST TRAVEL: Coming from top-right
        const p = t / impactT;
        ballX = w * 1.2 - p * (w * 0.7);
        ballY = -h * 0.2 + p * (h * 0.75);
      } else {
        // POST IMPACT: Slower bounce & zoom
        const p = clamp((t - impactT) / (1 - impactT), 0, 1);
        ballX = w / 2 - (p * w * 0.1); // Small drift
        ballY = h * 0.55 - Math.abs(Math.sin(p * Math.PI * 1.5)) * (h * 0.05);
      }

      // Ball Shadow
      const shadowOpacity = 0.3 * (1 - clamp((t - finishT) / 0.1, 0, 1));
      ctx.fillStyle = `rgba(0, 0, 0, ${shadowOpacity})`;
      ctx.beginPath();
      ctx.ellipse(ballX, ballY + ballR + 5 / zoom, ballR * zoom, ballR * 0.3 * zoom, 0, 0, Math.PI * 2);
      ctx.fill();

      // Ball Rendering
      const ballAlpha = 1 - clamp((t - finishT) / 0.1, 0, 1);
      if (ballAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = ballAlpha;
        ctx.translate(ballX, ballY);
        ctx.rotate(ballRotation);

        const grad = ctx.createRadialGradient(-5, -5, 2, 0, 0, ballR);
        grad.addColorStop(0, "#f9ffb4");
        grad.addColorStop(0.5, "#e8ff3d");
        grad.addColorStop(1, "#a4b900");

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, ballR, 0, Math.PI * 2);
        ctx.fill();

        // Seams for spin visualization
        ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(-ballR * 0.8, 0, ballR, -0.5, 0.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ballR * 0.8, 0, ballR, Math.PI - 0.5, Math.PI + 0.5);
        ctx.stroke();

        ctx.restore();
      }

      ctx.restore();

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="splash" aria-hidden>
      <canvas ref={canvasRef} className="splash-canvas" />
      <div className={`splash-content ${showContent ? "visible" : ""}`}>
        <h1 className="splash-brand">
          G<span className="brand-o">o</span>lf Padel App
        </h1>
        <p className="splash-subtitle">Elite Padel Booking</p>
      </div>
    </div>
  );
}
