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
    // Preload assets once; the racket is selected randomly for this app launch.
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
    if (visible) {
      setShowContent(false);
    }
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
    let logoShown = false;

    const render = (now: number) => {
      const elapsed = now - start;
      const t = clamp(elapsed / duration, 0, 1);
      const dpr = window.devicePixelRatio || 1;
      const bounds = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.ceil(bounds.width), Math.ceil(window.innerWidth));
      const h = Math.max(1, Math.ceil(bounds.height), Math.ceil(window.innerHeight));
      const pixelW = Math.floor(w * dpr);
      const pixelH = Math.floor(h * dpr);

      if (canvas.width !== pixelW || canvas.height !== pixelH) {
        canvas.width = pixelW;
        canvas.height = pixelH;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Logo Reveal Point
      if (t > 0.25 && !logoShown) {
        logoShown = true;
        setShowContent(true);
      }

      // 1. Draw Court Background (PERSISTENT & STATIC)
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

      // Darker overlay for brand pop
      ctx.fillStyle = "rgba(1, 6, 20, 0.4)";
      ctx.fillRect(0, 0, w, h);

      // 2. Draw Real Racket (PERSISTENT & STATIC after fade)
      const rackW = 340; // Slightly larger for premium feel
      const rackH = rackW * (racket.height / racket.width);
      const racketX = w / 2;
      const racketY = h * 0.76; // Positioned lower as a base
      const racketAngle = -Math.PI / 20;

      const racketAlpha = easeInOutQuad(clamp(t / 0.4, 0, 1));

      ctx.save();
      ctx.globalAlpha = racketAlpha;
      ctx.translate(racketX, racketY); // STATIC: NO MOVEMENT AFTER FADE
      ctx.rotate(racketAngle);

      // Shadow
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 70;
      ctx.shadowOffsetY = 40;

      ctx.drawImage(racket, -rackW / 2, -rackH / 2, rackW, rackH);
      ctx.restore();

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [visible, assetsLoaded]);

  if (!visible) return null;

  return (
    <div className="splash" aria-hidden>
      <canvas ref={canvasRef} className="splash-canvas" />
      <div className={`splash-content ${showContent ? "visible" : ""}`}>
        <h1 className="splash-brand">
          GOLF <span>PADEL</span> APP
        </h1>
      </div>
    </div>
  );
}
