// File: public/src/views/login.js
import { auth, fx } from "../firebase.js";
import { STORAGE } from "../meta.js";
import { render, toast, setLogoutVisible, setWhoAmI, escapeHtml } from "../ui.js";

function remember(key, val){ try{ localStorage.setItem(key, val ?? ""); }catch(_){} }
function recall(key){ try{ return localStorage.getItem(key) || ""; }catch(_){ return ""; } }

function getErrCode(e){
  // Firebase v9+ の error は e.code が基本。念のため fallback も。
  return (e && (e.code || e?.error?.code || "")) + "";
}

export function renderLogin(){
  setLogoutVisible(false);
  // ★ログイン画面でも右上に未ログイン表示を出す
  setWhoAmI("NO LOGIN", true);

  const no4 = recall(STORAGE.lastNo4);
  const email = recall(STORAGE.lastEmail);
  const adminId = recall(STORAGE.lastAdminId);

  render(`
    <div class="card">
      <div class="h1">LOGIN//SELECT</div>
      <div class="row" style="margin-bottom:10px;">
        <button class="btn btn--primary" id="tabUser">USER</button>
        <button class="btn" id="tabAdmin">ADMIN</button>
      </div>
      <div id="pane"></div>
    </div>
  `);

  // DOM生成後にイベント登録
  requestAnimationFrame(() => {
    const pane = document.getElementById("pane");
    if (!pane) {
      console.error("[LOGIN] pane要素が取得できませんでした。DOM生成失敗の可能性があります。");
      toast("画面の初期化に失敗しました。再読み込みしてください。", "error");
      return;
    }

    const showUser = () => {
      pane.innerHTML = `
        <div class="h2">USER//LOGIN</div>

      <div class="notice notice--warn">
        管理者に送信等した <b>メールアドレス</b> を使用してください。
        <small>パスワードを忘れたら「PW-RESET」を使ってください。</small>
      </div>

      <label for="u_no4">4桁番号</label>
      <input id="u_no4" inputmode="numeric" pattern="\\d{4}" maxlength="4" placeholder="0123" value="${escapeHtml(no4)}" autocomplete="one-time-code" aria-label="クラス出席番号からなる4桁の番号" />

      <label for="u_email">メール</label>
      <input id="u_email" type="email" placeholder="example@school.jp" value="${escapeHtml(email)}" autocomplete="username email" aria-label="登録したメールアドレス" />

      <label for="u_pw">パスワード</label>
      <input id="u_pw" type="password" placeholder="Password (6+ chars)" autocomplete="current-password" aria-label="パスワード" />

      <div class="row" style="margin-top:10px;">
        <button class="btn btn--primary" id="btnUserGo">LOGIN / REGISTER</button>
        <button class="btn" id="btnReset">PW-RESET</button>
      </div>

      <div class="hr"></div>
      <div class="notice">
        <small>
          ※ここは <b>ログイン</b> と <b>初回登録（アカウント作成）</b> を統合しています。<br/>
          ※ログインを試して、アカウントが無ければ自動で作成してログインします。
        </small>
      </div>
    `;

    const elNo4 = document.getElementById("u_no4");
    const elEmail = document.getElementById("u_email");
    const elPw = document.getElementById("u_pw");

    const validate = ()=>{
      const no4v = (elNo4.value || "").trim();
      const emailv = (elEmail.value || "").trim();
      const pw = elPw.value || "";

      if (no4v.length !== 4){ toast("クラス出席番号からなる4桁の番号を入力してください。", "warn"); return null; }
      if (!emailv){ toast("登録済みのメールアドレスを入力してください。", "warn"); return null; }
      if (pw.length < 6){ toast("パスワードは6文字以上にしてください。", "warn"); return null; }
      return { no4v, emailv, pw };
    };

    const doLoginOrRegister = async ()=>{
      const v = validate();
      if (!v) return;

      const btnGo = document.getElementById("btnUserGo");
      if (btnGo) btnGo.disabled = true;

      remember(STORAGE.lastNo4, v.no4v);
      remember(STORAGE.lastEmail, v.emailv);

      try{
        await fx.signInWithEmailAndPassword(auth, v.emailv, v.pw);
        return;
      }catch(e){
        const code = getErrCode(e);
        console.error(e);

        const tryRegisterCodes = new Set([
          "auth/user-not-found",
          "auth/invalid-credential",
          "auth/invalid-login-credentials",
          "auth/wrong-password"
        ]);

        if (tryRegisterCodes.has(code)){
          try{
            await fx.createUserWithEmailAndPassword(auth, v.emailv, v.pw);
            toast("アカウントを作成してログインしました。", "ok");
            return;
          }catch(e2){
            const code2 = getErrCode(e2);
            console.error(e2);
            if (code2 === "auth/email-already-in-use"){
              toast("このメールアドレスは既に登録済みです。LOGINするかPW-RESETを使ってください。", "warn");
              return;
            }
            if (code2 === "auth/weak-password"){
              toast("パスワードが弱すぎます。6文字以上で再入力してください。", "warn");
              return;
            }
            if (code2 === "auth/invalid-email"){
              toast("メールアドレスの形式が正しくありません。", "warn");
              return;
            }
            toast("アカウント作成に失敗しました。入力内容を確認してください。", "error");
            return;
          }
        }

        if (code === "auth/invalid-email"){
          toast("メールアドレスの形式が正しくありません。", "warn");
          return;
        }
        if (code === "auth/user-disabled"){
          toast("このアカウントは無効化されています。管理者に確認してください。", "error");
          return;
        }
        if (code === "auth/too-many-requests"){
          toast("試行回数が多すぎます。しばらく待って再試行してください。", "warn");
          return;
        }

        toast("LOGINに失敗しました。メールアドレス/パスワードを確認してください。", "error");
      } finally {
        if (btnGo) btnGo.disabled = false;
      }
    };

    // クリック
    document.getElementById("btnUserGo").onclick = doLoginOrRegister;

    // Enter でも送信（任意だけど便利）
    [elNo4, elEmail, elPw].forEach(el=>{
      el.addEventListener("keydown", (ev)=>{
        if (ev.key === "Enter"){
          ev.preventDefault();
          doLoginOrRegister();
        }
      });
    });

    document.getElementById("btnReset").onclick = async () => {
      const emailv = (elEmail.value || "").trim();
      if (!emailv){ toast("登録済みのメールアドレスを入力してください。", "warn"); return; }
      try{
        await fx.sendPasswordResetEmail(auth, emailv);
        toast("再設定メールを送信しました。", "ok");
      }catch(e){
        console.error(e);
        toast("再設定メールの送信に失敗しました。", "error");
      }
    };
  };

  const showAdmin = () => {
    pane.innerHTML = `
      <div class="h2">ADMIN//LOGIN</div>
      <div class="notice">
        新年度管理者はREADMEのメールアドレスに新規IDとパスワードの発行を依頼してください。<br/>
        IDとパスワードは厳重に保管してください。
      </div>
      <label>管理者ID</label>
      <input id="a_id" placeholder="admin" value="${escapeHtml(adminId)}"/>
      <label>パスワード</label>
      <input id="a_pw" type="password" placeholder="Password"/>
      <div style="margin-top:10px;">
        <button class="btn btn--primary" id="btnAdminLogin">LOGIN</button>
      </div>
    `;

    document.getElementById("btnAdminLogin").onclick = async () => {
      const id = (document.getElementById("a_id").value || "").trim();
      const pw = document.getElementById("a_pw").value || "";
      if (!id){ toast("管理者IDを入力してください。", "warn"); return; }
      if (!pw){ toast("パスワードを入力してください。", "warn"); return; }

      const emailv = `admin-${id}@attend.local`;
      remember(STORAGE.lastAdminId, id);
      remember(STORAGE.lastEmail, emailv);

      try{
        await fx.signInWithEmailAndPassword(auth, emailv, pw);
      }catch(e){
        console.error(e);
        toast("ADMIN LOGINに失敗しました。ID/PWを確認してください。", "error");
      }
    };
  };

    const tabUser = document.getElementById("tabUser");
    const tabAdmin = document.getElementById("tabAdmin");
    if (!tabUser || !tabAdmin) {
      console.error("[LOGIN] tabUser/tabAdminボタンが取得できませんでした。");
      toast("画面の初期化に失敗しました。再読み込みしてください。", "error");
      return;
    }
    tabUser.onclick = showUser;
    tabAdmin.onclick = showAdmin;
    showUser();
  });
}
