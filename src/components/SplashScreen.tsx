type Props = {
  visible: boolean;
};

export default function SplashScreen({ visible }: Props) {
  if (!visible) {
    return null;
  }

  return (
    <div className="splash" aria-hidden>
      <div className="splash-court">
        <div className="court-horizon" />
        <div className="court-line court-line-main" />
        <div className="court-line court-line-side-left" />
        <div className="court-line court-line-side-right" />
        <div className="court-net" />
        <div className="splash-ball" />
        <h1 className="splash-title">
          <span className="brand-prefix">G</span>
          <span className="brand-o">O</span>
          <span className="brand-suffix">lf Padel App</span>
        </h1>
      </div>
    </div>
  );
}
