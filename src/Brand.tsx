export function Brand({ className = "" }: { className?: string }) {
  return (
    <img
      className={`truecare-logo ${className}`}
      src="/truecare-logo.png"
      alt="TrueCare"
      width="1254"
      height="1254"
    />
  );
}
