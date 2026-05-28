import { useState, useRef, useEffect } from "react";
import {
  Download, FileText, CheckSquare, Square, Plus, Trash2,
  Settings, Save, QrCode, Building2, Calendar, X, Package,
  Lock, LogOut, ShieldCheck, Eye, EyeOff, Users, RotateCcw,
  AlertTriangle, ChevronDown, ChevronUp, FileDown, Building,
  Link as LinkIcon, ExternalLink,
} from "lucide-react";

// ─── 定数 ─────────────────────────────────────────────────────────────────────
const ADMIN_PASSWORD   = "admin123";
const STORAGE_ACCESS   = "dcs_access_log";
const STORAGE_VISITORS = "dcs_visitor_log";

const INITIAL_CATALOGS = [
  { id: 1, title: "製品総合カタログ 2025年版",   fileSize: "8.2 MB",  description: "全製品ラインナップを網羅した総合カタログです。最新モデルの仕様・価格表を含みます。",  downloadUrl: "" },
  { id: 2, title: "産業用ソリューション ガイド",  fileSize: "4.5 MB",  description: "製造・物流現場向けの導入事例と活用シナリオを詳しくご紹介します。",               downloadUrl: "" },
  { id: 3, title: "サービス・保守パッケージ一覧", fileSize: "2.1 MB",  description: "アフターサポートプランの詳細と、各プランの比較表を掲載しています。",               downloadUrl: "" },
  { id: 4, title: "技術仕様書（エンジニア向け）", fileSize: "12.0 MB", description: "API仕様・電気回路図・取付寸法図を含む詳細な技術資料です。",                         downloadUrl: "" },
];

const INITIAL_EVENT_INFO = {
  companyName: "株式会社テクノソリューションズ",
  eventName:   "第30回 産業技術展 2025",
};

const F = "'Meiryo','Hiragino Kaku Gothic ProN','Noto Sans JP','Yu Gothic',sans-serif";

// ─── Google Drive URL変換 ────────────────────────────────────────────────────
// 共有URL → ダウンロードURL に自動変換する
function convertDriveUrl(url) {
  if (!url) return "";
  // https://drive.google.com/file/d/FILEID/view... 形式
  const match = url.match(/\/file\/d\/([^/]+)/);
  if (match) return `https://drive.google.com/uc?export=download&id=${match[1]}`;
  // すでにuc?export=download形式ならそのまま
  if (url.includes("drive.google.com/uc")) return url;
  return url;
}

function isDriveUrl(url) {
  return url && url.includes("drive.google.com");
}

