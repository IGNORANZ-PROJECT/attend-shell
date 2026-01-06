// File: public/src/app.js
import { auth, fx } from "./firebase.js";
import { APP, STORAGE } from "./meta.js";
import { setMetaLine, setLogoutVisible, setWhoAmI, toast, hookAboutButton } from "./ui.js";
import { renderLogin } from "./views/login.js";
import { renderUser } from "./views/user.js";
import { renderAdmin } from "./views/admin.js";
import { getGlobal, watchGlobal, getStudent, ensureUserDoc, watchUserDoc, bindStudentUid } from "./data.js";

setMetaLine(APP.version);
hookAboutButton();

const btnLogout = document.getElementById("btnLogout");
btnLogout.onclick = async () => {
  try{ await fx.signOut(auth); }catch(e){ console.error(e); toast("LOGOUTに失敗しました。", "error"); }
};

function remember(key, val){ try{ localStorage.setItem(key, val ?? ""); }catch(_){} }
function recall(key){ try{ return localStorage.getItem(key) || ""; }catch(_){ return ""; } }

function isRootAdminEmail(email){
  return (APP.rootAdminEmails || []).includes(email || "");
}

let globalUnsub = null;
let userUnsub = null;
let lastGlobal = null;

async function route(global){
  const user = auth.currentUser;
  if (!user){
    setLogoutVisible(false);
    // ★未ログインでも右上に表示する
    setWhoAmI("NO LOGIN", true);
    renderLogin();
    return;
  }

  setLogoutVisible(true);

  if (global?._missing){
    if (isRootAdminEmail(user.email)){
      await renderAdmin();
      return;
    }
    await fx.signOut(auth);
    setLogoutVisible(false);
    renderLogin();
    toast("初期セットアップ前です（管理者に確認）。", "warn");
    return;
  }

  const termId = global.currentTermId;
  const savedTerm = recall(STORAGE.lastTerm).trim();
  if (termId && termId !== savedTerm){
    remember(STORAGE.lastTerm, termId);
    remember(STORAGE.lastNo4, "");
  }
  const isAdmin = isRootAdminEmail(user.email) || (Array.isArray(global.adminEmails) && global.adminEmails.includes(user.email));
  if (isAdmin){
    await renderAdmin();
    return;
  }

  const no4 = recall(STORAGE.lastNo4).trim();
  if (no4.length !== 4){
    await fx.signOut(auth);
    setLogoutVisible(false);
    renderLogin();
    toast("4桁番号の情報がありません。もう一度ログインしてください。", "warn");
    return;
  }

  const profile = await getStudent(termId, no4);
  if (!profile || profile.active === false){
    await fx.signOut(auth);
    setLogoutVisible(false);
    renderLogin();
    toast("名簿登録が見つかりません（または無効）。管理者に確認してください。", "error");
    return;
  }

  if ((profile.email || "").toLowerCase() !== (user.email || "").toLowerCase()){
    await fx.signOut(auth);
    setLogoutVisible(false);
    renderLogin();
    toast("名簿のメールと一致しません。4桁/メールを確認してください。", "error");
    return;
  }

  try{
    if (profile.uid && profile.uid !== user.uid){
      await fx.signOut(auth);
      setLogoutVisible(false);
      renderLogin();
      toast("この4桁番号は別アカウントに紐付いています。管理者に確認してください。", "error");
      return;
    }
    await ensureUserDoc({ uid: user.uid, email: user.email, termId, no4: profile.no4, groupId: profile.groupId });
    if (!profile.uid){
      await bindStudentUid(termId, profile.no4, user.uid);
    }
  }catch(e){ console.warn(e); }

  await renderUser(profile);

  // Force logout checks (globalEpoch & user mustLogoutEpoch)
  try{
    const savedEpoch = parseInt(recall(STORAGE.epoch) || "0", 10) || 0;
    const globalEpoch = global.globalEpoch || 0;
    if (globalEpoch > savedEpoch){
      remember(STORAGE.epoch, String(globalEpoch));
    }

    if (userUnsub) userUnsub();
    userUnsub = watchUserDoc(user.uid, async (ud)=>{
      if (ud && !ud._missing){
        const must = ud.mustLogoutEpoch || 0;
        const base = Math.max(savedEpoch, (lastGlobal?.globalEpoch || 0));
        if (must > base){
          try{ await fx.signOut(auth); }catch(_){}
          setLogoutVisible(false);
          renderLogin();
          toast("管理者によりログアウトされました。", "warn");
        }
      }
    }, (err)=>console.warn(err));
  }catch(e){ console.warn(e); }
}

fx.setPersistence(auth, fx.browserLocalPersistence).catch(console.error);

fx.onAuthStateChanged(auth, async (user) => {
  try{
    if (!user){
      if (globalUnsub){ globalUnsub(); globalUnsub = null; }
      if (userUnsub){ userUnsub(); userUnsub = null; }
      lastGlobal = null;
      await route(null);
      return;
    }

    // Start watching global after login (avoid permission errors when guest)
    if (!globalUnsub){
      globalUnsub = watchGlobal((g)=>{
        lastGlobal = g;
        // if global changes while logged in, re-route (e.g., kick/system stop)
        route(g).catch(console.error);
      }, (err)=>console.warn(err));
    }

    const g = lastGlobal || await getGlobal();
    await route(g);
  }catch(e){
    console.error(e);
    renderLogin();
    toast("初期化に失敗しました（firebaseConfig.js / Hosting / ルールを確認）。", "error");
  }
});
