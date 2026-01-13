import { db, fx } from "./firebase.js";

const GLOBAL_PATH = "config/global";

export async function getGlobal(){
  const ref = fx.doc(db, GLOBAL_PATH);
  const snap = await fx.getDoc(ref);
  if (!snap.exists()) return { _missing: true };
  return { id: snap.id, ...snap.data() };
}

export function watchGlobal(onChange, onError){
  const ref = fx.doc(db, GLOBAL_PATH);
  return fx.onSnapshot(ref, (snap)=>{
    if (!snap.exists()) onChange({ _missing: true });
    else onChange({ id: snap.id, ...snap.data() });
  }, (err)=>{ if (onError) onError(err); });
}

export async function bootstrapGlobal({termId}){
  const ref = fx.doc(db, GLOBAL_PATH);
  const now = fx.serverTimestamp();
  await fx.setDoc(ref, {
    systemEnabled: true,
    currentTermId: termId,
    adminEmails: [],
    globalEpoch: 1,
    createdAt: now,
    updatedAt: now
  }, { merge: true });

  const termRef = fx.doc(db, `terms/${termId}`);
  await fx.setDoc(termRef, { termId, createdAt: now }, { merge: true });
}

export async function setSystemEnabled(enabled){
  const ref = fx.doc(db, GLOBAL_PATH);
  await fx.updateDoc(ref, { systemEnabled: !!enabled, updatedAt: fx.serverTimestamp() });
}

export async function bumpGlobalEpoch(){
  const ref = fx.doc(db, GLOBAL_PATH);
  const g = await getGlobal();
  const next = (g.globalEpoch || 1) + 1;
  await fx.updateDoc(ref, { globalEpoch: next, updatedAt: fx.serverTimestamp() });
  return next;
}

export async function setCurrentTerm(termId){
  const ref = fx.doc(db, GLOBAL_PATH);
  await fx.updateDoc(ref, { currentTermId: termId, updatedAt: fx.serverTimestamp() });
}

export async function ensureUserDoc({uid, email, termId, no4, groupId}){
  const ref = fx.doc(db, `users/${uid}`);
  await fx.setDoc(ref, {
    uid, email, termId, no4, groupId,
    mustLogoutEpoch: 0,
    updatedAt: fx.serverTimestamp()
  }, { merge: true });
}

export function watchUserDoc(uid, onChange, onError){
  const ref = fx.doc(db, `users/${uid}`);
  return fx.onSnapshot(ref, (snap)=>{
    if (!snap.exists()) onChange({ _missing:true });
    else onChange({ id: snap.id, ...snap.data() });
  }, (err)=>{ if (onError) onError(err); });
}

export async function setMustLogoutEpoch(uid, epoch){
  const ref = fx.doc(db, `users/${uid}`);
  await fx.setDoc(ref, { mustLogoutEpoch: epoch, updatedAt: fx.serverTimestamp() }, { merge: true });
}

// ---- Groups ----
export async function listGroups(termId){
  const col = fx.collection(db, `terms/${termId}/groups`);
  const q = fx.query(col, fx.orderBy("order","asc"));
  const snap = await fx.getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function upsertGroup(termId, groupId, data){
  const ref = fx.doc(db, `terms/${termId}/groups/${groupId}`);
  await fx.setDoc(ref, { ...data, updatedAt: fx.serverTimestamp() }, { merge: true });
}

export async function deleteGroup(termId, groupId){
  const ref = fx.doc(db, `terms/${termId}/groups/${groupId}`);
  await fx.deleteDoc(ref);
}

// ---- Students ----
export async function listStudents(termId){
  const col = fx.collection(db, `terms/${termId}/students`);
  const q = fx.query(col, fx.orderBy("no4","asc"));
  const snap = await fx.getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function listDays(termId){
  const col = fx.collection(db, `terms/${termId}/days`);
  const q = fx.query(col, fx.orderBy("dateId","asc"));
  const snap = await fx.getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function listAttendanceRecords(termId, dateId){
  const col = fx.collection(db, `terms/${termId}/days/${dateId}/records`);
  const q = fx.query(col, fx.orderBy("no4","asc"));
  const snap = await fx.getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getStudent(termId, no4){
  const ref = fx.doc(db, `terms/${termId}/students/${no4}`);
  const snap = await fx.getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function upsertStudent(termId, no4, data){
  const ref = fx.doc(db, `terms/${termId}/students/${no4}`);
  await fx.setDoc(ref, { no4, ...data, updatedAt: fx.serverTimestamp() }, { merge: true });
}

export async function deleteStudent(termId, no4){
  const ref = fx.doc(db, `terms/${termId}/students/${no4}`);
  await fx.deleteDoc(ref);
}

export async function deleteAllStudents(termId){
  const col = fx.collection(db, `terms/${termId}/students`);
  const snap = await fx.getDocs(col);
  if (snap.empty) return 0;
  let count = 0;
  for (const d of snap.docs){
    await fx.deleteDoc(d.ref);
    count += 1;
  }
  return count;
}

export async function bindStudentUid(termId, no4, uid){
  const ref = fx.doc(db, `terms/${termId}/students/${no4}`);
  await fx.updateDoc(ref, { uid, updatedAt: fx.serverTimestamp() });
}

// ---- Notices ----
export async function listNotices(termId, limitN=20){
  const col = fx.collection(db, `terms/${termId}/notices`);
  const q = fx.query(col, fx.orderBy("createdAt","desc"), fx.limit(limitN));
  const snap = await fx.getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addNotice(termId, titleOrText, body){
  const col = fx.collection(db, `terms/${termId}/notices`);
  if (body !== undefined) {
    await fx.addDoc(col, { title: titleOrText, body, createdAt: fx.serverTimestamp() });
  } else {
    await fx.addDoc(col, { text: titleOrText, createdAt: fx.serverTimestamp() });
  }
}

export async function deleteNotice(termId, id){
  const ref = fx.doc(db, `terms/${termId}/notices/${id}`);
  await fx.deleteDoc(ref);
}

// ---- Attendance ----
export async function setAttendance(termId, dateId, record){
  const dayRef = fx.doc(db, `terms/${termId}/days/${dateId}`);
  await fx.setDoc(dayRef, { dateId, updatedAt: fx.serverTimestamp() }, { merge: true });
  const ref = fx.doc(db, `terms/${termId}/days/${dateId}/records/${record.no4}`);
  await fx.setDoc(ref, { ...record, updatedAt: fx.serverTimestamp() }, { merge: true });
}

export async function getAttendance(termId, dateId, no4){
  const ref = fx.doc(db, `terms/${termId}/days/${dateId}/records/${no4}`);
  const snap = await fx.getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}