// ─── localStorage ─────────────────────────────────────────────────────────────
function lsGet(k, fb) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; } }
function lsSet(k, v)  { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

function loadAccessLog()   { return lsGet(STORAGE_ACCESS, { totalCount: 0, resetAt: null, history: [] }); }
function recordAccess(log) {
  const u = { ...log, totalCount: log.totalCount + 1, history: [{ ts: new Date().toISOString() }, ...log.history].slice(0, 500) };
  lsSet(STORAGE_ACCESS, u); return u;
}
function resetAccessLog()  { const f = { totalCount: 0, resetAt: new Date().toISOString(), history: [] }; lsSet(STORAGE_ACCESS, f); return f; }

function loadVisitorLog()  { return lsGet(STORAGE_VISITORS, { entries: [], resetAt: null }); }
function addVisitorEntry(log, companyName, cats) {
  const entry = { id: Date.now(), ts: new Date().toISOString(), companyName: companyName.trim(), catalogs: cats };
  const u = { ...log, entries: [entry, ...log.entries].slice(0, 1000) };
  lsSet(STORAGE_VISITORS, u); return u;
}
function resetVisitorLog() { const f = { entries: [], resetAt: new Date().toISOString() }; lsSet(STORAGE_VISITORS, f); return f; }

function formatJa(iso)      { if (!iso) return "—"; return new Date(iso).toLocaleString("ja-JP", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit" }); }
function formatJaShort(iso) { if (!iso) return "—"; return new Date(iso).toLocaleString("ja-JP", { month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" }); }

function exportCSV(entries, eventName) {
  const BOM = "\uFEFF";
  const header = ["No.","日時","企業名・組織名","ダウンロードしたカタログ"].join(",");
  const rows = entries.map((e, i) => [i+1, formatJa(e.ts), `"${e.companyName||"(未記入)"}"`, `"${(e.catalogs||[]).join(" / ")}"`].join(","));
  const csv = BOM + [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `来場者リスト_${eventName}_${new Date().toLocaleDateString("ja-JP").replace(/\//g,"-")}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ─── メインコンポーネント ─────────────────────────────────────────────────────
export default function DigitalCatalogSystem() {
  const [mode, setMode] = useState("visitor");

  // 認証
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword,  setShowPassword]  = useState(false);
  const [authError,     setAuthError]     = useState("");
  const [authShake,     setAuthShake]     = useState(false);
  const passwordRef = useRef(null);

  // 共有データ
  const [catalogs,      setCatalogs]      = useState(INITIAL_CATALOGS);
  const [eventInfo,     setEventInfo]     = useState(INITIAL_EVENT_INFO);
  const [tempEventInfo, setTempEventInfo] = useState(INITIAL_EVENT_INFO);

  // 来場者
  const [selectedIds,    setSelectedIds]   = useState([]);
  const [visitorCompany, setVisitorCompany] = useState("");

  // 管理者
  const [infoSaved,   setInfoSaved]   = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCatalog,  setNewCatalog]  = useState({ title:"", fileSize:"", description:"", driveUrl:"" });
  const [formError,   setFormError]   = useState("");
  const [urlValid,    setUrlValid]    = useState(null); // null=未チェック, true=OK, false=NG

  // ログ
  const [accessLog,        setAccessLog]       = useState(() => loadAccessLog());
  const [visitorLog,       setVisitorLog]       = useState(() => loadVisitorLog());
  const [showVisitorList,  setShowVisitorList]  = useState(true);
  const [showResetAccess,  setShowResetAccess]  = useState(false);
  const [showResetVisitor, setShowResetVisitor] = useState(false);

  useEffect(() => { setAccessLog(prev => recordAccess(prev)); }, []);
  useEffect(() => {
    if (mode !== "admin") return;
    const id = setInterval(() => { setAccessLog(loadAccessLog()); setVisitorLog(loadVisitorLog()); }, 60000);
    return () => clearInterval(id);
  }, [mode]);
  useEffect(() => { if (showAuthModal) setTimeout(() => passwordRef.current?.focus(), 50); }, [showAuthModal]);

  // ── 認証 ──
  const openAuthModal = () => { setPasswordInput(""); setAuthError(""); setShowPassword(false); setShowAuthModal(true); };
  const handleAuth = () => {
    if (passwordInput === ADMIN_PASSWORD) {
      setShowAuthModal(false); setPasswordInput(""); setAuthError("");
      setTempEventInfo({ ...eventInfo }); setAccessLog(loadAccessLog()); setVisitorLog(loadVisitorLog());
      setMode("admin");
    } else {
      setAuthError("パスワードが正しくありません。");
      setAuthShake(true); setTimeout(() => setAuthShake(false), 500);
      setPasswordInput(""); passwordRef.current?.focus();
    }
  };
  const handleAuthKey = (e) => { if (e.key === "Enter") handleAuth(); if (e.key === "Escape") setShowAuthModal(false); };

  // ── ログアウト ──
  const handleLogout = () => {
    setMode("visitor"); setShowAddForm(false);
    setNewCatalog({ title:"", fileSize:"", description:"", driveUrl:"" });
    setFormError(""); setShowResetAccess(false); setShowResetVisitor(false); setUrlValid(null);
  };

  // ── 来場者 ──
  const toggleSelect = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const selectAll    = () => setSelectedIds(catalogs.map(c => c.id));
  const clearAll     = () => setSelectedIds([]);

  const handleDownload = (titleList, catalog) => {
    const updated = addVisitorEntry(visitorLog, visitorCompany, titleList);
    setVisitorLog(updated);
    if (catalog?.downloadUrl) {
      window.open(catalog.downloadUrl, "_blank");
    } else {
      alert(`✅ ダウンロード開始\n\n${titleList.join("\n")}`);
    }
  };

  const handleBulkDownload = () => {
    const sel = catalogs.filter(c => selectedIds.includes(c.id));
    const titles = sel.map(c => `・${c.title}`);
    const updated = addVisitorEntry(visitorLog, visitorCompany, titles);
    setVisitorLog(updated);
    sel.forEach(c => { if (c.downloadUrl) window.open(c.downloadUrl, "_blank"); });
    if (!sel.some(c => c.downloadUrl)) alert(`✅ ダウンロード開始\n\n${titles.join("\n")}`);
  };

  // ── DriveURL のバリデーション ──
  const handleDriveUrlChange = (val) => {
    setNewCatalog(p => ({ ...p, driveUrl: val }));
    if (!val) { setUrlValid(null); return; }
    const isValid = val.includes("drive.google.com");
    setUrlValid(isValid);
  };

  // ── カタログ追加 ──
  const handleAddCatalog = () => {
    if (!newCatalog.title.trim()) { setFormError("タイトルは必須です。"); return; }
    if (!newCatalog.driveUrl.trim()) { setFormError("Google DriveのURLを入力してください。"); return; }
    if (!isDriveUrl(newCatalog.driveUrl)) { setFormError("Google DriveのURLを入力してください。"); return; }
    const downloadUrl = convertDriveUrl(newCatalog.driveUrl);
    setCatalogs(prev => [...prev, {
      id: Date.now(), title: newCatalog.title,
      fileSize: newCatalog.fileSize || "—",
      description: newCatalog.description,
      downloadUrl,
    }]);
    setNewCatalog({ title:"", fileSize:"", description:"", driveUrl:"" });
    setFormError(""); setShowAddForm(false); setUrlValid(null);
  };

  const handleDelete = (id) => { setCatalogs(prev => prev.filter(c => c.id !== id)); setSelectedIds(prev => prev.filter(x => x !== id)); };
  const handleSaveEventInfo = () => { setEventInfo({ ...tempEventInfo }); setInfoSaved(true); setTimeout(() => setInfoSaved(false), 2500); };
  const handleResetAccess   = () => { setAccessLog(resetAccessLog());   setShowResetAccess(false); };
  const handleResetVisitor  = () => { setVisitorLog(resetVisitorLog()); setShowResetVisitor(false); };

  // スタイルヘルパー
  const btnPrimary = (x={}) => ({ display:"flex", alignItems:"center", gap:"6px", padding:"8px 16px", border:"none", borderRadius:"8px", background:"#0ea5e9", color:"#fff", fontSize:"13px", fontWeight:"700", cursor:"pointer", fontFamily:F, ...x });
  const btnOutline = (x={}) => ({ display:"flex", alignItems:"center", gap:"6px", padding:"7px 13px", border:"1.5px solid #0ea5e9", borderRadius:"8px", background:"#fff", color:"#0ea5e9", fontSize:"13px", fontWeight:"600", cursor:"pointer", fontFamily:F, ...x });
  const btnDanger  = (x={}) => ({ display:"flex", alignItems:"center", gap:"5px", padding:"6px 12px", border:"1px solid #fca5a5", borderRadius:"7px", background:"transparent", color:"#ef4444", fontSize:"12px", fontWeight:"600", cursor:"pointer", fontFamily:F, ...x });

  return (
    <div style={{ fontFamily:F, minHeight:"100vh", background:"var(--color-background-tertiary)", color:"var(--color-text-primary)" }}>
      <style>{`
        @keyframes shake   { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 40%{transform:translateX(8px)} 60%{transform:translateX(-5px)} 80%{transform:translateX(5px)} }
        @keyframes modalIn { from{opacity:0;transform:translateY(-12px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes countUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .modal-anim { animation: modalIn .2s ease; }
        .shake-anim { animation: shake .4s ease; }
        .hover-danger:hover { background:#fef2f2 !important; }
        .hover-row:hover    { background: var(--color-background-secondary) !important; }
      `}</style>

      {/* ══ 認証モーダル ══ */}
      {showAuthModal && (
        <div onClick={() => setShowAuthModal(false)}
          style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.6)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:"1rem" }}>
          <div onClick={e => e.stopPropagation()} className={authShake ? "shake-anim" : "modal-anim"}
            style={{ background:"var(--color-background-primary)", borderRadius:"16px", padding:"2rem", width:"100%", maxWidth:"360px", border:"0.5px solid var(--color-border-tertiary)" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1.5rem" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                <div style={{ width:"40px", height:"40px", borderRadius:"10px", background:"#0f172a", display:"flex", alignItems:"center", justifyContent:"center" }}><ShieldCheck size={20} color="#38bdf8"/></div>
                <div><p style={{ margin:0, fontWeight:"700", fontSize:"15px" }}>管理者認証</p><p style={{ margin:0, fontSize:"12px", color:"var(--color-text-secondary)" }}>パスワードを入力してください</p></div>
              </div>
              <button onClick={() => setShowAuthModal(false)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--color-text-secondary)", display:"flex", padding:"4px" }}><X size={18}/></button>
            </div>
            <div style={{ position:"relative", marginBottom: authError ? "8px" : "1.25rem" }}>
              <input ref={passwordRef} type={showPassword ? "text" : "password"} placeholder="パスワードを入力" value={passwordInput}
                onChange={e => { setPasswordInput(e.target.value); setAuthError(""); }} onKeyDown={handleAuthKey}
                style={{ width:"100%", padding:"11px 44px 11px 14px", border:`1.5px solid ${authError ? "#ef4444" : "var(--color-border-tertiary)"}`, borderRadius:"10px", fontSize:"15px", fontFamily:F, background:"var(--color-background-secondary)", color:"var(--color-text-primary)", boxSizing:"border-box", outline:"none", letterSpacing: showPassword ? "normal" : ".15em" }}/>
              <button onClick={() => setShowPassword(v => !v)} style={{ position:"absolute", right:"12px", top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"var(--color-text-secondary)", display:"flex", padding:0 }}>
                {showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
            {authError && <p style={{ color:"#ef4444", fontSize:"12px", margin:"0 0 1rem", display:"flex", alignItems:"center", gap:"5px" }}><X size={13}/>{authError}</p>}
            <button onClick={handleAuth} style={{ width:"100%", padding:"12px", border:"none", borderRadius:"10px", background:"linear-gradient(135deg,#0ea5e9,#0284c7)", color:"#fff", fontSize:"14px", fontWeight:"700", cursor:"pointer", fontFamily:F, display:"flex", alignItems:"center", justifyContent:"center", gap:"7px" }}>
              <Lock size={14}/>管理者としてログイン
            </button>
          </div>
        </div>
      )}

      {showResetAccess  && <ResetConfirmModal title="アクセス数をリセットしますか？"   count={accessLog.totalCount}      unit="アクセス"    onCancel={() => setShowResetAccess(false)}  onConfirm={handleResetAccess}/>}
      {showResetVisitor && <ResetConfirmModal title="来場者リストをリセットしますか？" count={visitorLog.entries.length} unit="件のレコード" onCancel={() => setShowResetVisitor(false)} onConfirm={handleResetVisitor}/>}

      {/* ════ 来場者向け画面 ════ */}
      {mode === "visitor" && (
        <div>
          <header style={{ background:"linear-gradient(135deg,#0ea5e9 0%,#06b6d4 100%)", padding:"2rem 1.5rem 1.5rem", color:"#fff" }}>
            <div style={{ maxWidth:"720px", margin:"0 auto" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"6px", opacity:.85, fontSize:"14px" }}>
                <Calendar size={15}/>{eventInfo.eventName}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                <Building2 size={26}/>
                <h1 style={{ margin:0, fontSize:"22px", fontWeight:"700", letterSpacing:".03em" }}>{eventInfo.companyName}</h1>
              </div>
              <p style={{ margin:"10px 0 0", fontSize:"14px", opacity:.9 }}>ご来場ありがとうございます。ご希望のカタログをお選びください。</p>
            </div>
          </header>

          <main style={{ maxWidth:"720px", margin:"0 auto", padding:"1.5rem" }}>
            {/* 企業名入力 */}
            <div style={{ marginBottom:"1.25rem", background:"var(--color-background-primary)", border:"0.5px solid var(--color-border-tertiary)", borderRadius:"12px", padding:"1rem 1.25rem" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"8px" }}>
                <Building size={16} color="#0ea5e9"/>
                <label style={{ fontWeight:"700", fontSize:"14px" }}>ご所属の企業・組織名</label>
                <span style={{ fontSize:"11px", fontWeight:"600", color:"#0ea5e9", background:"#e0f2fe", padding:"2px 8px", borderRadius:"20px" }}>任意</span>
              </div>
              <input type="text" placeholder="例：株式会社〇〇製作所（記入しなくてもダウンロードできます）"
                value={visitorCompany} onChange={e => setVisitorCompany(e.target.value)}
                style={{ width:"100%", padding:"10px 12px", border:"1.5px solid var(--color-border-tertiary)", borderRadius:"8px", fontSize:"14px", fontFamily:F, background:"var(--color-background-secondary)", color:"var(--color-text-primary)", boxSizing:"border-box", outline:"none" }}/>
              <p style={{ margin:"6px 0 0", fontSize:"12px", color:"var(--color-text-secondary)" }}>ご記入いただくと、後日担当者よりご連絡させていただく場合があります。</p>
            </div>

            {/* 操作バー */}
            <div style={{ display:"flex", flexWrap:"wrap", gap:"10px", alignItems:"center", marginBottom:"1.25rem" }}>
              <button onClick={selectedIds.length === catalogs.length ? clearAll : selectAll} style={btnOutline()}>
                {selectedIds.length === catalogs.length ? <CheckSquare size={15}/> : <Square size={15}/>}
                {selectedIds.length === catalogs.length ? "全解除" : "全て選択"}
              </button>
              {selectedIds.length > 0 && (
                <button onClick={handleBulkDownload} style={btnPrimary({ boxShadow:"0 2px 8px rgba(14,165,233,.35)" })}>
                  <Download size={15}/>一括ダウンロード（{selectedIds.length}件）
                </button>
              )}
              <span style={{ marginLeft:"auto", fontSize:"13px", color:"var(--color-text-secondary)" }}>{catalogs.length}件のカタログ</span>
            </div>

            {/* カタログ一覧 */}
            <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
              {catalogs.map(catalog => {
                const isSel = selectedIds.includes(catalog.id);
                return (
                  <div key={catalog.id} onClick={() => toggleSelect(catalog.id)}
                    style={{ background:"var(--color-background-primary)", border: isSel ? "2px solid #0ea5e9" : "1.5px solid var(--color-border-tertiary)", borderRadius:"12px", padding:"1rem 1.25rem", cursor:"pointer", display:"flex", gap:"14px", alignItems:"flex-start", boxShadow: isSel ? "0 2px 12px rgba(14,165,233,.18)" : "none" }}>
                    <div style={{ paddingTop:"2px", flexShrink:0 }}>
                      {isSel ? <CheckSquare size={22} color="#0ea5e9"/> : <Square size={22} color="var(--color-text-secondary)"/>}
                    </div>
                    <div style={{ width:"44px", height:"44px", borderRadius:"10px", background: isSel ? "#e0f2fe" : "var(--color-background-secondary)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <FileText size={22} color={isSel ? "#0ea5e9" : "var(--color-text-secondary)"}/>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ margin:"0 0 4px", fontWeight:"700", fontSize:"15px", color: isSel ? "#0369a1" : "var(--color-text-primary)" }}>{catalog.title}</p>
                      <p style={{ margin:"0 0 6px", fontSize:"13px", color:"var(--color-text-secondary)", lineHeight:1.6 }}>{catalog.description}</p>
                      <span style={{ fontSize:"12px", color:"#0ea5e9", fontWeight:"600", background:"#e0f2fe", padding:"2px 8px", borderRadius:"20px" }}>PDF · {catalog.fileSize}</span>
                    </div>
                    <button onClick={e => { e.stopPropagation(); handleDownload([`・${catalog.title}`], catalog); }}
                      style={{ flexShrink:0, display:"flex", alignItems:"center", gap:"5px", padding:"7px 12px", border:"1.5px solid #0ea5e9", borderRadius:"8px", background: isSel ? "#0ea5e9" : "#fff", color: isSel ? "#fff" : "#0ea5e9", fontSize:"12px", fontWeight:"600", cursor:"pointer", fontFamily:F, whiteSpace:"nowrap" }}>
                      <Download size={13}/>DL
                    </button>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop:"2rem", padding:"1rem", background:"var(--color-background-primary)", border:"0.5px solid var(--color-border-tertiary)", borderRadius:"12px", display:"flex", alignItems:"center", gap:"12px", fontSize:"13px", color:"var(--color-text-secondary)" }}>
              <QrCode size={28} color="#0ea5e9"/>
              <span>このページはQRコードからアクセスいただいています。ブラウザのブックマークに追加して後からもご確認いただけます。</span>
            </div>
          </main>

          <footer style={{ marginTop:"3rem", padding:"1.5rem 1.5rem 2rem", textAlign:"center", borderTop:"0.5px solid var(--color-border-tertiary)" }}>
            <p style={{ fontSize:"12px", color:"var(--color-text-secondary)", margin:"0 0 12px", opacity:.6 }}>© 2025 {eventInfo.companyName}. All rights reserved.</p>
            <button onClick={openAuthModal} style={{ background:"none", border:"none", cursor:"pointer", padding:"6px", opacity:.15, color:"var(--color-text-secondary)", display:"inline-flex", borderRadius:"6px", transition:"opacity .2s" }}
              onMouseEnter={e => e.currentTarget.style.opacity="0.45"} onMouseLeave={e => e.currentTarget.style.opacity="0.15"}>
              <Lock size={14}/>
            </button>
          </footer>
        </div>
      )}

      {/* ════ 管理者ダッシュボード ════ */}
      {mode === "admin" && (
        <div>
          <header style={{ background:"#0f172a", padding:"1.25rem 1.5rem", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
              <div style={{ width:"36px", height:"36px", borderRadius:"8px", background:"rgba(56,189,248,.15)", display:"flex", alignItems:"center", justifyContent:"center", border:"1px solid rgba(56,189,248,.3)" }}>
                <Settings size={18} color="#38bdf8"/>
              </div>
              <div>
                <h2 style={{ margin:0, color:"#f1f5f9", fontSize:"16px", fontWeight:"700" }}>管理者ダッシュボード</h2>
                <p style={{ margin:0, color:"#64748b", fontSize:"12px" }}>展示会情報・カタログの設定・管理</p>
              </div>
            </div>
            <button onClick={handleLogout}
              style={{ display:"flex", alignItems:"center", gap:"6px", padding:"8px 14px", border:"1px solid #334155", borderRadius:"8px", background:"transparent", color:"#94a3b8", fontSize:"13px", fontWeight:"600", cursor:"pointer", fontFamily:F }}
              onMouseEnter={e => { e.currentTarget.style.borderColor="#ef4444"; e.currentTarget.style.color="#f87171"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor="#334155"; e.currentTarget.style.color="#94a3b8"; }}>
              <LogOut size={14}/>ログアウト
            </button>
          </header>

          <main style={{ maxWidth:"860px", margin:"0 auto", padding:"1.5rem" }}>

            {/* ① アクセス集計 */}
            <section style={{ marginBottom:"2rem" }}>
              <SectionTitle icon={<Users size={18} color="#0ea5e9"/>} label="QRアクセス集計">
                <button onClick={() => setShowResetAccess(true)} style={btnDanger()} className="hover-danger"><RotateCcw size={12}/>カウントをリセット</button>
              </SectionTitle>
              <div style={{ marginBottom:"10px" }}>
                <MetricCard label="累計アクセス数" value={accessLog.totalCount} color="#0369a1" bg="#e0f2fe" icon={<Users size={18} color="#0ea5e9"/>} primary/>
              </div>
              <InfoBar icon={<RotateCcw size={13}/>} text={accessLog.resetAt ? `前回リセット：${formatJa(accessLog.resetAt)}` : "リセット履歴なし"}/>
            </section>

            {/* ② 来場者リスト */}
            <section style={{ marginBottom:"2rem" }}>
              <SectionTitle icon={<Building size={18} color="#0ea5e9"/>} label="来場者リスト">
                <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
                  <span style={{ background:"#e0f2fe", color:"#0369a1", fontSize:"12px", fontWeight:"700", padding:"2px 10px", borderRadius:"20px" }}>{visitorLog.entries.length}件</span>
                  <button onClick={() => exportCSV(visitorLog.entries, eventInfo.eventName)} style={btnPrimary({ fontSize:"12px", padding:"6px 12px" })}><FileDown size={13}/>CSV出力</button>
                  <button onClick={() => setShowResetVisitor(true)} style={btnDanger()} className="hover-danger"><RotateCcw size={12}/>リセット</button>
                  <button onClick={() => setShowVisitorList(v => !v)}
                    style={{ display:"flex", alignItems:"center", gap:"5px", padding:"6px 12px", border:"1px solid var(--color-border-tertiary)", borderRadius:"7px", background:"transparent", color:"var(--color-text-secondary)", fontSize:"12px", fontWeight:"600", cursor:"pointer", fontFamily:F }}>
                    {showVisitorList ? <><ChevronUp size={13}/>非表示</> : <><ChevronDown size={13}/>表示</>}
                  </button>
                </div>
              </SectionTitle>
              {showVisitorList && (
                <div style={{ background:"var(--color-background-primary)", border:"0.5px solid var(--color-border-tertiary)", borderRadius:"12px", overflow:"hidden" }}>
                  {visitorLog.entries.length === 0 ? (
                    <div style={{ padding:"2.5rem", textAlign:"center", color:"var(--color-text-secondary)", fontSize:"14px" }}>まだ記録がありません。来場者がダウンロードを行うと、ここに表示されます。</div>
                  ) : (
                    <>
                      <div style={{ display:"grid", gridTemplateColumns:"36px 1fr 1fr 2fr", padding:"8px 16px", background:"var(--color-background-secondary)", borderBottom:"0.5px solid var(--color-border-tertiary)", fontSize:"11px", fontWeight:"700", color:"var(--color-text-secondary)", letterSpacing:".05em" }}>
                        <span>#</span><span>日時</span><span>企業名・組織名</span><span>ダウンロードしたカタログ</span>
                      </div>
                      <div style={{ maxHeight:"420px", overflowY:"auto" }}>
                        {visitorLog.entries.map((entry, i) => (
                          <div key={entry.id} className="hover-row"
                            style={{ display:"grid", gridTemplateColumns:"36px 1fr 1fr 2fr", padding:"10px 16px", borderBottom:"0.5px solid var(--color-border-tertiary)", fontSize:"13px", alignItems:"center" }}>
                            <span style={{ color:"var(--color-text-secondary)", fontSize:"12px" }}>{visitorLog.entries.length - i}</span>
                            <span style={{ color:"var(--color-text-secondary)", fontSize:"12px" }}>{formatJaShort(entry.ts)}</span>
                            <span style={{ fontWeight: entry.companyName ? "600" : "400", color: entry.companyName ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}>
                              {entry.companyName || <span style={{ fontStyle:"italic", opacity:.7 }}>未記入</span>}
                            </span>
                            <span style={{ fontSize:"12px", color:"var(--color-text-secondary)", lineHeight:1.5 }}>{(entry.catalogs||[]).join(" / ")||"—"}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ padding:"8px 16px", background:"var(--color-background-secondary)", borderTop:"0.5px solid var(--color-border-tertiary)", fontSize:"12px", color:"var(--color-text-secondary)", display:"flex", justifyContent:"space-between" }}>
                        <span>全 {visitorLog.entries.length} 件 ／ 企業名あり {visitorLog.entries.filter(e=>e.companyName).length} 件</span>
                        <span style={{ opacity:.7 }}>スクロールで全件表示</span>
                      </div>
                    </>
                  )}
                </div>
              )}
              <InfoBar icon={<RotateCcw size={13}/>} text={visitorLog.resetAt ? `前回リセット：${formatJa(visitorLog.resetAt)}` : "リセット履歴なし"} style={{ marginTop:"8px" }}/>
            </section>

            {/* ③ 基本情報 */}
            <section style={{ marginBottom:"2rem" }}>
              <SectionTitle icon={<Building2 size={18} color="#0ea5e9"/>} label="基本情報設定"/>
              <div style={{ background:"var(--color-background-primary)", border:"0.5px solid var(--color-border-tertiary)", borderRadius:"12px", padding:"1.5rem" }}>
                <Field label="会社名"><input type="text" value={tempEventInfo.companyName} onChange={e => setTempEventInfo(p => ({ ...p, companyName: e.target.value }))} style={inputStyle()}/></Field>
                <Field label="展示会名"><input type="text" value={tempEventInfo.eventName} onChange={e => setTempEventInfo(p => ({ ...p, eventName: e.target.value }))} style={inputStyle({ marginBottom:"1.25rem" })}/></Field>
                <button onClick={handleSaveEventInfo}
                  style={{ display:"flex", alignItems:"center", gap:"7px", padding:"10px 20px", border:"none", borderRadius:"8px", background: infoSaved ? "#10b981" : "#0ea5e9", color:"#fff", fontSize:"14px", fontWeight:"700", cursor:"pointer", fontFamily:F, transition:"background .3s" }}>
                  <Save size={15}/>{infoSaved ? "保存しました ✓" : "保存する"}
                </button>
              </div>
            </section>

            {/* ④ カタログ管理 */}
            <section>
              <SectionTitle icon={<Package size={18} color="#0ea5e9"/>} label="カタログ管理">
                <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                  <span style={{ background:"#e0f2fe", color:"#0369a1", fontSize:"12px", fontWeight:"700", padding:"2px 8px", borderRadius:"20px" }}>{catalogs.length}件</span>
                  <button onClick={() => { setShowAddForm(v => !v); setNewCatalog({ title:"", fileSize:"", description:"", driveUrl:"" }); setFormError(""); setUrlValid(null); }}
                    style={{ display:"flex", alignItems:"center", gap:"6px", padding:"7px 13px", border:"none", borderRadius:"8px", background: showAddForm ? "#94a3b8" : "#0ea5e9", color:"#fff", fontSize:"13px", fontWeight:"700", cursor:"pointer", fontFamily:F }}>
                    {showAddForm ? <><X size={14}/>キャンセル</> : <><Plus size={14}/>新規追加</>}
                  </button>
                </div>
              </SectionTitle>

              {/* ── 追加フォーム ── */}
              {showAddForm && (
                <div style={{ background:"#f0f9ff", border:"1.5px solid #7dd3fc", borderRadius:"12px", padding:"1.25rem", marginBottom:"1rem" }}>
                  <p style={{ margin:"0 0 1rem", fontWeight:"700", fontSize:"14px", color:"#0369a1" }}>新しいカタログを追加</p>
                  {formError && <p style={{ color:"#dc2626", fontSize:"13px", margin:"0 0 10px", display:"flex", alignItems:"center", gap:"5px" }}><X size={13}/>{formError}</p>}

                  <div style={{ display:"grid", gap:"12px" }}>

                    {/* タイトル */}
                    <div>
                      <label style={{ fontSize:"12px", fontWeight:"600", color:"#0369a1", display:"block", marginBottom:"4px" }}>タイトル <span style={{ color:"#dc2626" }}>*</span></label>
                      <input type="text" placeholder="例：製品カタログ 2025年春版" value={newCatalog.title}
                        onChange={e => setNewCatalog(p => ({ ...p, title: e.target.value }))}
                        style={inputStyle({ border:"1px solid #7dd3fc", background:"#fff" })}/>
                    </div>

                    {/* ファイルサイズ */}
                    <div>
                      <label style={{ fontSize:"12px", fontWeight:"600", color:"#0369a1", display:"block", marginBottom:"4px" }}>ファイルサイズ（任意）</label>
                      <input type="text" placeholder="例：5.3 MB" value={newCatalog.fileSize}
                        onChange={e => setNewCatalog(p => ({ ...p, fileSize: e.target.value }))}
                        style={inputStyle({ border:"1px solid #7dd3fc", background:"#fff" })}/>
                    </div>

                    {/* 説明文 */}
                    <div>
                      <label style={{ fontSize:"12px", fontWeight:"600", color:"#0369a1", display:"block", marginBottom:"4px" }}>説明文</label>
                      <textarea rows={2} placeholder="カタログの内容を簡単に説明してください" value={newCatalog.description}
                        onChange={e => setNewCatalog(p => ({ ...p, description: e.target.value }))}
                        style={{ ...inputStyle({ border:"1px solid #7dd3fc", background:"#fff" }), resize:"vertical" }}/>
                    </div>

                    {/* Google Drive URL */}
                    <div>
                      <label style={{ fontSize:"12px", fontWeight:"600", color:"#0369a1", display:"block", marginBottom:"4px" }}>
                        Google Drive 共有URL <span style={{ color:"#dc2626" }}>*</span>
                      </label>
                      <div style={{ position:"relative" }}>
                        <input type="text"
                          placeholder="https://drive.google.com/file/d/〇〇〇/view?usp=sharing"
                          value={newCatalog.driveUrl}
                          onChange={e => handleDriveUrlChange(e.target.value)}
                          style={{ ...inputStyle({ border:`1.5px solid ${urlValid === true ? "#16a34a" : urlValid === false ? "#ef4444" : "#7dd3fc"}`, background:"#fff", paddingRight:"36px" }) }}/>
                        {urlValid === true && <span style={{ position:"absolute", right:"10px", top:"50%", transform:"translateY(-50%)", color:"#16a34a", fontSize:"18px" }}>✓</span>}
                        {urlValid === false && <span style={{ position:"absolute", right:"10px", top:"50%", transform:"translateY(-50%)", color:"#ef4444", fontSize:"18px" }}>✗</span>}
                      </div>

                      {/* 手順ガイド */}
                      <div style={{ marginTop:"10px", background:"#fff", border:"1px solid #bae6fd", borderRadius:"8px", padding:"12px 14px" }}>
                        <p style={{ margin:"0 0 8px", fontSize:"12px", fontWeight:"700", color:"#0369a1", display:"flex", alignItems:"center", gap:"5px" }}>
                          <LinkIcon size={13}/>Google DriveのURLの取得方法
                        </p>
                        <ol style={{ margin:0, paddingLeft:"18px", fontSize:"12px", color:"var(--color-text-secondary)", lineHeight:2 }}>
                          <li><a href="https://drive.google.com" target="_blank" rel="noreferrer" style={{ color:"#0ea5e9" }}>drive.google.com</a> を開いてPDFをアップロード</li>
                          <li>アップロードしたPDFを<strong>右クリック</strong> →「共有」をクリック</li>
                          <li>「リンクを知っている全員」に変更して「<strong>リンクをコピー</strong>」</li>
                          <li>コピーしたURLをこの欄に貼り付ける</li>
                        </ol>
                      </div>
                    </div>
                  </div>

                  <button onClick={handleAddCatalog}
                    style={{ marginTop:"14px", display:"flex", alignItems:"center", gap:"6px", padding:"10px 20px", border:"none", borderRadius:"8px", background:"#0ea5e9", color:"#fff", fontSize:"13px", fontWeight:"700", cursor:"pointer", fontFamily:F }}>
                    <Plus size={14}/>追加する
                  </button>
                </div>
              )}

              {/* カタログ一覧 */}
              <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                {catalogs.map(catalog => (
                  <div key={catalog.id} style={{ background:"var(--color-background-primary)", border:"0.5px solid var(--color-border-tertiary)", borderRadius:"10px", padding:"1rem 1.25rem", display:"flex", alignItems:"flex-start", gap:"12px" }}>
                    <div style={{ width:"38px", height:"38px", borderRadius:"8px", background:"#e0f2fe", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <FileText size={18} color="#0ea5e9"/>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ margin:"0 0 3px", fontWeight:"700", fontSize:"14px" }}>{catalog.title}</p>
                      <p style={{ margin:"0 0 4px", fontSize:"12px", color:"var(--color-text-secondary)", lineHeight:1.5 }}>{catalog.description || "説明なし"}</p>
                      <div style={{ display:"flex", alignItems:"center", gap:"8px", flexWrap:"wrap" }}>
                        <span style={{ fontSize:"12px", color:"#0ea5e9", fontWeight:"600" }}>PDF · {catalog.fileSize}</span>
                        {catalog.downloadUrl
                          ? <span style={{ fontSize:"11px", color:"#16a34a", fontWeight:"600", background:"#dcfce7", padding:"1px 7px", borderRadius:"20px", display:"flex", alignItems:"center", gap:"3px" }}>
                              <ExternalLink size={10}/>Drive連携済み
                            </span>
                          : <span style={{ fontSize:"11px", color:"#d97706", fontWeight:"600", background:"#fef3c7", padding:"1px 7px", borderRadius:"20px" }}>URL未設定</span>
                        }
                      </div>
                    </div>
                    <button onClick={() => { if (window.confirm(`「${catalog.title}」を削除しますか？`)) handleDelete(catalog.id); }}
                      style={{ flexShrink:0, display:"flex", alignItems:"center", gap:"5px", padding:"7px 10px", border:"1px solid #fca5a5", borderRadius:"7px", background:"#fff", color:"#dc2626", fontSize:"12px", fontWeight:"600", cursor:"pointer", fontFamily:F }}>
                      <Trash2 size={13}/>削除
                    </button>
                  </div>
                ))}
                {catalogs.length === 0 && (
                  <div style={{ textAlign:"center", padding:"2rem", color:"var(--color-text-secondary)", fontSize:"14px", background:"var(--color-background-primary)", border:"0.5px solid var(--color-border-tertiary)", borderRadius:"12px" }}>
                    カタログが登録されていません。「新規追加」から追加してください。
                  </div>
                )}
              </div>
            </section>
          </main>
        </div>
      )}
    </div>
  );
}

// ─── サブコンポーネント ────────────────────────────────────────────────────────
function SectionTitle({ icon, label, children }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1rem", paddingBottom:"8px", borderBottom:"2px solid #0ea5e9" }}>
      <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>{icon}<h3 style={{ margin:0, fontSize:"15px", fontWeight:"700", color:"#0ea5e9" }}>{label}</h3></div>
      {children && <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>{children}</div>}
    </div>
  );
}
function MetricCard({ label, value, color, bg, icon, primary }) {
  return (
    <div style={{ background:"var(--color-background-primary)", border: primary ? "2px solid #0ea5e9" : "0.5px solid var(--color-border-tertiary)", borderRadius:"14px", padding:"1.25rem 1rem", textAlign:"center", position:"relative", overflow:"hidden" }}>
      {primary && <div style={{ position:"absolute", top:0, left:0, right:0, height:"3px", background:"linear-gradient(90deg,#0ea5e9,#06b6d4)" }}/>}
      <div style={{ width:"36px", height:"36px", borderRadius:"10px", background:bg, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 10px" }}>{icon}</div>
      <p style={{ margin:"0 0 4px", fontSize:"11px", fontWeight:"600", color:"var(--color-text-secondary)", letterSpacing:".05em" }}>{label}</p>
      <p style={{ margin:0, fontSize:"36px", fontWeight:"700", color, lineHeight:1, animation:"countUp .4s ease" }}>{value.toLocaleString()}</p>
      <p style={{ margin:"4px 0 0", fontSize:"11px", color:"var(--color-text-secondary)" }}>件</p>
    </div>
  );
}
function InfoBar({ icon, text, style: s }) {
  return (
    <div style={{ background:"var(--color-background-secondary)", border:"0.5px solid var(--color-border-tertiary)", borderRadius:"8px", padding:"9px 13px", display:"flex", alignItems:"center", gap:"7px", fontSize:"12px", color:"var(--color-text-secondary)", ...s }}>
      {icon}<span>{text}</span>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <div style={{ marginBottom:"1rem" }}>
      <label style={{ display:"block", fontSize:"13px", fontWeight:"600", color:"var(--color-text-secondary)", marginBottom:"6px" }}>{label}</label>
      {children}
    </div>
  );
}
function inputStyle(extra={}) {
  return { width:"100%", padding:"10px 12px", border:"1.5px solid var(--color-border-tertiary)", borderRadius:"8px", fontSize:"14px", fontFamily:"'Meiryo','Hiragino Kaku Gothic ProN','Noto Sans JP','Yu Gothic',sans-serif", background:"var(--color-background-secondary)", color:"var(--color-text-primary)", boxSizing:"border-box", outline:"none", ...extra };
}
function ResetConfirmModal({ title, count, unit, onCancel, onConfirm }) {
  return (
    <div onClick={onCancel} style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.65)", backdropFilter:"blur(4px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:"1rem" }}>
      <div onClick={e => e.stopPropagation()} className="modal-anim"
        style={{ background:"var(--color-background-primary)", borderRadius:"16px", padding:"2rem", width:"100%", maxWidth:"360px", border:"0.5px solid var(--color-border-tertiary)" }}>
        <div style={{ width:"52px", height:"52px", borderRadius:"14px", background:"#fff7ed", border:"1.5px solid #fed7aa", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 0 1.25rem" }}>
          <AlertTriangle size={26} color="#f97316"/>
        </div>
        <h3 style={{ margin:"0 0 8px", fontSize:"16px", fontWeight:"700" }}>{title}</h3>
        <p style={{ margin:"0 0 1.5rem", fontSize:"13px", color:"var(--color-text-secondary)", lineHeight:1.7 }}>
          現在の記録（<strong>{count.toLocaleString()} {unit}</strong>）がすべてゼロに戻ります。<br/>この操作は元に戻せません。
        </p>
        <div style={{ display:"flex", gap:"10px" }}>
          <button onClick={onCancel} style={{ flex:1, padding:"10px", border:"1.5px solid var(--color-border-tertiary)", borderRadius:"8px", background:"transparent", color:"var(--color-text-primary)", fontSize:"13px", fontWeight:"600", cursor:"pointer", fontFamily:"'Meiryo',sans-serif" }}>キャンセル</button>
          <button onClick={onConfirm} style={{ flex:1, padding:"10px", border:"none", borderRadius:"8px", background:"#ef4444", color:"#fff", fontSize:"13px", fontWeight:"700", cursor:"pointer", fontFamily:"'Meiryo',sans-serif", display:"flex", alignItems:"center", justifyContent:"center", gap:"6px" }}>
            <RotateCcw size={13}/>リセット実行
          </button>
        </div>
      </div>
    </div>
  );
}
