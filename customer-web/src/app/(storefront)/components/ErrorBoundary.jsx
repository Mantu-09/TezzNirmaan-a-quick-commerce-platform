// (storefront)/components/ErrorBoundary.jsx — P13-7
// React class component error boundary.
// Catches unhandled render errors and shows friendly UI.
'use client';
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log to Sentry if available (lazy import to avoid SSR issues)
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_SENTRY_DSN) {
      import('@sentry/browser').then(S => S.captureException(error)).catch(() => {});
    }
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>😕</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ color: '#6b7280', marginBottom: 24, fontSize: 14 }}>
            We encountered an unexpected error. Please try refreshing the page.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ padding: '10px 24px', background: 'var(--sf-primary, #f97316)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', marginRight: 12 }}
          >
            Try Again
          </button>
          <a href="/" style={{ padding: '10px 24px', border: '1px solid #e5e7eb', borderRadius: 10, textDecoration: 'none', color: 'inherit' }}>
            Go Home
          </a>
        </div>
      );
    }
    return this.props.children;
  }
}
