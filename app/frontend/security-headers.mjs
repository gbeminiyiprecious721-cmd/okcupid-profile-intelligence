// Headers for the web application. The API sets its own (see backend/profile_api/security/headers.py).
// A static host cannot read this file: copy the values into the host's header settings (printed by
// `npm run headers`). `vite preview` uses it directly, so the production build is tested under the same policy.
//
// Scripts must come from the site itself: no inline script and no eval. Styles may also be inline. That is a
// deliberate trade-off: the charts set bar widths with style attributes, and the dialog library injects a small
// style element to lock page scrolling while a dialog is open. A nonce would avoid it, but a static host cannot
// make one per response. Inline styles cannot run code. Nothing may be framed, and the page may only talk to its own
// origin (the API is reached through the same origin, by proxy).
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "worker-src 'none'",
  "manifest-src 'self'",
].join("; ");

export const SECURITY_HEADERS = {
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  // Only meaningful over https. A host that serves https should add it:
  // "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};
