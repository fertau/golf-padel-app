import { useEffect, useRef, useState } from "react";

type Props = {
  visible: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export default function SplashScreen({ visible }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showContent, setShowContent] = useState(false);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const imagesRef = useRef<{ court: HTMLImageElement; racket: HTMLImageElement; ball: HTMLImageElement } | null>(null);

  useEffect(() => {
    // 1. Preload Assets
    const court = new Image();
    const racket = new Image();
    const ball = new Image();

    court.src = "/court_texture.avif";
    racket.src = "/racket_pro.webp";
    ball.src = "/padel_ball.webp";

    let loadedCount = 0;
    const onLoaded = () => {
      loadedCount++;
      if (loadedCount === 3) {
        imagesRef.current = { court, racket, ball };
        setAssetsLoaded(true);
      }
    };

    court.onload = onLoaded;
    racket.onload = onLoaded;
    ball.onload = onLoaded;
  }, []);

  useEffect(() => {
    if (!visible || !canvasRef.current || !assetsLoaded) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx || !imagesRef.current) return;

    const { court, racket, ball } = imagesRef.current;

    let raf = 0;
    const start = performance.now();
    const duration = 3200;

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
      const cutT = 0.8;

      if (t > cutT && !showContent) setShowContent(true);

      // 1. Draw Court Background (Real Texture)
      // Cover logic for court image
      const courtAspect = court.width / court.height;
      const screenAspect = w / h;
      let drawW, drawH, drawX, drawY;

      if (screenAspect > courtAspect) {
        drawW = w;
        drawH = w / courtAspect;
        drawX = 0;
        drawY = (h - drawH) / 2;
      } else {
        drawH = h;
        drawW = h * courtAspect;
        drawY = 0;
        drawX = (w - drawW) / 2;
      }
      ctx.drawImage(court, drawX, drawY, drawW, drawH);

      // Sutil dark overlay to help legibility later
      ctx.fillStyle = "rgba(0,0,0,0.1)";
      ctx.fillRect(0, 0, w, h);

      // 2. Draw Real Racket
      // Positioned slightly off-center for dynamic look
      const rackW = 280;
      const rackH = rackW * (racket.height / racket.width);
      const racketX = w / 2;
      const racketY = h / 2 + 80;
      const racketAngle = -Math.PI / 12;

      ctx.save();
      ctx.translate(racketX, racketY);
      ctx.rotate(racketAngle);

      // Shadow for racket
      ctx.shadowColor = "rgba(0,0,0,0.4)";
      ctx.shadowBlur = 40;
      ctx.shadowOffsetY = 20;

      ctx.drawImage(racket, -rackW / 2, -rackH / 2, rackW, rackH);
      ctx.restore();

      // 3. Pulse effect on sweet spot
      if (t > impactT) {
        const pulseRatio = clamp((t - impactT) / 0.3, 0, 1);
        ctx.save();
        ctx.translate(racketX, racketY - 40); // Aligned with sweet spot
        ctx.strokeStyle = `rgba(232, 255, 61, ${0.8 * (1 - pulseRatio)})`;
        ctx.lineWidth = 4 + pulseRatio * 15;
        ctx.beginPath();
        ctx.arc(0, 0, 10 + pulseRatio * 300, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 4. Ball Falling (Real Ball Asset)
      const ballSize = 65;
      const targetX = racketX + 10;
      const targetY = racketY - 60;

      if (t < impactT) {
        const p = t / impactT;
        const pIn = p * p; // Gravity effect
        const curBallY = -150 + pIn * (targetY + 150);

        ctx.save();
        ctx.translate(targetX, curBallY);

        // Dynamic ball shadow on racket
        const dist = 1 - pIn;
        ctx.fillStyle = `rgba(0,0,0,${0.3 * (1 - dist)})`;
        ctx.beginPath();
        ctx.ellipse(0, ballSize / 2 + 5, ballSize * 0.4, ballSize * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.drawImage(ball, -ballSize / 2, -ballSize / 2, ballSize, ballSize);
        ctx.restore();
      } else if (t < cutT) {
        // Post impact ball stay
        ctx.save();
        ctx.translate(targetX, targetY);
        ctx.drawImage(ball, -ballSize / 2, -ballSize / 2, ballSize, ballSize);
        ctx.restore();
      }

      // 5. Final Cut to Logo
      if (t > cutT) {
        const logoAlpha = clamp((t - cutT) / 0.1, 0, 1);
        ctx.fillStyle = `rgba(1, 6, 20, ${logoAlpha})`;
        ctx.fillRect(0, 0, w, h);
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [visible, assetsLoaded, showContent]);

  if (!visible) return null;

  return (
    <div className="splash" aria-hidden>
      <canvas ref={canvasRef} className="splash-canvas" />
      <div className={`splash-content ${showContent ? "visible" : ""}`}>
        <h1 className="name-logo">
          GOLF <span>PADEL</span> APP
        </h1>
        <p className="splash-subtitle">Premium Experience</p>
      </div>
    </div>
  );
}
