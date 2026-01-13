import { auth, db, fx } from "../firebase.js";
import { APP } from "../meta.js";
import { render, toast, setWhoAmI, escapeHtml } from "../ui.js";
import {
  getGlobal, bootstrapGlobal, setSystemEnabled, bumpGlobalEpoch, setCurrentTerm,
  listGroups, upsertGroup, deleteGroup,
  listStudents, upsertStudent, deleteStudent, deleteAllStudents,
  listDays, listAttendanceRecords,
  listNotices, addNotice, deleteNotice
} from "../data.js";

function isRootEmail(email){
  return (APP.rootAdminEmails || []).includes(email || "");
}

export async function renderAdmin(){
  const me = auth.currentUser;
  const g = await getGlobal();
  const termId = g._missing ? "" : g.currentTermId;
  setWhoAmI(`ADMIN//${me.email || "?"}${termId ? "  TERM//"+termId : ""}`, true);

  if (g._missing){
    render(`
      <div class="card">
        <div class="h1">BOOTSTRAP//FIRESTORE</div>
        <div class="notice notice--warn">
          Firestore に <code>config/global</code> がありません。<br/>
          ルート管理者（firestore.rules の isRoot()）でログインしている必要があります。
        </div>

        <label style="margin-top:10px;">TERM（例: 2025）</label>
        <input id="bootTerm" placeholder="2025" value="${new Date().getFullYear()}"/>

        <div style="margin-top:10px;">
          <button class="btn btn--primary" id="btnBootstrap">RUN SETUP</button>
        </div>
      </div>
    `);

    document.getElementById("btnBootstrap").onclick = async ()=>{
      if (!isRootEmail(me.email)){
        toast("ルート管理者ではありません（rootAdminEmails / firestore.rules を確認）。", "error");
        return;
      }
      const t = (document.getElementById("bootTerm").value || "").trim();
      if (!t){ toast("TERMを入力してください。", "warn"); return; }
      try{
        await bootstrapGlobal({ termId: t });
        toast("セットアップ完了。ページを再読み込みしてください。", "ok");
      }catch(e){
        console.error(e);
        toast("セットアップ失敗（権限/ルール/デプロイを確認）。", "error");
      }
    };
    return;
  }

  const term = g.currentTermId;

  render(`
    <div class="card">
      <div class="h1">ADMIN//CONTROL</div>
      <div class="row">
        <div class="col">
          <div class="notice">
            TERM: <b>${escapeHtml(term)}</b><br/>
            SYSTEM: <b>${g.systemEnabled ? "ON" : "OFF"}</b><br/>
            globalEpoch: <b>${g.globalEpoch || 1}</b>
          </div>
        </div>
        <div class="col">
          <button class="btn btn--primary" id="btnSysToggle">${g.systemEnabled ? "SYSTEM STOP" : "SYSTEM START"}</button>
          <button class="btn btn--warn" id="btnKickAll" style="margin-left:8px;">KICK ALL</button>
        </div>
      </div>

      <div class="hr"></div>

      <div class="h2">TERM RESET</div>
      <div class="notice notice--warn">
        年度（TERM）を切り替えます。全員を強制ログアウトします。
      </div>
      <div class="row">
        <div class="col">
          <label>新TERM</label>
          <input id="newTerm" placeholder="2026"/>
        </div>
        <div class="col">
          <label>&nbsp;</label>
          <button class="btn btn--danger" id="btnTermReset">RESET</button>
        </div>
      </div>
      <div class="notice" style="margin-top:10px;">
        <small>※ RESET はダブルクリックで実行します（誤操作防止）。</small>
      </div>
    </div>

    <div class="card">
      <div class="h1">GROUPS//EDIT</div>
      <div class="row">
        <div class="col">
          <label>班ID（例: A）</label>
          <input id="g_id" placeholder="A"/>
        </div>
        <div class="col">
          <label>表示名</label>
          <input id="g_name" placeholder="A班"/>
        </div>
      </div>
      <div style="margin-top:10px;">
        <button class="btn btn--primary" id="btnAddGroup">UPSERT</button>
      </div>
      <div class="hr"></div>
      <div id="groupList" class="notice"><small>LOADING…</small></div>
    </div>

    <div class="card">
      <div class="h1">ROSTER//EDIT</div>
      <div class="notice">
        名簿ごとのログイン情報（4桁・メール・UID紐付け）を表示します。
      </div>
      <div class="row" style="margin-top:10px;">
        <div class="col">
          <label>4桁</label>
          <input id="s_no4" inputmode="numeric" maxlength="4" placeholder="0123"/>
        </div>
        <div class="col">
          <label>メール</label>
          <input id="s_email" type="email" placeholder="example@school.jp"/>
        </div>
      </div>
      <div class="row">
        <div class="col">
          <label>班ID</label>
          <input id="s_group" placeholder="A"/>
        </div>
        <div class="col">
          <label>有効</label>
          <select id="s_active">
            <option value="true">有効</option>
            <option value="false">無効</option>
          </select>
        </div>
      </div>
      <div style="margin-top:10px;">
        <button class="btn btn--primary" id="btnUpsertStudent">UPSERT</button>
        <button class="btn btn--danger" id="btnDeleteAllStudents" style="margin-left:8px;">DELETE ALL</button>
      </div>

      <div class="hr"></div>
      <div style="margin-top:10px;">
        <label>CSV インポート</label>
        <input id="csv_file" type="file" accept=".csv,text/csv"/>
        <div style="margin-top:8px;">
          <button class="btn" id="btnImportCsv">IMPORT CSV</button>
        </div>
        <div class="notice" style="margin-top:8px;">
          1行目の見出しに「学籍番号」「メールアドレス」「所属班」を含めてください。
        </div>
      </div>

      <div id="studentList"><small>LOADING…</small></div>
    </div>

    <div class="card">
      <div class="h1">ATTENDANCE//RATE</div>
      <div class="notice">
        出席率は <code>days</code> コレクションに登録された日付を基準に集計します。
      </div>
      <div style="margin-top:10px;">
        <button class="btn btn--primary" id="btnLoadRates">LOAD</button>
      </div>
      <div class="hr"></div>
      <div id="rateList"><small>未読み込み</small></div>
    </div>

    <div class="card">
      <div class="h1">NOTICE//WRITE</div>
      <label>タイトル</label>
      <input id="n_title" placeholder="タイトル"/>
      <label style="margin-top:10px;">本文</label>
      <textarea id="n_body" placeholder="お知らせ本文"></textarea>
      <div style="margin-top:10px;">
        <button class="btn btn--primary" id="btnAddNotice">POST</button>
      </div>
      <div class="hr"></div>
      <div id="noticeList"><small>LOADING…</small></div>
    </div>
  `);

  const refreshGroups = async ()=>{
    const box = document.getElementById("groupList");
    box.innerHTML = "<small>LOADING…</small>";
    try{
      const items = await listGroups(term);
      if (!items.length){
        box.innerHTML = "<small>班がありません。</small>";
        return;
      }
      box.innerHTML = items.map(it=>`
        <div style="display:flex; justify-content:space-between; gap:10px; margin-bottom:8px;">
          <div><b>${escapeHtml(it.id)}</b> <small>${escapeHtml(it.name || "")}</small></div>
          <button class="btn btn--danger" data-del="${escapeHtml(it.id)}">DEL</button>
        </div>
      `).join("");
      box.querySelectorAll("[data-del]").forEach(btn=>{
        btn.onclick = async ()=>{
          const id = btn.getAttribute("data-del");
          try{ await deleteGroup(term, id); toast("削除しました。", "ok"); refreshGroups(); }
          catch(e){ console.error(e); toast("削除失敗", "error"); }
        };
      });
    }catch(e){
      console.error(e);
      box.innerHTML = "<small>読み込み失敗。</small>";
    }
  };

  const refreshStudents = async ()=>{
    const box = document.getElementById("studentList");
    box.innerHTML = "<div class='notice'><small>LOADING…</small></div>";
    try{
      const students = await listStudents(term);
      if (!students.length){
        box.innerHTML = "<div class='notice'><small>名簿が空です。</small></div>";
        return;
      }
      box.innerHTML = `
        <table class="table">
          <thead>
            <tr>
              <th>4桁</th>
              <th>班</th>
              <th>メール</th>
              <th>UID</th>
              <th>状態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${students.map(s=>{
              const uid = s.uid || "";
              const uidState = uid ? "紐付け済" : "未紐付け";
              return `
                <tr>
                  <td>${escapeHtml(s.no4)}</td>
                  <td>${escapeHtml(s.groupId || "")}</td>
                  <td><small>${escapeHtml(s.email || "")}</small></td>
                  <td><small>${escapeHtml(uid || "-")}</small></td>
                  <td><small>${s.active === false ? "無効" : uidState}</small></td>
                  <td><button class="btn btn--danger" data-del-student="${escapeHtml(s.no4)}">DEL</button></td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      `;
      box.querySelectorAll("[data-del-student]").forEach(btn=>{
        btn.onclick = async ()=>{
          const no4 = btn.getAttribute("data-del-student");
          if (!no4) return;
          if (!confirm(`${no4} を名簿から削除しますか？`)) return;
          try{
            await deleteStudent(term, no4);
            toast("削除しました。", "ok");
            refreshStudents();
          }catch(e){
            console.error(e);
            toast("削除失敗", "error");
          }
        };
      });
    }catch(e){
      console.error(e);
      box.innerHTML = "<div class='notice notice--bad'>読み込み失敗。</div>";
    }
  };

  const refreshNotices = async ()=>{
    const box = document.getElementById("noticeList");
    box.innerHTML = "<small>LOADING…</small>";
    try{
      const items = await listNotices(term, 20);
      if (!items.length){
        box.innerHTML = "<small>お知らせはありません。</small>";
        return;
      }
      box.innerHTML = items.map(n => {
        let main = "";
        if (n.title && n.body) {
          main = `<div><b>${escapeHtml(n.title)}</b><br>${escapeHtml(n.body)}</div>`;
        } else if (n.text) {
          main = `• ${escapeHtml(n.text)}`;
        } else if (n.title) {
          main = `<b>${escapeHtml(n.title)}</b>`;
        } else if (n.body) {
          main = escapeHtml(n.body);
        } else {
          main = "<span style='color:#888;'>内容なし</span>";
        }
        return `
          <div style="display:flex; justify-content:space-between; gap:10px; margin-bottom:8px;">
            <div style="flex:1;">${main}</div>
            <button class="btn btn--danger" data-del="${escapeHtml(n.id)}">DEL</button>
          </div>
        `;
      }).join("");
      box.querySelectorAll("[data-del]").forEach(btn=>{
        btn.onclick = async ()=>{
          const id = btn.getAttribute("data-del");
          try{ await deleteNotice(term, id); toast("削除しました。", "ok"); refreshNotices(); }
          catch(e){ console.error(e); toast("削除失敗", "error"); }
        };
      });
    }catch(e){
      console.error(e);
      box.innerHTML = "<small>読み込み失敗。</small>";
    }
  };

  document.getElementById("btnSysToggle").onclick = async ()=>{
    try{
      await setSystemEnabled(!g.systemEnabled);
      toast("切り替えました。再読み込みしてください。", "ok");
    }catch(e){
      console.error(e);
      toast("切り替え失敗（権限）", "error");
    }
  };

  document.getElementById("btnKickAll").onclick = async ()=>{
    try{
      await bumpGlobalEpoch();
      toast("全員を強制ログアウトしました（globalEpoch++）。", "ok");
    }catch(e){
      console.error(e);
      toast("失敗（権限）", "error");
    }
  };

  document.getElementById("btnTermReset").ondblclick = async ()=>{
    const t = (document.getElementById("newTerm").value || "").trim();
    if (!t){ toast("新TERMを入力してください。", "warn"); return; }
    try{
      await fx.setDoc(fx.doc(db, `terms/${t}`), { termId: t, createdAt: fx.serverTimestamp() }, { merge:true });
      await setCurrentTerm(t);
      await bumpGlobalEpoch();
      toast("TERMを切り替えました。再読み込みしてください。", "ok");
    }catch(e){
      console.error(e);
      toast("TERM切替に失敗しました。", "error");
    }
  };

  document.getElementById("btnAddGroup").onclick = async ()=>{
    const id = (document.getElementById("g_id").value || "").trim();
    const name = (document.getElementById("g_name").value || "").trim();
    if (!id){ toast("班IDを入力してください。", "warn"); return; }
    try{
      await upsertGroup(term, id, { name, order: id.charCodeAt(0) });
      toast("更新しました。", "ok");
      refreshGroups();
    }catch(e){
      console.error(e);
      toast("更新失敗（権限）", "error");
    }
  };

  document.getElementById("btnUpsertStudent").onclick = async ()=>{
    const no4 = (document.getElementById("s_no4").value || "").trim();
    const email = (document.getElementById("s_email").value || "").trim();
    const groupId = (document.getElementById("s_group").value || "").trim();
    const active = document.getElementById("s_active").value === "true";
    if (no4.length !== 4){ toast("4桁を入力してください。", "warn"); return; }
    if (!email){ toast("メールを入力してください。", "warn"); return; }
    if (!groupId){ toast("班IDを入力してください。", "warn"); return; }
    try{
      await upsertStudent(term, no4, { email, groupId, active, uid: null });
      toast("更新しました。", "ok");
      refreshStudents();
    }catch(e){
      console.error(e);
      toast("更新失敗（権限）", "error");
    }
  };

  document.getElementById("btnDeleteAllStudents").onclick = async ()=>{
    const adminId = (prompt("管理者IDを入力してください") || "").trim();
    if (!adminId) return;
    const pw = (prompt("管理者PWを入力してください") || "").trim();
    if (!pw) return;
    const emailv = `admin-${adminId}@attend.local`;
    if ((auth.currentUser?.email || "").toLowerCase() !== emailv.toLowerCase()){
      toast("現在ログイン中の管理者IDと一致しません。", "error");
      return;
    }
    if (!confirm("名簿を全員削除します。よろしいですか？")) return;
    try{
      const cred = fx.EmailAuthProvider.credential(emailv, pw);
      await fx.reauthenticateWithCredential(auth.currentUser, cred);
      const count = await deleteAllStudents(term);
      toast(`名簿を削除しました（${count}件）。`, "ok");
      refreshStudents();
    }catch(e){
      console.error(e);
      toast("認証に失敗しました。ID/PWを確認してください。", "error");
    }
  };

  const refreshRates = async ()=>{
    const box = document.getElementById("rateList");
    box.innerHTML = "<div class='notice'><small>LOADING…</small></div>";
    try{
      const [students, days] = await Promise.all([listStudents(term), listDays(term)]);
      if (!days.length){
        box.innerHTML = "<div class='notice'><small>対象日がありません。</small></div>";
        return;
      }
      const dayIds = days.map(d=>d.dateId || d.id);
      const recordsByDay = {};
      for (const dayId of dayIds){
        const recs = await listAttendanceRecords(term, dayId);
        recordsByDay[dayId] = recs;
      }

      const rows = students.map(s=>{
        let present = 0;
        let late = 0;
        let early = 0;
        let absent = 0;
        let missing = 0;
        for (const dayId of dayIds){
          const recs = recordsByDay[dayId] || [];
          const rec = recs.find(r=>r.no4 === s.no4);
          if (!rec){
            missing += 1;
            continue;
          }
          if (rec.status === "present") present += 1;
          else if (rec.status === "late") late += 1;
          else if (rec.status === "early") early += 1;
          else if (rec.status === "absent") absent += 1;
          else missing += 1;
        }
        const total = dayIds.length;
        const attended = present + late + early;
        const rate = total > 0 ? Math.round((attended / total) * 1000) / 10 : 0;
        return {
          no4: s.no4,
          groupId: s.groupId || "",
          email: s.email || "",
          present, late, early, absent, missing, total, rate
        };
      });

      box.innerHTML = `
        <table class="table">
          <thead>
            <tr>
              <th>4桁</th>
              <th>班</th>
              <th>メール</th>
              <th>出席率</th>
              <th>内訳</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r=>`
              <tr>
                <td>${escapeHtml(r.no4)}</td>
                <td>${escapeHtml(r.groupId)}</td>
                <td><small>${escapeHtml(r.email)}</small></td>
                <td>${r.total ? r.rate + "%" : "-"}</td>
                <td><small>出:${r.present} 遅:${r.late} 早:${r.early} 欠:${r.absent} 未:${r.missing}</small></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
    }catch(e){
      console.error(e);
      box.innerHTML = "<div class='notice notice--bad'>読み込み失敗。</div>";
    }
  };

  document.getElementById("btnLoadRates").onclick = refreshRates;

  const parseCsvLine = (line)=>{
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i=0; i<line.length; i++){
      const ch = line[i];
      if (ch === '"'){
        if (inQ && line[i+1] === '"'){ cur += '"'; i++; continue; }
        inQ = !inQ;
        continue;
      }
      if (ch === ',' && !inQ){ out.push(cur); cur = ""; continue; }
      cur += ch;
    }
    out.push(cur);
    return out.map(s=>s.replace(/^\uFEFF/, "").trim());
  };

  
  const normalizeHeader = (s)=>{
    return (s || "")
      .replace(/^\uFEFF/, "")
      .replace(/[　\s]+/g, "")
      .toLowerCase();
  };

  const isDefaultEmailHeader = (h)=>{
    const n = normalizeHeader(h);
    return n === "メール" || n === "メールアドレス";
  };

  const guessHeaderIndex = (headers, needles)=>{
    const normNeedles = needles.map(n=>normalizeHeader(String(n)));
    for (let i=0; i<headers.length; i++){
      const h = normalizeHeader(headers[i]);
      for (const n of normNeedles){
        if (n && h.includes(n)) return i;
      }
    }
    return -1;
  };

  const pickNoIndex = (headers)=>{
    const findIndex = (needles, excludeFn)=>{
      const normNeedles = needles.map(n=>normalizeHeader(String(n)));
      for (let i=0; i<headers.length; i++){
        const h = normalizeHeader(headers[i]);
        if (excludeFn && excludeFn(h)) continue;
        for (const n of normNeedles){
          if (n && h.includes(n)) return i;
        }
      }
      return -1;
    };

    const strong = ["学籍番号", "学生番号", "学籍no", "学籍"];
    const weak = ["番号", "no4", "no"];
    let idx = findIndex(strong);
    if (idx >= 0) return idx;
    idx = findIndex(weak, (h)=>h.includes("id") || h.includes("回答") || h.includes("タイム"));
    return idx;
  };

  const pickEmailIndex = (headers, needles)=>{
    const normNeedles = needles.map(n=>normalizeHeader(String(n)));
    const candidates = [];
    for (let i=0; i<headers.length; i++){
      const h = normalizeHeader(headers[i]);
      for (const n of normNeedles){
        if (n && h.includes(n)){
          candidates.push(i);
          break;
        }
      }
    }
    if (candidates.length <= 1) return candidates[0] ?? -1;
    const filtered = candidates.filter(i=>!isDefaultEmailHeader(headers[i]));
    if (filtered.length) return filtered[0];
    return candidates[0] ?? -1;
  };

  document.getElementById("btnImportCsv").onclick = async ()=>{
    const fileInput = document.getElementById("csv_file");
    const file = fileInput?.files?.[0];
    if (!file){ toast("CSVファイルを選択してください。", "warn"); return; }
    try{
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l=>l.trim().length);
      if (!lines.length){ toast("CSVが空です。", "warn"); return; }
      const header = parseCsvLine(lines[0]);
      const idxNo = pickNoIndex(header);
      const idxEmail = pickEmailIndex(header, ["メールアドレス", "メール", "e-mail", "email", "mail"]);
      const idxGroup = guessHeaderIndex(header, ["所属班", "班", "クラス", "グループ", "group"]);
      if (idxNo < 0 || idxEmail < 0 || idxGroup < 0){
        toast("CSVの見出しに学籍番号/メールアドレス/所属班が必要です。", "error");
        return;
      }

      const groups = await listGroups(term);
      const groupMap = new Map();
      groups.forEach(g=>{
        const id = (g.id || "").trim();
        const name = (g.name || "").trim();
        if (id) groupMap.set(id.toLowerCase(), id);
        if (name) groupMap.set(name.toLowerCase(), id);
      });

      let ok = 0;
      let skipped = 0;
      for (const line of lines.slice(1)){
        const cols = parseCsvLine(line);
        let rawNo = (cols[idxNo] || "").replace(/\D/g, "");
        const email = (cols[idxEmail] || "").trim();
        const groupRaw = (cols[idxGroup] || "").trim();
        const mappedGroup = groupMap.get(groupRaw.toLowerCase()) || groupRaw;
        if (!rawNo || !email || !mappedGroup){
          skipped += 1;
          continue;
        }
        if (rawNo.length < 4) rawNo = rawNo.padStart(4, "0");
        if (rawNo.length !== 4){
          skipped += 1;
          continue;
        }
        await upsertStudent(term, rawNo, { email, groupId: mappedGroup, active: true, uid: null });
        ok += 1;
      }
      const msg = skipped > 0
        ? `インポート完了: ${ok}件（スキップ ${skipped}件）。学籍番号の先頭0や空欄を確認してください。`
        : `インポート完了: ${ok}件。`;
      toast(msg, "ok");
      fileInput.value = "";
      refreshStudents();
    }catch(e){
      console.error(e);
      toast("CSVの読み込みに失敗しました。", "error");
    }
  };

  document.getElementById("btnAddNotice").onclick = async ()=>{
    const title = (document.getElementById("n_title").value || "").trim();
    const body = (document.getElementById("n_body").value || "").trim();
    if (!title){ toast("タイトルを入力してください。", "warn"); return; }
    if (!body){ toast("本文を入力してください。", "warn"); return; }
    try{
      await addNotice(term, title, body);
      document.getElementById("n_title").value = "";
      document.getElementById("n_body").value = "";
      toast("投稿しました。", "ok");
      refreshNotices();
    }catch(e){
      console.error(e);
      toast("投稿失敗（権限）", "error");
    }
  };

  await refreshGroups();
  await refreshStudents();
  await refreshNotices();
}
