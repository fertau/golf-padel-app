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
  }, []);

  useEffect(() => {
    if (!visible || !canvasRef.current || !assetsLoaded) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx || !imagesRef.current) return;

    const { court, racket } = imagesRef.current;

    let raf = 0;
    const start = performance.now();
    const duration = 2800;

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
      const revealT = 0.4; // Slightly later for better impact
      const cutT = 0.85;

      if (t > revealT && !showContent) setShowContent(true);

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

      // Sutil dark gradient overlay for depth
      const overlayGrad = ctx.createLinearGradient(0, 0, 0, h);
      overlayGrad.addColorStop(0, "rgba(0,0,0,0.1)");
      overlayGrad.addColorStop(1, "rgba(0,0,0,0.4)");
      ctx.fillStyle = overlayGrad;
      ctx.fillRect(0, 0, w, h);

      // 2. Draw Real Racket (Repositioned Lower)
      const rackW = 320;
      const rackH = rackW * (racket.height / racket.width);
      const racketX = w / 2;
      const racketY = h * 0.72; // Lower for logo room
      const racketAngle = -Math.PI / 18;
      const racketAlpha = easeInOutQuad(clamp(t / 0.5, 0, 1));

      ctx.save();
      ctx.globalAlpha = racketAlpha;
      ctx.translate(racketX, racketY + (1 - racketAlpha) * 40); // Soft slide
      ctx.rotate(racketAngle);

      // Shadow
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 50;
      ctx.shadowOffsetY = 25;

      ctx.drawImage(racket, -rackW / 2, -rackH / 2, rackW, rackH);
      ctx.restore();

      // 3. Final Cut to Logo
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
      <div className={`splash-content ${showContent ? "visible" : ""}`} style={{ paddingTop: '15vh' }}>
        <h1 className="splash-brand">
          GOLF <span>PADEL</span> APP
        </h1>
        <p className="splash-subtitle">Premium Experience</p>
      </div>
    </div>
  );
}
