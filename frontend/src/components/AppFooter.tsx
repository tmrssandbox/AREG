import './AppFooter.css';

export default function AppFooter() {
  return (
    <footer className="app-footer">
      <span className="app-footer__copy">© 2026 Texas Municipal Retirement System.<br />All rights reserved.</span>
      <nav className="app-footer__links">
        <a href="https://www.tmrs.com/terms" target="_blank" rel="noopener noreferrer">Terms</a>
        <a href="https://www.tmrs.com/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>
        <a href="https://www.tmrs.com/contact-support" target="_blank" rel="noopener noreferrer">Contact</a>
      </nav>
    </footer>
  );
}
