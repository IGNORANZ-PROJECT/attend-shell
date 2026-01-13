import { APP } from "./meta.js";

const metaLineEl = document.getElementById("metaLine");
const whoamiEl = document.getElementById("whoami");
const whoamiTextEl = document.getElementById("whoamiText");
const footerVersionEl = document.getElementById("footerVersion");
const toastRoot = document.getElementById("toastRoot");

export function setMetaLine(text){
  if (metaLineEl) metaLineEl.textContent = text;
  if (footerVersionEl) footerVersionEl.textContent = APP.version;
}

export function setWhoAmI(text, visible){
  if (!whoamiEl || !whoamiTextEl) return;
  // メールアドレスを含む場合は種別のみ抽出
  let displayText = text;
  if (typeof text === "string") {
    if (text.toLowerCase().includes("admin")) displayText = "ADMIN";
    else if (text.toLowerCase().includes("user")) displayText = "USER";
    else if (text.toLowerCase().includes("no login")) displayText = "NO LOGIN";
    else displayText = "USER";
  }
  whoamiTextEl.textContent = displayText;
  whoamiEl.style.display = visible ? "inline-flex" : "none";
}

export function setLogoutVisible(visible){
  const btn = document.getElementById("btnLogout");
  if (btn) btn.style.display = visible ? "inline-block" : "none";
}

export function render(html){
  const view = document.getElementById("view");
  if (!view) return;
  view.innerHTML = html;
}

export function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}

export function toast(msg, type="ok"){
  if (!toastRoot) return;
  const div = document.createElement("div");
  div.className = "toast toast--" + (type === "error" ? "bad" : (type === "warn" ? "warn" : "ok"));
  div.textContent = msg;
  toastRoot.appendChild(div);
  setTimeout(()=>{ div.remove(); }, 2800);
}

export function showModal({title, bodyHtml, okText="CLOSE"}){
  const back = document.createElement("div");
  back.className = "modal-backdrop";
  back.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal__title">${escapeHtml(title)}</div>
      <div class="modal__body">${bodyHtml}</div>
      <div class="modal__actions">
        <button class="btn btn--primary" id="modalOk">${escapeHtml(okText)}</button>
      </div>
    </div>
  `;
  const close = () => back.remove();
  back.addEventListener("click", (e)=>{ if (e.target === back) close(); });
  back.querySelector("#modalOk").addEventListener("click", close);
  document.body.appendChild(back);
  return { close };
}

export function hookAboutButton(){
  const btn = document.getElementById("btnAbout");
  if (!btn) return;
  btn.onclick = () => {
    showModal({
      title: "ABOUT//DEVELOPER",
      bodyHtml: `
        <div class="notice">
          <div><b>${escapeHtml(APP.name)}</b> ${escapeHtml(APP.version)}</div>
          <div style="margin-top:6px;"><small>${escapeHtml(APP.developer.name)}</small></div>
          <div style="margin-top:6px;"><small>${escapeHtml(APP.developer.note)}</small></div>
        </div>
        <div class="hr"></div>
        <div class="notice"><small>https://ignoranz-project.web.app/</small></div>
      `
    });
  };
}
