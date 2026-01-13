import { render, escapeHtml } from "./ui.js";

function showBootError(title, detail){
  render(`
    <div class="card">
      <div class="h1">BOOT//ERROR</div>
      <div class="notice notice--bad"><b>${escapeHtml(title)}</b></div>
      <div class="hr"></div>
      <pre style="white-space:pre-wrap; font-family: var(--mono); color: var(--muted); margin:0;">${escapeHtml(detail || "")}</pre>
      <div class="hr"></div>
      <div class="notice">
        <small>原因例: Hostingに <code>/src/app.js</code> が載っていない / firebaseConfig.js 未設定 / Firestore rules 未デプロイ</small>
      </div>
    </div>
  `);
}

window.addEventListener("error", (e) => {
  showBootError(e.message || "error", e.error?.stack || "");
});
window.addEventListener("unhandledrejection", (e) => {
  showBootError("unhandledrejection", e.reason?.stack || String(e.reason));
});

try{
  await import("./app.js");
}catch(err){
  console.error(err);
  showBootError("import failed", err?.stack || String(err));
}
