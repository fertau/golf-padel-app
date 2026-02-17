import { useState, useEffect } from "react";

export default function SmartHandoff() {
    const [show, setShow] = useState(false);

    useEffect(() => {
        // Detect if running in standalone mode (installed PWA)
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches
            || (window.navigator as any).standalone
            || false;

        // Detect if we are inside WhatsApp's in-app browser (iOS Safari wrapper)
        const ua = window.navigator.userAgent;
        const isWhatsApp = /WhatsApp/i.test(ua);
        const isIOS = /iPhone|iPad|iPod/i.test(ua);

        if (isIOS && isWhatsApp && !isStandalone) {
            setShow(true);
        }
    }, []);

    if (!show) return null;

    return (
        <div className="smart-handoff-banner">
            <div className="handoff-content">
                <p>Para una mejor experiencia, abrir en la app</p>
                <button onClick={() => setShow(false)}>×</button>
            </div>
            <style>{`
        .smart-handoff-banner {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          background: var(--blue-600);
          color: white;
          padding: 12px 16px;
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-primary);
          font-size: 0.9rem;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .handoff-content {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .smart-handoff-banner button {
          background: rgba(255,255,255,0.2);
          border: none;
          color: white;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          cursor: pointer;
          font-size: 1.2rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }
      `}</style>
        </div>
    );
}
