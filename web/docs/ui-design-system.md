# TaskLattice UI and Interaction System

Status: Implemented baseline

Version: 0.2

This contract applies the Vibe Designing evidence model to TaskLattice. It
covers the public landing page, authentication, and the protected Project
console.

## Product intent

TaskLattice helps an operator declare, provision, inspect, and enter an
isolated Agent runtime. The interface must keep desired Agent configuration and
actual sandbox state distinguishable. It must never imply that a provisioning
request succeeded before the runtime reports success.

The public page establishes the value and trust boundary. The control console
prioritizes the operating task and current state over marketing expression.

## Visual intent

- Temperament: operational, precise, direct, and calm.
- Brand signal: `#4339ff` is the action and navigation accent. The lattice logo
  uses a restrained cyan signal node to preserve the orchestration identity
  without turning every component into brand decoration.
- Neutral system: the reference-derived `#fafafa` field, `#191a1b` ink,
  `#f2f2f2` secondary planes, and low-opacity ink washes.
- Typography: `Noto Serif SC` for display and section headings; `PingFang SC`,
  `Noto Sans SC`, and `Hanken Grotesk` for interface text; `Chivo Mono` and
  `JetBrains Mono` for identifiers and operational evidence.
- Shape: one-pixel rules, square working surfaces, and zero-radius controls.
  Hierarchy comes from serif display type, spacing, density, and section lines
  rather than shadows or a wall of equal cards.
- Motion: short state transitions only. Honor `prefers-reduced-motion`.

### Logo contract

- The mark is a seven-node triangular lattice: isolated runtime nodes become a
  connected orchestration boundary and converge on one execution point.
- The primary lockup uses `TALI` as the compact wordmark and `TaskLattice` as
  the durable product name. The mark remains recognizable without the wordmark
  in collapsed navigation and favicon contexts.
- Light surfaces use a darker cyan signal for contrast; dark assets use the
  storyboard cyan `#42e3ff`.
- The public-page entrance draws the lattice before revealing its nodes. The
  protected console stays static, and reduced-motion mode suppresses the draw.

## Navigation contract

Desktop navigation is permanent and can collapse from 280 pixels to 72 pixels.
The preference persists locally. Collapsed navigation retains tooltips and
accessible names. The active item uses both surface and weight, not color
alone.

Mobile navigation is an overlay drawer. It opens from the menu button and
closes through its close button, backdrop click, navigation, or Escape. The
page returns to an unobstructed state after dismissal.

Unavailable future sections are visibly disabled, marked `Later`, and explain
their relationship to the current Agent path through a tooltip. They are not
presented as broken links.

The account control stays at the bottom of navigation and exposes the actual
identity provider plus sign out. The top bar contains route context, the
environment, and intentionally disabled future search.

### Project page hierarchy

The top-bar breadcrumb is the only route-context label. Project pages must
not repeat that context as an eyebrow above the page title.

Every Project route begins with the shared `PageHeader` structure:

1. a page-specific `h1` title with an optional status badge;
2. a concise task or scope description when it adds useful context;
3. page-level actions aligned with the title block.

`PageHeader` accepts `title`, `description`, `badge`, and `actions`. It does not
accept an eyebrow or breadcrumb prop. Breadcrumb construction remains owned by
`AppShell`, so route hierarchy cannot drift between the top bar and page body.

## Authentication contract

The login page supports configured local credentials and optional OIDC SSO.
Local login and SSO resolve to the same TaskLattice session and protected API
boundary.

States:

- Loading: keep the form stable and prevent duplicate submission.
- Invalid credentials: show a persistent, text-labelled recovery message.
- Development defaults: explicitly warn that `admin / admin` is active.
- SSO unavailable: keep local login available and surface the provider error.
- SSO callback: show a single-purpose completion state, then validate the
  returned TaskLattice session before entering the Project console.
- Expired session: clear stored credentials and return to login.
- Project switcher: switch Project context and expose Project settings to
  administrators; it never owns session actions.
- My Account: open from the account menu and contain user-owned details,
  accessible Projects, account type, theme, local time zone, and local-account
  password reset independently of the current Project.
- Sign out: live only in the account menu and clear local credentials even if
  provider logout is unavailable.

Production requires an explicit signing secret and local password/hash. OIDC
uses discovery, Authorization Code, PKCE, nonce, signed state storage, issuer,
audience, expiry, and provider signing-key validation.

## Component and accessibility rules

- Preserve semantic buttons, links, labels, headings, navigation, and main
  landmarks.
- Keep interactive targets at least 44 by 44 CSS pixels where touch applies.
- Never remove focus indicators; use visible `focus-visible` treatment.
- Keep DOM and visual order aligned.
- Do not use color as the only status signal.
- Provide a specific recovery action for failure and empty states.
- Keep animation under 300 milliseconds unless a documented spatial transition
  needs more time; animate transform and opacity by default.
- Avoid gradients, indiscriminate blur, emoji iconography, decorative bounce,
  and repeated equal-weight cards. Purple is reserved for explicit interactive
  emphasis and never used as an ambient gradient.

## Evidence gate

Use `release_gate` for changes intended for deployment. A pass requires:

1. Unit tests, type checking, and production build succeed.
2. Unauthenticated Agent API access returns 401.
3. Local login, session resolution, protected Agent access, and sign out work.
4. SSO start produces PKCE, nonce, state protection, and the configured redirect.
5. Desktop landing, login, expanded/collapsed console, and mobile layouts render
   without overflow or unreadable text.
6. Mobile navigation opens and closes with Escape.
7. The main CTA and primary control path produce visible feedback.
8. Browser console has no application errors or missing first-party assets.

Score landing pages with the Brand Landing profile and Project pages with the
Product Console profile. Treat broken auth, a broken primary operation, generic
template output, or an inconsistent component system as blockers regardless of
the weighted score.
