import { useEffect, useRef, useState } from "react";

type Props = {
  visible: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const rackets = [
  "/racket_pro.webp",
  "/racket_pro2.webp",
  "/racket_pro3.webp",
  "/racket_pro4.webp",
  "/racket_pro5.webp",
  "/racket_pro6.webp",
];

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export default function SplashScreen({ visible }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showContent, setShowContent] = useState(false);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const imagesRef = useRef<{ court: HTMLImageElement; racket: HTMLImageElement } | null>(null);
  const racketSrcRef = useRef(rackets[Math.floor(Math.random() * rackets.length)]);

  useEffect(() => {
    // 1. Preload Assets
    const court = new Image();
    const racket = new Image();

    court.src = "/court_texture.avif";
    racket.src = racketSrcRef.current;

    let loadedCount = 0;
    const onLoaded = () => {
      loadedCount++;
      if (loadedCount === 2) {
        imagesRef.current = { court, racket };
        setAssetsLoaded(true);
      }
    };

    court.onload = onLoaded;
    racket.onload = onLoaded;
  }, [visible]);

  useEffect(() => {
    if (!visible || !canvasRef.current || !assetsLoaded) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx || !imagesRef.current) return;

    const { court, racket } = imagesRef.current;

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

      // Animation Stages (3200ms total)
      // 0.0 - 0.2: Racket Fade In (0 - 640ms)
      // 0.2 - 0.5: Racket Stay (640ms - 1600ms)
      // 0.5 - 0.65: Racket Fade Out (1600ms - 2080ms)
      // 0.6 - 1.0: Logo Hero Stage (1920ms - 3200ms)

      const racketFadeOutStart = 0.5;
      const racketFadeOutEnd = 0.65;
      const logoRevealStart = 0.6;
      const bgFadeToHeroStart = 0.55;

      if (t > logoRevealStart && !showContent) setShowContent(true);

      // 1. Draw Court Background
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

      const overlayGrad = ctx.createLinearGradient(0, 0, 0, h);
      overlayGrad.addColorStop(0, "rgba(0,0,0,0.1)");
      overlayGrad.addColorStop(1, "rgba(0,0,0,0.4)");
      ctx.fillStyle = overlayGrad;
      ctx.fillRect(0, 0, w, h);

      // 2. Draw Real Racket (With independent fade out)
      const rackW = 320;
      const rackH = rackW * (racket.height / racket.width);
      const racketX = w / 2;
      const racketY = h * 0.72;
      const racketAngle = -Math.PI / 18;

      let racketAlpha = 0;
      if (t < 0.2) {
        racketAlpha = easeInOutQuad(t / 0.2);
      } else if (t < racketFadeOutStart) {
        racketAlpha = 1;
      } else if (t < racketFadeOutEnd) {
        racketAlpha = 1 - easeInOutQuad((t - racketFadeOutStart) / (racketFadeOutEnd - racketFadeOutStart));
      }

      if (racketAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = racketAlpha;
        ctx.translate(racketX, racketY + (1 - racketAlpha) * 30);
        ctx.rotate(racketAngle);
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 50;
        ctx.shadowOffsetY = 25;
        ctx.drawImage(racket, -rackW / 2, -rackH / 2, rackW, rackH);
        ctx.restore();
      }

      // 3. Sequential Transition to Dark Hero Background
      if (t > bgFadeToHeroStart) {
        const bgAlpha = clamp((t - bgFadeToHeroStart) / 0.15, 0, 1);
        ctx.fillStyle = `rgba(1, 6, 20, ${bgAlpha})`;
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
      <div className={`splash-content ${showContent ? "visible" : ""}`} style={{ paddingTop: '15vh' }}>
        <h1 className="splash-brand">
          GOLF <span>PADEL</span> APP
        </h1>
      </div>
    </div>
  );
}
