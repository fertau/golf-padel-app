import { useEffect, useRef } from "react";

type Props = {
  visible: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export default function SplashScreen({ visible }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!visible || !canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    let raf = 0;
    const start = performance.now();
    const duration = 2850;

    const render = (now: number) => {
      const t = clamp((now - start) / duration, 0, 1);
      const dpr = window.devicePixelRatio || 1;
      const width = window.innerWidth;
      const height = window.innerHeight;

      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const sky = ctx.createRadialGradient(width * 0.5, height * 0.1, 20, width * 0.5, height * 0.4, width * 0.8);
      sky.addColorStop(0, "#2f84ff");
      sky.addColorStop(0.45, "#0e4fbf");
      sky.addColorStop(1, "#021534");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, height);

      const zoom = 1.12 - easeOutCubic(t) * 0.12;
      ctx.save();
      ctx.translate(width * 0.5, height * 0.5);
      ctx.scale(zoom, zoom);
      ctx.translate(-width * 0.5, -height * 0.5);

      const courtX = width * 0.08;
      const courtY = height * 0.12;
      const courtW = width * 0.84;
      const courtH = height * 0.68;

      const courtGradient = ctx.createLinearGradient(courtX, courtY, courtX + courtW, courtY + courtH);
      courtGradient.addColorStop(0, "#0f6fe4");
      courtGradient.addColorStop(1, "#0053ab");

      roundedRect(ctx, courtX, courtY, courtW, courtH, 26);
      ctx.fillStyle = courtGradient;
      ctx.fill();

      ctx.save();
      roundedRect(ctx, courtX, courtY, courtW, courtH, 26);
      ctx.clip();

      for (let i = 0; i < 220; i += 1) {
        const px = courtX + (Math.sin(i * 83.17) * 0.5 + 0.5) * courtW;
        const py = courtY + (Math.cos(i * 47.91) * 0.5 + 0.5) * courtH;
        const a = 0.028 + ((i * 17) % 10) * 0.003;
        ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
        ctx.fillRect(px, py, 1.3, 1.3);
      }

      ctx.strokeStyle = "rgba(244,249,255,0.96)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(courtX + courtW * 0.5, courtY + courtH * 0.08);
      ctx.lineTo(courtX + courtW * 0.5, courtY + courtH * 0.92);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(courtX + courtW * 0.08, courtY + courtH * 0.5);
      ctx.lineTo(courtX + courtW * 0.92, courtY + courtH * 0.5);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(courtX + courtW * 0.08, courtY + courtH * 0.25);
      ctx.lineTo(courtX + courtW * 0.42, courtY + courtH * 0.25);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(courtX + courtW * 0.58, courtY + courtH * 0.25);
      ctx.lineTo(courtX + courtW * 0.92, courtY + courtH * 0.25);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(courtX + courtW * 0.08, courtY + courtH * 0.75);
      ctx.lineTo(courtX + courtW * 0.42, courtY + courtH * 0.75);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(courtX + courtW * 0.58, courtY + courtH * 0.75);
      ctx.lineTo(courtX + courtW * 0.92, courtY + courtH * 0.75);
      ctx.stroke();

      const impactTime = 0.48;
      const liftTime = 0.64;
      const settleTime = 0.78;

      let ballY = courtY + courtH * 0.2;
      const ballX = courtX + courtW * 0.5;
      const ballEndY = height * 0.79;

      if (t <= impactTime) {
        const p = t / impactTime;
        ballY = courtY + courtH * (0.2 + p * 0.31);
      } else if (t <= liftTime) {
        const p = (t - impactTime) / (liftTime - impactTime);
        ballY = courtY + courtH * (0.51 - p * 0.18);
      } else if (t <= settleTime) {
        const p = (t - liftTime) / (settleTime - liftTime);
        ballY = courtY + courtH * (0.33 + p * 0.13);
      } else {
        const p = (t - settleTime) / (1 - settleTime);
        ballY = ballEndY - p * 8;
      }

      if (t >= impactTime) {
        const rp = clamp((t - impactTime) / 0.22, 0, 1);
        const radius = 10 + rp * Math.min(width, height) * 0.24;
        ctx.beginPath();
        ctx.arc(ballX, courtY + courtH * 0.51, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(231,255,72,${(0.45 - rp * 0.45).toFixed(3)})`;
        ctx.lineWidth = 4;
        ctx.stroke();
      }

      const shadowScale = 1.1 - clamp(Math.abs((ballY - (courtY + courtH * 0.51)) / 100), 0.2, 0.9);
      ctx.beginPath();
      ctx.ellipse(ballX, courtY + courtH * 0.55, 42 * shadowScale, 13 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.fill();

      const ballFade = t > 0.84 ? 1 - (t - 0.84) / 0.16 : 1;
      const ballR = 27;
      ctx.globalAlpha = clamp(ballFade, 0, 1);
      const ballGradient = ctx.createRadialGradient(ballX - 8, ballY - 10, 6, ballX, ballY, ballR);
      ballGradient.addColorStop(0, "#fbffb4");
      ballGradient.addColorStop(0.55, "#e8ff3d");
      ballGradient.addColorStop(1, "#a9c300");
      ctx.fillStyle = ballGradient;
      ctx.beginPath();
      ctx.arc(ballX, ballY, ballR, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(145,168,0,0.8)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ballX - 2, ballY + 1, ballR * 0.58, -0.4, 1.1);
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.restore();

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  if (!visible) {
    return null;
  }

  return (
    <div className="splash" aria-hidden>
      <canvas ref={canvasRef} className="splash-canvas" />
      <h1 className="splash-brand" aria-label="Golf Padel App">
        <span className="brand-in">G</span>
        <span className="brand-o-slot">O</span>
        <span className="brand-in">lf Padel App</span>
      </h1>
      <p className="splash-subtitle">Reservas modernas para tu grupo</p>
    </div>
  );
}
