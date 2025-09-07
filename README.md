# YouTube Studio Comment Helper

Access commenter info inside closed Shadow DOM on YouTube Studio.

## Development (Edge)
1. Go to `edge://extensions/` and enable *Developer mode*.
2. Click **Load unpacked** and select the repo root.
3. Open YouTube Studio ➜ Comments and open DevTools console.

### Logging levels
Set in DevTools (persists via localStorage):

```
localStorage.setItem('YSCH_LOG','debug');   // debug|info|warn|error|silent
window.dispatchEvent(new Event('ysch:reload-log-level'));
```
Default is `warn`. ShadowRoot scan executes only when log level is `debug` (and stops automatically if none are found after a few polls).

## Build (CI / local)
- `npm run lint`
- `npm run validate`
- `npm run build:zip`  # CI artifact is uploaded as `edge-extension-zip`

## License
AGPL-3.0-only. See `LICENSE`. Contributions are welcomed. By contributing, you agree that your contributions are licensed under AGPL-3.0.
