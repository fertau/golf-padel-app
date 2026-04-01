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
  const [rendered, setRendered] = useState(visible);
  const [isHiding, setIsHiding] = useState(false);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const imagesRef = useRef<{ court: HTMLImageElement; racket: HTMLImageElement } | null>(null);
  const racketSrcRef = useRef(rackets[Math.floor(Math.random() * rackets.length)]);

  useEffect(() => {
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
      setRendered(true);
      setIsHiding(false);
      setShowContent(false);
      return;
    }

    if (!rendered) return;
    setIsHiding(true);
    const timer = window.setTimeout(() => {
      setRendered(false);
      setIsHiding(false);
      setShowContent(false);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [visible, rendered]);

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

      // --- Phase 1: Court background (always visible) ---
      const courtAspect = court.width / court.height;
      const screenAspect = w / h;
      let drawW: number, drawH: number, drawX: number, drawY: number;

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

      // --- Radial spotlight overlay (brighter center, darker edges) ---
      const gradient = ctx.createRadialGradient(
        w / 2, h * 0.55, w * 0.1,
        w / 2, h * 0.55, w * 0.9
      );
      gradient.addColorStop(0, "rgba(1, 6, 20, 0.2)");
      gradient.addColorStop(0.6, "rgba(1, 6, 20, 0.45)");
      gradient.addColorStop(1, "rgba(1, 6, 20, 0.7)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);

      // --- Phase 2: Racket slides up + breathing zoom ---
      // Slide-up: racket starts 60px lower and eases into position
      const racketEntryT = clamp(t / 0.35, 0, 1);
      const racketEased = easeInOutQuad(racketEntryT);
      const racketAlpha = racketEased;
      const slideOffset = (1 - racketEased) * 60;

      // Breathing zoom: subtle 1.0 -> 1.02 oscillation after entry
      const breathT = clamp((t - 0.35) / 0.65, 0, 1);
      const breathScale = 1 + Math.sin(breathT * Math.PI * 2) * 0.012;

      const rackW = 340;
      const rackH = rackW * (racket.height / racket.width);
      const racketX = w / 2;
      const racketY = h * 0.58 + slideOffset;
      const racketAngle = -Math.PI / 20;

      ctx.save();
      ctx.globalAlpha = racketAlpha;
      ctx.translate(racketX, racketY);
      ctx.rotate(racketAngle);
      ctx.scale(breathScale, breathScale);

      // Drop shadow
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 60;
      ctx.shadowOffsetY = 35;

      ctx.drawImage(racket, -rackW / 2, -rackH / 2, rackW, rackH);
      ctx.restore();

      // --- Phase 3: Logo reveal (after racket settles) ---
      if (t > 0.3 && !logoShown) {
        logoShown = true;
        setShowContent(true);
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [visible, assetsLoaded]);

  if (!rendered) return null;

  return (
    <div className={`splash ${isHiding ? "is-hiding" : "is-visible"}`} aria-hidden>
      <canvas ref={canvasRef} className="splash-canvas" />
      <div className={`splash-content ${showContent ? "visible" : ""}`}>
        <h1 className="splash-brand">
          PADEL <span>APP</span>
        </h1>
      </div>
    </div>
  );
}
