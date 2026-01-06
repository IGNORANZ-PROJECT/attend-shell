import { auth } from "../firebase.js";
import { render, toast, setWhoAmI } from "../ui.js";
import {
  getGlobal, listGroups, listStudents,
  ensureUserDoc, bindStudentUid,
  setAttendance, getAttendance, listNotices
} from "../data.js";

function statusLabel(s){
  if (s === "present") return "出席";
  if (s === "absent") return "欠席";
  if (s === "late") return "遅刻";
  if (s === "early") return "早退";
  return "未入力";
}

export async function renderUser(profile){
  const g = await getGlobal();
  const termId = g.currentTermId;
  const me = auth.currentUser;
  setWhoAmI(`USER//${profile.no4}  TERM//${termId}`, true);

  // best-effort: create mapping docs
  try{
    await ensureUserDoc({ uid: me.uid, email: me.email, termId, no4: profile.no4, groupId: profile.groupId });
    if (!profile.uid) await bindStudentUid(termId, profile.no4, me.uid);
  }catch(_){}

  const today = (new Date()).toISOString().slice(0,10);
  const leftDateDefault = today;

  render(`
    <div class="card">
      <div class="h1">USER//DASHBOARD</div>
      <div class="notice">
        4桁: <b>${profile.no4}</b> / 班: <b>${profile.groupId}</b> / メール: <b>${profile.email}</b>
      </div>
    </div>

    <div class="card">
      <div class="h1">NOTICE//LATEST</div>
      <div id="noticeList" class="notice"><small>LOADING…</small></div>
    </div>

    <div class="card">
      <div class="h1">SEND//ATTENDANCE</div>

      <div class="row">
        <div class="col">
          <label>日付</label>
          <input id="att_date" type="date" value="${today}"/>
        </div>
        <div class="col">
          <label>ステータス</label>
          <select id="att_status">
            <option value="present">出席</option>
            <option value="absent">欠席</option>
            <option value="late">遅刻</option>
            <option value="early">早退</option>
          </select>
        </div>
      </div>

      <label style="margin-top:10px;">備考（欠席/遅刻/早退は必須）</label>
      <textarea id="att_note" placeholder="理由や連絡事項"></textarea>

      <div style="margin-top:10px;">
        <button class="btn btn--primary" id="btnSend">送信</button>
      </div>
      <div class="hr"></div>
      <div class="notice" id="sendHint"><small>選択した日付は下の出席表で表示されます。</small></div>
    </div>

    <div class="card">
      <div class="h1">BOARD//SELECTED</div>
      <label>表示する班</label>
      <select id="board_group"></select>
      <div class="notice" id="board_date_label"><small>日付: ${leftDateDefault}</small></div>
      <div class="hr"></div>
      <div id="board"></div>
    </div>

  `);

  const elDate = document.getElementById("att_date");
  const elStatus = document.getElementById("att_status");
  const elNote = document.getElementById("att_note");

  const refreshNotices = async ()=>{
    try{
      const items = await listNotices(termId, 10);
      const box = document.getElementById("noticeList");
      if (!items.length){
        box.innerHTML = "<small>お知らせはありません。</small>";
        return;
      }
      box.innerHTML = items.map(n => {
        if (n.title && n.body) {
          return `<div style="margin-bottom:12px;">
            <div style="font-weight:bold;">${n.title}</div>
            <div>${n.body}</div>
          </div>`;
        } else {
          return `<div style="margin-bottom:8px;">• ${n.text}</div>`;
        }
      }).join("");
    }catch(e){
      console.error(e);
      document.getElementById("noticeList").innerHTML = "<small>読み込みに失敗しました。</small>";
    }
  };

  const getBoardGroupId = ()=>{
    const el = document.getElementById("board_group");
    return (el && el.value) ? el.value : profile.groupId;
  };

  const renderBoard = async (dateId, targetElId, groupId)=>{
    const box = document.getElementById(targetElId);
    box.innerHTML = "<div class='notice'><small>LOADING…</small></div>";
    try{
      const students = await listStudents(termId);
      const groupMembers = students.filter(s=>s.groupId === groupId && s.active !== false);

      const rows = await Promise.all(groupMembers.map(async (s)=>{
        const rec = await getAttendance(termId, dateId, s.no4);
        const st = rec?.status || "none";
        const note = rec?.note || "";
        return { no4: s.no4, status: st, note };
      }));

      box.innerHTML = `
        <table class="table">
          <thead>
            <tr><th>4桁</th><th>状態</th><th>備考</th></tr>
          </thead>
          <tbody>
            ${rows.map(r=>`
              <tr>
                <td>${r.no4}</td>
                <td>${statusLabel(r.status)}</td>
                <td><small>${r.note ? r.note : (r.status==="none" ? "未入力者" : "")}</small></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
    }catch(e){
      console.error(e);
      box.innerHTML = "<div class='notice notice--bad'>読み込みに失敗しました。</div>";
    }
  };

  const refreshBoardGroups = async ()=>{
    const sel = document.getElementById("board_group");
    if (!sel) return;
    sel.innerHTML = "";
    try{
      const groups = await listGroups(termId);
      const hasGroups = groups.length > 0;
      const list = hasGroups ? groups : [{ id: profile.groupId, name: "" }];
      list.forEach(g=>{
        const opt = document.createElement("option");
        opt.value = g.id;
        const label = g.name ? `${g.name}（${g.id}）` : g.id;
        opt.textContent = g.id === profile.groupId ? `${label}（自分の班）` : label;
        if (g.id === profile.groupId) opt.selected = true;
        sel.appendChild(opt);
      });
    }catch(e){
      console.error(e);
      const opt = document.createElement("option");
      opt.value = profile.groupId;
      opt.textContent = `${profile.groupId}（自分の班）`;
      opt.selected = true;
      sel.appendChild(opt);
    }
  };

  document.getElementById("btnSend").onclick = async ()=>{
    const dateId = elDate.value;
    const status = elStatus.value;
    const note = (elNote.value || "").trim();

    if (status !== "present" && note.length === 0){
      toast("欠席/遅刻/早退のときは備考が必須です。", "warn");
      return;
    }

    try{
      await setAttendance(termId, dateId, { no4: profile.no4, status, note });
      toast("送信しました。", "ok");

      const groupId = getBoardGroupId();
      const boardDateLabel = document.getElementById("board_date_label");
      if (boardDateLabel) boardDateLabel.innerHTML = `<small>日付: ${dateId}</small>`;
      await renderBoard(dateId, "board", groupId);
    }catch(e){
      console.error(e);
      toast("送信に失敗しました（権限/ルール/設定を確認）。", "error");
    }
  };

  elDate.onchange = async ()=>{
    const boardDateLabel = document.getElementById("board_date_label");
    if (boardDateLabel) boardDateLabel.innerHTML = `<small>日付: ${elDate.value}</small>`;
    await renderBoard(elDate.value, "board", getBoardGroupId());
  };

  document.getElementById("board_group").onchange = async ()=>{
    const groupId = getBoardGroupId();
    const boardDateLabel = document.getElementById("board_date_label");
    if (boardDateLabel) boardDateLabel.innerHTML = `<small>日付: ${elDate.value}</small>`;
    await renderBoard(elDate.value, "board", groupId);
  };

  await refreshBoardGroups();
  const initialGroupId = getBoardGroupId();
  await renderBoard(elDate.value || leftDateDefault, "board", initialGroupId);
  await refreshNotices();
}
