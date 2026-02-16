type Props = {
  visible: boolean;
};

export default function SplashScreen({ visible }: Props) {
  if (!visible) {
    return null;
  }

  return (
    <div className="splash" aria-hidden>
      <div className="splash-stage splash-zoom">
        <div className="splash-court-top">
          <div className="court-grid" />
          <div className="court-line-v" />
          <div className="court-line-h" />
          <div className="court-line-side left" />
          <div className="court-line-side right" />
        </div>
        <div className="shockwave" />
        <div className="splash-ball single-bounce" />

        <h1 className="splash-brand" aria-label="Golf Padel App">
          <span className="brand-in">G</span>
          <span className="brand-o-slot">O</span>
          <span className="brand-in">lf Padel App</span>
        </h1>
      </div>
    </div>
  );
}
