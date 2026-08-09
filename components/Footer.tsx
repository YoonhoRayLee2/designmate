// Shared copyright / contact footer shown on every screen.
export default function Footer({ className = '' }: { className?: string }) {
  return (
    <div className={`app-footer ${className}`}>
      © 2026 NH농협 DesignMate · <a href="mailto:profittiger@nonghyup.com">profittiger@nonghyup.com</a>
    </div>
  );
}
