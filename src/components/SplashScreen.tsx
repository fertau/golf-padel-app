type Props = {
  visible: boolean;
};

export default function SplashScreen({ visible }: Props) {
  if (!visible) {
    return null;
  }

  return (
    <div className="splash" aria-hidden>
      <div className="splash-stage">
        <div className="splash-sky" />
        <div className="splash-fence" />

        <div className="splash-court-surface">
          <div className="court-texture" />
          <div className="court-line-vertical" />
          <div className="court-line-horizontal" />
          <div className="court-line-left" />
          <div className="court-line-right" />
        </div>

        <div className="splash-net" />
        <div className="splash-ball-trail" />
        <div className="splash-ball" />

        <h1 className="splash-brand" aria-label="Golf Padel App">
          <span className="brand-in">G</span>
          <span className="brand-o-slot">O</span>
          <span className="brand-in">lf Padel App</span>
        </h1>
      </div>
    </div>
  );
}
