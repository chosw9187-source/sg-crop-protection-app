(function(){
  "use strict";
  var D = window.APP_DATA;
  var PRODUCTS = D.products.map(function(p, i){ p._id = i; return p; });
  var WEEDS = D.weeds;
  var PESTS = D.pests || [];
  var MIX_BYCROP = D.mixingByCrop;

  // ---------- STORAGE ----------
  var LS = {
    code: "sg_access_code",
    admin: "sg_admin_pw",
    authed: "sg_authed_v1",
    users: "sg_users_v1",
    currentUser: "sg_current_user_v1",
    journal: "sg_journal_v1",
    quizStat: "sg_quiz_stat_v1",
    chat: "sg_chat_v1"
  };
  var DEFAULT_CODE = "SG2026";
  var DEFAULT_ADMIN = "sgadmin!2026";

  function lsGet(k, fallback){
    try { var v = localStorage.getItem(k); return v === null ? fallback : v; }
    catch(e){ return fallback; }
  }
  function lsSet(k, v){ try { localStorage.setItem(k, v); } catch(e){} }
  function lsDel(k){ try { localStorage.removeItem(k); } catch(e){} }
  function getAccessCode(){ return lsGet(LS.code, DEFAULT_CODE); }
  function getAdminPw(){ return lsGet(LS.admin, DEFAULT_ADMIN); }

  // ---------- 사용자(이름표) 관리 ----------
  // 서버가 없으므로 실제 로그인이 아니라 "이름 선택" 방식.
  // 같은 기기 안에서 사람별로 기록을 분리하는 용도.
  function getUsers(){
    try { var a = JSON.parse(lsGet(LS.users, "[]")); return Array.isArray(a) ? a : []; }
    catch(e){ return []; }
  }
  function saveUsers(list){ lsSet(LS.users, JSON.stringify(list)); }
  function getCurrentUser(){ return lsGet(LS.currentUser, ""); }
  function setCurrentUser(name){ lsSet(LS.currentUser, name); }
  function addUser(name){
    var list = getUsers();
    if(list.indexOf(name) === -1){ list.push(name); list.sort(function(a,b){ return a.localeCompare(b,"ko"); }); saveUsers(list); }
  }
  // 사용자별 저장소 키
  function uKey(base){ return base + "__" + (getCurrentUser() || "_"); }

  function loadJournal(){
    try { return JSON.parse(lsGet(uKey(LS.journal), "[]")) || []; } catch(e){ return []; }
  }
  function saveJournal(list){ lsSet(uKey(LS.journal), JSON.stringify(list)); }

  // 대화내용은 검색결과 객체를 그대로 저장하지 않고,
  // 원 질문만 남겼다가 불러올 때 다시 계산해서 복원한다 (용량/순환참조 방지).
  function saveChat(){
    var slim = state.chatMessages.map(function(m){
      if(m.role === "user") return { role:"user", text:m.text };
      return { role:"bot", text:m.text, q:m.q || "", kind:m.kind || "" };
    });
    lsSet(uKey(LS.chat), JSON.stringify(slim));
  }
  function loadChat(){
    var raw;
    try { raw = JSON.parse(lsGet(uKey(LS.chat), "[]")); } catch(e){ return []; }
    if(!Array.isArray(raw)) return [];
    return raw.map(function(m){
      if(m.role === "user") return m;
      var out = { role:"bot", text:m.text, q:m.q, kind:m.kind };
      if(m.kind === "crop") out.cropOverview = getCropOverview(m.q);
      else if(m.kind === "search") out.results = chatSearch(m.q);
      return out;
    });
  }

  function nowStamp(){
    var d = new Date();
    function p(n){ return (n<10?"0":"") + n; }
    return d.getFullYear() + "-" + p(d.getMonth()+1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  function pestByName(name){
    if(!name) return null;
    var exact = PESTS.find(function(x){ return x.name === name; });
    if(exact) return exact;
    // fall back: match if the pest name is a leading substring of the target name
    // (handles suffixed variants like "이화명나방(1화기)")
    var contained = PESTS.filter(function(x){ return name.indexOf(x.name) !== -1; });
    if(contained.length){
      contained.sort(function(a,b){ return b.name.length - a.name.length; });
      return contained[0];
    }
    return null;
  }
  var CAT_COLOR = {
    "살균제":"var(--cat-살균제)","살충제":"var(--cat-살충제)","살균살충제":"var(--cat-살균살충제)",
    "제초제":"var(--cat-제초제)","비선택성제초제":"var(--cat-비선택성제초제)","생장조정제":"var(--cat-생장조정제)",
    "기타":"var(--sg-gray)"
  };
  var CAT_ICON = {
    "살균제":"🦫","살충제":"🐛","살균살충제":"⚔️",
    "제초제":"🌿","비선택성제초제":"☠️","생장조정제":"🌱",
    "기타":"🧪"
  };

  var FORMULATION_GUIDE = D.formulationGuide || [];
  var FORMULATION_BY_KEY = {};
  FORMULATION_GUIDE.forEach(function(f){ FORMULATION_BY_KEY[f.key] = f; });

  var FORM_ICON_PATHS = {
    "bottle-shake": '<path d="M9 2h6v3l1.5 2.5V21a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V7.5L9 5V2z"/><path d="M8 11h8" stroke-dasharray="1.5 1.5"/><path d="M9 2h6" />',
    "oil-drop": '<path d="M12 3c3 4 5.5 7.3 5.5 10.3A5.5 5.5 0 0 1 6.5 13.3C6.5 10.3 9 7 12 3z"/><path d="M9.8 14.5c0 1.2 1 2.2 2.2 2.2" stroke-linecap="round"/>',
    "granule-bag": '<path d="M8 3h8l1.5 4.5-1 12a1 1 0 0 1-1 .9H8.5a1 1 0 0 1-1-.9l-1-12L8 3z"/><path d="M9 3l-.5-1.5h7L15 3"/><circle cx="10.2" cy="12" r="0.9" fill="currentColor" stroke="none"/><circle cx="13.5" cy="13.5" r="0.9" fill="currentColor" stroke="none"/><circle cx="11" cy="16" r="0.9" fill="currentColor" stroke="none"/>',
    "tablet": '<circle cx="12" cy="12" r="7.5"/><path d="M7 12h10" />',
    "powder-bag": '<path d="M8 3h8l1.5 4.5-1 12a1 1 0 0 1-1 .9H8.5a1 1 0 0 1-1-.9l-1-12L8 3z"/><path d="M9 3l-.5-1.5h7L15 3"/><path d="M9 11.5h6M8.7 14.5h6.6M9.3 17.5h5.4" stroke-linecap="round"/>',
    "clear-bottle": '<path d="M9.5 2h5v3l1.5 2.5V21a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1V7.5L9.5 5V2z"/><path d="M9.5 2h5" /><path d="M9 13.5c1 1 2 1 3 0s2-1 3 0" stroke-linecap="round"/>',
    "pellet-jar": '<path d="M6.5 8h11v11.5a1.5 1.5 0 0 1-1.5 1.5h-8a1.5 1.5 0 0 1-1.5-1.5V8z"/><path d="M8 8V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V8"/><circle cx="9.8" cy="13" r="0.8" fill="currentColor" stroke="none"/><circle cx="12.5" cy="14.5" r="0.8" fill="currentColor" stroke="none"/><circle cx="14.5" cy="12" r="0.8" fill="currentColor" stroke="none"/><circle cx="11" cy="17" r="0.8" fill="currentColor" stroke="none"/>',
    "fine-drop": '<path d="M12 3.5c2.6 3.4 4.8 6.4 4.8 9.1a4.8 4.8 0 0 1-9.6 0c0-2.7 2.2-5.7 4.8-9.1z"/><circle cx="17.5" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="6.5" cy="9" r="0.8" fill="currentColor" stroke="none"/>',
    "micro-drop": '<path d="M12 3.5c2.6 3.4 4.8 6.4 4.8 9.1a4.8 4.8 0 0 1-9.6 0c0-2.7 2.2-5.7 4.8-9.1z" stroke-dasharray="2 1.4"/>',
    "dust-cloud": '<circle cx="9" cy="15" r="2.6"/><circle cx="14" cy="16.5" r="2" /><circle cx="12" cy="12" r="1.6" /><circle cx="16.5" cy="12.5" r="1.2" />',
    "dual-drop": '<path d="M8.5 3.5c2 2.8 3.5 5 3.5 7a3.5 3.5 0 0 1-7 0c0-2 1.5-4.2 3.5-7z"/><path d="M15.5 8.5c2 2.8 3.5 5 3.5 7a3.5 3.5 0 0 1-7 0c0-2 1.5-4.2 3.5-7z"/>',
    "seed-coat": '<ellipse cx="12" cy="13" rx="4" ry="6"/><path d="M12 7V4M9.5 5.5 8 4M14.5 5.5 16 4" stroke-linecap="round"/>',
    "bordeaux": '<path d="M9 2h6v3l1.5 2.5V21a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V7.5L9 5V2z"/><path d="M8 13c1.3 1 2.7 1 4 0s2.7-1 4 0" stroke-linecap="round"/>'
  };
  function formIconSvg(iconKey){
    var p = FORM_ICON_PATHS[iconKey] || FORM_ICON_PATHS["bottle-shake"];
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round">' + p + '</svg>';
  }
  function formatDosage(t){
    var d = t.dosage || "";
    var esc = escapeHtml(d);
    if(!d || d === "-") return esc;
    if(!t.method || t.method.indexOf("경엽처리") === -1) return esc;
    if(/무인항공|무인헬기|드론|ULV/.test(t.method)) return esc;
    if(/ℓ|L|㎡|10a|kg|㎏|당|상자/.test(d)) return esc;
    return esc + '<span class="water-basis"> (물 20ℓ 기준)</span>';
  }

  function formulationCardHtml(fg){
    return '<div class="formulation-card">' +
      '<div class="formulation-card-head"><span class="formulation-card-icon">' + formIconSvg(fg.icon) + '</span>' +
      '<div><div class="formulation-card-title">' + escapeHtml(fg.key) + '<span class="formulation-card-abbr">' + escapeHtml(fg.abbr) + '</span></div>' +
      '<div class="formulation-card-eng">' + escapeHtml(fg.engName) + '</div></div></div>' +
      '<div class="formulation-card-row"><b>형태</b>' + escapeHtml(fg.form) + '</div>' +
      '<div class="formulation-card-row"><b>특징</b>' + escapeHtml(fg.feature) + '</div>' +
      '</div>';
  }

  function productByName(name){
    return PRODUCTS.find(function(p){ return p.productName === name; });
  }
  function mixByProductName(name){
    return MIX_BYCROP.find(function(m){ return m.baseProduct === name; });
  }
  function findGenericMix(name){
    // search rice-farming / drone list tables for this product as key or inside compat lists
    var hits = [];
    (D.mixingLists||[]).forEach(function(listEntry){
      (listEntry.products||[]).forEach(function(row){
        var pname = row["제품명"];
        if(pname && pname.indexOf(name) !== -1){
          hits.push({ title: listEntry.title, self: row });
        }
      });
    });
    return hits;
  }

  function classifyTarget(target){
    if(/병$|병\)|역병|무늬병|썩음병|시들음병/.test(target)) return "병해";
    if(/잡초|바랭이|피\b/.test(target)) return "잡초";
    return "해충";
  }

  // Build unified diagnosis entries grouped by pest/disease name, with crops nested inside
  var TARGET_ENTRIES = (function(){
    var map = {};
    PRODUCTS.forEach(function(p){
      (p.targets||[]).forEach(function(t){
        if(!t.target || t.target.indexOf("정보 준비중") !== -1) return;
        if(!map[t.target]) map[t.target] = { target: t.target, kind: classifyTarget(t.target), cropMap: {}, cropOrder: [] };
        var e = map[t.target];
        if(!e.cropMap[t.crop]){ e.cropMap[t.crop] = { crop: t.crop, rows: [] }; e.cropOrder.push(t.crop); }
        e.cropMap[t.crop].rows.push({ product: p.productName, timing: t.timing, method: t.method, dosage: t.dosage, notes: t.notes });
      });
    });
    return Object.keys(map).map(function(k){
      var e = map[k];
      var crops = e.cropOrder.map(function(c){ return e.cropMap[c]; });
      var totalRows = crops.reduce(function(s,c){ return s + c.rows.length; }, 0);
      return { target: e.target, kind: e.kind, crops: crops, cropCount: crops.length, totalRows: totalRows };
    });
  })();

  var state = { tab: "search", view: "list", selected: null, query: "", filter: "전체", formFilter: null, chatMessages: [], productsView: "info", formulationOpen: false, pageSize: 20, page: 1, calcProductId: null, calcProductSearch: "", calcCropName: null, calcVariantKey: null, calcWaterL: "", calcWaterUnit: "ℓ",
    sidebarOpen: false, adminAuthed: false, journal: [], quiz: null, quizAnswered: null, voiceOn: false, user: "" };

  function tokenizeQuery(q){
    return q.split(/[\s,、.!?？!()]+/).map(function(s){ return s.trim(); }).filter(Boolean);
  }
  function fuzzyIncludes(hay, token){
    if(!hay || !token) return false;
    if(hay.indexOf(token) !== -1) return true;
    for(var cut=1; cut<=2 && token.length-cut>=2; cut++){
      if(hay.indexOf(token.slice(0,-cut)) !== -1) return true;
    }
    return false;
  }
  function chatSearch(query){
    var tokens = tokenizeQuery(query);
    if(!tokens.length) return { weeds: [], targets: [], products: [] };
    function score(hay){
      var s = 0;
      tokens.forEach(function(t){ if(fuzzyIncludes(hay, t)) s++; });
      return s;
    }
    var weedHits = WEEDS.map(function(w){ return { item: w, score: score(w.name + " " + (w.sciName||"")) }; })
      .filter(function(x){ return x.score > 0; }).sort(function(a,b){ return b.score - a.score; });
    var targetHits = TARGET_ENTRIES.map(function(e){
      var hay = e.target + " " + e.crops.map(function(c){ return c.crop; }).join(" ");
      return { item: e, score: score(hay) };
    }).filter(function(x){ return x.score > 0; }).sort(function(a,b){ return b.score - a.score; });
    var productHits = PRODUCTS.map(function(p){ return { item: p, score: score(p.productName + " " + (p.activeIngredient||"")) }; })
      .filter(function(x){ return x.score > 0; }).sort(function(a,b){ return b.score - a.score; });
    return {
      weeds: weedHits.slice(0,3).map(function(x){ return x.item; }),
      targets: targetHits.slice(0,5).map(function(x){ return x.item; }),
      products: productHits.slice(0,3).map(function(x){ return x.item; })
    };
  }

  var CAT_ORDER = ["살균제","살충제","살균살충제","제초제","비선택성제초제","생장조정제","기타"];

  function normalizeCropName(c){
    return (c||"").replace(/\([^)]*\)/g, "").trim();
  }

  // Find every crop-name variant in the data that matches the user's query exactly
  // (e.g. query "사과" matches crop "사과", or "고추" matches "고추(단고추류 포함)")
  function findMatchingCropNames(query){
    var q = query.trim();
    if(!q) return [];
    var found = {};
    PRODUCTS.forEach(function(p){
      (p.targets||[]).forEach(function(t){
        if(!t.crop) return;
        if(t.crop === q || normalizeCropName(t.crop) === q) found[t.crop] = true;
      });
    });
    return Object.keys(found);
  }

  // Build a category-grouped "what can I use on this crop" summary
  function getCropOverview(query){
    var crops = findMatchingCropNames(query);
    if(!crops.length) return null;
    var byCat = {};
    PRODUCTS.forEach(function(p){
      var seenTargetsForThisProduct = {};
      (p.targets||[]).forEach(function(t){
        if(crops.indexOf(t.crop) === -1) return;
        if(!byCat[p.category]) byCat[p.category] = [];
        var entry = byCat[p.category].filter(function(x){ return x.product === p; })[0];
        if(!entry){ entry = { product: p, targets: [] }; byCat[p.category].push(entry); }
        if(t.target && !seenTargetsForThisProduct[t.target]){
          seenTargetsForThisProduct[t.target] = true;
          entry.targets.push(t.target);
        }
      });
    });
    var totalProducts = 0;
    Object.keys(byCat).forEach(function(c){ totalProducts += byCat[c].length; });
    if(totalProducts === 0) return null;
    return { crops: crops, byCat: byCat, total: totalProducts };
  }

  function escapeHtml(s){
    if(s == null) return "";
    return String(s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];
    });
  }

  function toast(msg){
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function(){ t.classList.remove("show"); }, 2200);
  }

  function setTab(tab){
    state.tab = tab; state.view = "list"; state.selected = null; state.query = ""; state.filter = "전체"; state.formFilter = null; state.page = 1;
    state.sidebarOpen = false;
    render();
    window.scrollTo(0,0);
  }
  function openDetail(kind, key){
    state.view = "detail"; state.selected = { kind: kind, key: key };
    state.formulationOpen = false;
    render();
    window.scrollTo(0,0);
  }
  function goBack(){
    state.view = "list"; state.selected = null;
    render();
  }

  function matchesQuery(hay, q){
    if(!q) return true;
    return hay.toLowerCase().indexOf(q.toLowerCase()) !== -1;
  }

  // ---------- RENDER: SEARCH TAB ----------
  function renderSearchList(){
    var html = "";
    html += '<div class="searchbar">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
      '<input id="searchInput" type="text" placeholder="작물, 병해충, 잡초 이름으로 검색 (예: 오이 흰가루병)" value="' + escapeHtml(state.query) + '" />' +
      '</div>';
    html += '<div class="chiprow">';
    ["전체","잡초","해충","병해"].forEach(function(f){
      html += '<button class="chip' + (state.filter===f?" active":"") + '" data-action="filter" data-val="' + f + '">' + f + '</button>';
    });
    html += '</div>';
    html += '<div id="searchResultsBody">' + renderSearchResultsBody() + '</div>';
    return html;
  }

  function renderPageSizeRow(){
    var html = '<div class="pagesize-row"><span class="pagesize-label">한 화면에</span>';
    [10, 20, 50, 100].forEach(function(n){
      html += '<button class="pagesize-btn' + (state.pageSize===n?" active":"") + '" data-action="pagesize" data-val="' + n + '">' + n + '개</button>';
    });
    html += '</div>';
    return html;
  }

  function renderPager(totalPages){
    if(totalPages <= 1) return "";
    var html = '<div class="pager">';
    html += '<button class="pager-btn" data-action="page" data-val="prev"' + (state.page<=1?" disabled":"") + '>‹ 이전</button>';
    html += '<span class="pager-info">' + state.page + ' / ' + totalPages + ' 페이지</span>';
    html += '<button class="pager-btn" data-action="page" data-val="next"' + (state.page>=totalPages?" disabled":"") + '>다음 ›</button>';
    html += '</div>';
    return html;
  }

  function renderSearchResultsBody(){
    var q = state.query;
    var filter = state.filter;
    var html = "";
    var weedResults = [];
    if(filter === "전체" || filter === "잡초"){
      WEEDS.forEach(function(w){
        var hay = w.name + " " + (w.sciName||"");
        if(matchesQuery(hay, q)) weedResults.push(w);
      });
    }
    var targetResults = [];
    if(filter !== "잡초"){
      TARGET_ENTRIES.forEach(function(e){
        if(filter !== "전체" && e.kind !== filter) return;
        var hay = e.target + " " + e.crops.map(function(c){
          return c.crop + " " + c.rows.map(function(r){ return r.product; }).join(" ");
        }).join(" ");
        if(matchesQuery(hay, q)) targetResults.push(e);
      });
    }

    var total = weedResults.length + targetResults.length;

    html += '<div class="stats-line">🌿 잡초 ' + WEEDS.length + '종 · 🐛🦠 병해충 진단 ' + TARGET_ENTRIES.length.toLocaleString() + '건 등록됨</div>';
    html += renderPageSizeRow();

    if(total === 0){
      html += (q === "" ? '<div class="section-label">전체 0건</div>' : '<div class="section-label">검색결과 0건</div>');
      html += '<div class="empty-state"><div class="big">🔍</div>다른 검색어로 시도해보세요.<br/>예: 오이, 흰가루병, 진딧물, 강아지풀</div>';
      return html;
    }

    var pageSize = state.pageSize;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    if(state.page > totalPages) state.page = totalPages;
    if(state.page < 1) state.page = 1;
    var startIdx = (state.page - 1) * pageSize;
    var endIdx = startIdx + pageSize;

    html += (q === "" ? '<div class="section-label">전체 ' + total + '건</div>' : '<div class="section-label">검색결과 ' + total + '건</div>');

    var combined = weedResults.map(function(w){ return { type: "weed", item: w }; })
      .concat(targetResults.map(function(e){ return { type: "target", item: e }; }));
    var pageItems = combined.slice(startIdx, endIdx);

    html += '<div class="card-list">';
    pageItems.forEach(function(entry){
      if(entry.type === "weed"){
        var w = entry.item;
        html += '<button class="card" data-action="open-weed" data-val="' + w.id + '">' +
          (w.photoKey && D.photos[w.photoKey] ? '<img class="thumb" src="' + D.photos[w.photoKey] + '"/>' : '<div class="thumb icon">🌿</div>') +
          '<div class="body"><div class="name">' + escapeHtml(w.name) + '</div>' +
          '<div class="meta">' + (w.sciName ? escapeHtml(w.sciName) : "잡초 · 상세정보 준비중") + '</div></div>' +
          '<div class="arrow">›</div></button>';
      } else {
        var e = entry.item;
        html += '<button class="card" data-action="open-target" data-val="' + encodeURIComponent(e.target) + '">' +
          targetThumb(e) +
          '<div class="body"><div class="name">' + escapeHtml(e.target) + '</div>' +
          '<div class="meta">' + e.cropCount + '개 작물 · 추천제품 ' + e.totalRows + '건</div></div>' +
          '<div class="arrow">›</div></button>';
      }
    });
    html += '</div>';
    html += renderPager(totalPages);
    return html;
  }

  function renderWeedDetail(id){
    var w = WEEDS.find(function(x){ return x.id === id; });
    if(!w) return '<div class="empty-state">데이터를 찾을 수 없습니다.</div>';
    var html = '';
    html += '<div class="detail-header"><button class="back-btn" data-action="back">‹</button>' +
      '<div><div class="detail-title">' + escapeHtml(w.name) + '</div>' +
      (w.sciName ? '<div class="detail-sci">' + escapeHtml(w.sciName) + '</div>' : '') + '</div></div>';
    if(D.photos[w.photoKey]) html += '<img class="hero-img" src="' + D.photos[w.photoKey] + '"/>';
    if(w.incomplete){
      html += '<div class="banner"><b>안내</b> · 이 잡초는 원본 도감 자료 파손으로 상세 설명·방제정보가 아직 등록되지 않았습니다. 자료 보완 후 업데이트될 예정입니다.</div>';
    } else {
      html += '<div class="info-card"><h3>특징</h3>' +
        '<div class="kv-row"><div class="k">과명</div><div class="v">' + escapeHtml(w.family) + '</div></div>' +
        '</div>';
      html += '<div class="info-card"><h3>생태 및 특징</h3><p>' + escapeHtml(w.description) + '</p></div>';
      if(w.control){
        var p = productByName(w.control.product);
        html += '<button class="recommend-box" data-action="open-product" data-val="' + (p?p._id:"") + '">' +
          '<div class="label">🎯 추천 방제 제품</div>' +
          '<div class="pname">' + escapeHtml(w.control.product) + '</div>' +
          '<div class="ptagline">살포일자 ' + escapeHtml(w.control.sprayDate) + ' · ' + escapeHtml(w.control.timeline.join(" → ")) + '</div>' +
          '</button>';
      }
    }
    return html;
  }

  function renderTargetDetail(key){
    var e = TARGET_ENTRIES.find(function(x){ return x.target === key; });
    if(!e) return '<div class="empty-state">데이터를 찾을 수 없습니다.</div>';
    var html = '';
    html += '<div class="detail-header"><button class="back-btn" data-action="back">‹</button>' +
      '<div><div class="detail-title">' + escapeHtml(e.target) + '</div>' +
      '<div class="detail-sci">' + e.kind + ' · ' + e.cropCount + '개 작물 · 추천제품 ' + e.totalRows + '건</div></div></div>';
    var pest = pestByName(e.target);
    if(pest){
      if(pest.photoKey && D.photos[pest.photoKey]){
        html += '<img class="hero-img" src="' + D.photos[pest.photoKey] + '"/>';
        if(pest.source) html += '<div class="pest-source">출처: ' + escapeHtml(pest.source) + '</div>';
      }
      if(pest.symptom || pest.control){
        html += '<div class="info-card">';
        if(pest.symptom) html += '<h3>🔎 피해증상</h3><p>' + escapeHtml(pest.symptom) + '</p>';
        if(pest.control) html += '<h3 style="margin-top:14px;">🛡️ 방제방법</h3><p>' + escapeHtml(pest.control) + '</p>';
        html += '</div>';
      }
    }
    html += '<div class="section-label">작물별 추천 제품</div>';
    e.crops.forEach(function(cropGroup){
      html += '<div class="crop-group-title">🌾 ' + escapeHtml(cropGroup.crop) + '<span class="crop-group-count">' + cropGroup.rows.length + '개 제품</span></div>';
      html += '<div class="card-list">';
      cropGroup.rows.forEach(function(r){
        var p = productByName(r.product);
        html += '<button class="card" data-action="open-product" data-val="' + (p?p._id:"") + '">' +
          (p ? productThumb(p) : '<div class="thumb icon" style="background:var(--sg-gray-light);color:#fff;">🧪</div>') +
          '<div class="body"><div class="name">' + escapeHtml(r.product) + '</div>' +
          '<div class="meta">' + escapeHtml(r.timing||"") + (r.dosage?(' · '+formatDosage(r)):'') + '</div></div>' +
          '<div class="arrow">›</div></button>';
      });
      html += '</div>';
    });
    return html;
  }

  // ---------- RENDER: PRODUCT CATALOG ----------
  function renderProductCategoryGrid(){
    var cats = {};
    PRODUCTS.forEach(function(p){ cats[p.category] = (cats[p.category]||0) + 1; });
    var html = '<div class="section-label">분류별로 찾기</div><div class="category-grid">';
    Object.keys(cats).forEach(function(c){
      html += '<button class="category-tile" data-action="cat" data-val="' + c + '">' +
        '<div class="dot" style="background:' + CAT_COLOR[c] + '"></div>' +
        '<div class="name">' + CAT_ICON[c] + ' ' + c + '</div>' +
        '<div class="count">' + cats[c] + '개 제품</div></button>';
    });
    html += '</div>';
    html += '<div class="section-label">전체 제품 (' + PRODUCTS.length + ')</div>';
    html += renderProductCards(PRODUCTS, state.query);
    return html;
  }

  // ---------- RENDER: FORMULATION (제형) TAB ----------
  function renderFormulationList(){
    var html = '<div class="banner formulation-banner">💊 <b>제형(劑形)</b>이란 농약이 실제로 만들어져 나오는 <b>물리적 형태</b>를 말해요. 액체, 가루, 알갱이 등 형태에 따라 희석 방법·보관법·살포 방식이 달라지니, 제품을 다루기 전에 제형부터 익혀두면 현장에서 훨씬 자신감 있게 안내할 수 있어요.</div>';
    if(state.formFilter){
      var fg = FORMULATION_BY_KEY[state.formFilter];
      var list = PRODUCTS.filter(function(p){ return p.formulationBase === state.formFilter; });
      html += '<div class="chiprow"><button class="chip active" data-action="formcat" data-val="">← 전체 제형</button></div>';
      if(fg) html += formulationCardHtml(fg);
      html += '<div class="section-label">' + escapeHtml(state.formFilter) + ' 제품 (' + list.length + ')</div>';
      html += renderProductCards(list, "");
    } else {
      html += '<div class="section-label">제형별로 찾기</div><div class="category-grid formulation-grid">';
      FORMULATION_GUIDE.forEach(function(f){
        var count = PRODUCTS.filter(function(p){ return p.formulationBase === f.key; }).length;
        if(count === 0) return;
        html += '<button class="category-tile formulation-tile" data-action="formcat" data-val="' + escapeHtml(f.key) + '">' +
          '<div class="form-tile-icon">' + formIconSvg(f.icon) + '</div>' +
          '<div class="name">' + escapeHtml(f.key) + '<span class="form-tile-abbr">(' + escapeHtml(f.abbr) + ')</span></div>' +
          '<div class="count">' + count + '개 제품</div></button>';
      });
      html += '</div>';
    }
    return html;
  }

  function productThumb(p){
    if(p.photoKey && D.photos[p.photoKey]){
      return '<img class="thumb thumb-product" src="' + D.photos[p.photoKey] + '"/>';
    }
    return '<div class="thumb icon" style="background:' + CAT_COLOR[p.category] + ';color:#fff;">' + CAT_ICON[p.category] + '</div>';
  }

  function targetThumb(e){
    var pest = pestByName(e.target);
    if(pest && pest.photoKey && D.photos[pest.photoKey]){
      return '<img class="thumb" src="' + D.photos[pest.photoKey] + '"/>';
    }
    return '<div class="thumb icon">' + (e.kind==="병해"?"🦠":"🐛") + '</div>';
  }

  function renderProductCards(list, q){
    var filtered = list.filter(function(p){
      return matchesQuery(p.productName + " " + (p.activeIngredient||""), q||"");
    });
    if(filtered.length === 0) return '<div class="empty-state"><div class="big">📦</div>해당하는 제품이 없습니다.</div>';
    var html = '<div class="card-list">';
    filtered.forEach(function(p){
      html += '<button class="card" data-action="open-product" data-val="' + p._id + '">' +
        productThumb(p) +
        '<div class="body"><div class="name">' + escapeHtml(p.productName) + (p.partial?' <span class="partial-badge">일부정보</span>':'') + '</div>' +
        '<div class="meta">' + escapeHtml(p.formulation||"") + ' · ' + escapeHtml(p.activeIngredient||"") + '</div></div>' +
        '<div class="arrow">›</div></button>';
    });
    html += '</div>';
    return html;
  }

  function renderProductsList(){
    var html = '<div class="view-toggle view-toggle-3">' +
      '<button class="' + (state.productsView==="info"?"active":"") + '" data-action="products-toggle" data-val="info">📋 제품정보</button>' +
      '<button class="' + (state.productsView==="mix"?"active":"") + '" data-action="products-toggle" data-val="mix">🧪 혼용정보</button>' +
      '<button class="' + (state.productsView==="dilution"?"active":"") + '" data-action="products-toggle" data-val="dilution">📐 희석배수표</button>' +
      '</div>';
    if(state.productsView === "dilution") return html + renderDilutionView();
    html += '<div class="searchbar">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
      '<input id="productSearchInput" type="text" placeholder="' + (state.productsView==="mix"?"혼용정보 제품명으로 검색":"제품명으로 검색") + '" value="' + escapeHtml(state.query) + '" />' +
      '</div>';
    html += '<div id="productsResultsBody">' + renderProductsResultsBody() + '</div>';
    return html;
  }

  // ---------- RENDER: 희석배수표 (DILUTION RATIO TABLE) ----------
  function parseDilutionBase(t){
    if(!t.method || t.method.indexOf("경엽처리") === -1) return null;
    if(/무인항공|무인헬기|드론|ULV/.test(t.method)) return null;
    var d = (t.dosage||"").trim();
    if(!d || d === "-") return null;
    if(/종자|볍씨|씨앗|종구|종서|상자|관주/.test(d)) return null;

    function unitOf(u){ return /ml|㎖/i.test(u) ? "㎖" : "g"; }
    function numOf(s){ return parseFloat(s.replace(/,/g, "")); }

    // strip a leading "NN배 희석, " prefix if present (e.g. "100배 희석, 200g/20L")
    d = d.replace(/^[0-9.]+\s*배\s*희석\s*,\s*/, "");

    // "NNml/물NNL" or "NNml/NNL" with optional trailing "(...)" detail
    var m1 = d.match(/^([0-9,]+(?:\.[0-9]+)?)\s*(㎖|ml|g)\s*\/\s*물?\s*([0-9,]+(?:\.[0-9]+)?)\s*(ℓ|L)(\s*\(.*\))?$/i);
    if(m1) return { amount: numOf(m1[1]), unit: unitOf(m1[2]), waterL: numOf(m1[3]) };

    // "물NNL당 NN(unit)" with optional trailing "/ 10a당 ..." detail
    var m3 = d.match(/^물\s*([0-9,]+(?:\.[0-9]+)?)\s*(ℓ|L)\s*당\s*([0-9,]+(?:\.[0-9]+)?)\s*(㎖|ml|g)(\s*\/.*)?$/i);
    if(m3) return { amount: numOf(m3[3]), unit: unitOf(m3[4]), waterL: numOf(m3[1]) };

    if(/^[0-9.]+\s*(㎖|ml|g)\s*\/\s*10a$/i.test(d)) return null;

    // plain "NN(unit)" with optional trailing "(...)" detail -> implicit 물20L basis
    var m2 = d.match(/^([0-9,]+(?:\.[0-9]+)?)\s*(㎖|ml|g)(\s*\(.*\))?$/i);
    if(m2) return { amount: numOf(m2[1]), unit: unitOf(m2[2]), waterL: 20 };

    return null;
  }

  var DILUTION_PRODUCTS = (function(){
    var list = [];
    PRODUCTS.forEach(function(p){
      var cropMap = {};
      var cropOrder = [];
      (p.targets||[]).forEach(function(t){
        var base = parseDilutionBase(t);
        if(!base) return;
        if(!cropMap[t.crop]){ cropMap[t.crop] = []; cropOrder.push(t.crop); }
        var key = base.amount + "|" + base.unit + "|" + base.waterL;
        if(!cropMap[t.crop].some(function(v){ return v.key === key; })){
          cropMap[t.crop].push({ key: key, amount: base.amount, unit: base.unit, waterL: base.waterL });
        }
      });
      var crops = cropOrder.map(function(c){ return { crop: c, variants: cropMap[c] }; })
        .sort(function(a,b){ return a.crop.localeCompare(b.crop, "ko"); });
      if(crops.length) list.push({ id: p._id, name: p.productName, crops: crops });
    });
    return list.sort(function(a,b){ return a.name.localeCompare(b.name, "ko"); });
  })();

  function renderCalcResult(entry, variant){
    if(!entry) return '<div class="calc-hint">농약을 선택하면 계산할 수 있어요.</div>';
    if(!variant) return '<div class="calc-hint">사용할 작물을 선택하세요.</div>';
    var enteredWater = parseFloat(state.calcWaterL);
    if(!enteredWater || enteredWater <= 0) return '<div class="calc-hint">물의 양을 입력하세요.</div>';
    var isMal = state.calcWaterUnit === "말";
    var waterL = isMal ? enteredWater * 20 : enteredWater;
    var amount = variant.amount * (waterL / variant.waterL);
    var amountStr = (Math.round(amount*10)/10).toLocaleString();
    var ratio = Math.round((variant.waterL*1000) / variant.amount);
    var waterLabel = isMal
      ? enteredWater.toLocaleString() + '말(' + waterL.toLocaleString() + 'ℓ)'
      : waterL.toLocaleString() + 'ℓ';
    return '<div class="calc-result">물 <b>' + waterLabel + '</b>에는 <b>' + escapeHtml(entry.name) + ' ' + amountStr + variant.unit + '</b>를 넣으세요.' +
      '<div class="calc-result-sub">기준: ' + variant.amount + variant.unit + ' / 물 ' + variant.waterL + 'ℓ (약 ' + ratio.toLocaleString() + '배 희석)</div></div>';
  }

  function renderCalcProductSuggest(){
    var q = (state.calcProductSearch||"").trim();
    var entry = state.calcProductId != null ? DILUTION_PRODUCTS.find(function(x){ return x.id === state.calcProductId; }) : null;
    if(entry && entry.name === q) return "";
    var list = q ? DILUTION_PRODUCTS.filter(function(e){ return matchesQuery(e.name, q); }) : DILUTION_PRODUCTS;
    var shown = list.slice(0, 30);
    if(!shown.length) return '<div class="calc-suggest-empty">일치하는 제품이 없어요.</div>';
    var html = '<div class="calc-suggest-list">';
    shown.forEach(function(e){
      html += '<button type="button" class="calc-suggest-item" data-action="calc-pick-product" data-val="' + e.id + '">' + escapeHtml(e.name) + '</button>';
    });
    if(list.length > shown.length) html += '<div class="calc-suggest-more">외 ' + (list.length - shown.length) + '개 · 검색어를 좁혀보세요</div>';
    html += '</div>';
    return html;
  }

  function renderCalcAfterProductBody(entry, cropGroup, variant){
    var html = "";
    if(entry){
      html += '<label class="calc-label">사용 작물 선택</label>';
      html += '<select id="calcCropSelect" class="calc-select">';
      html += '<option value="">작물을 선택하세요</option>';
      entry.crops.forEach(function(c){
        html += '<option value="' + escapeHtml(c.crop) + '"' + (cropGroup && cropGroup.crop===c.crop ? ' selected' : '') + '>' + escapeHtml(c.crop) + '</option>';
      });
      html += '</select>';
    }
    if(cropGroup && cropGroup.variants.length > 1){
      html += '<label class="calc-label">적용 사용량 선택</label>';
      html += '<select id="calcVariantSelect" class="calc-select">';
      cropGroup.variants.forEach(function(v){
        html += '<option value="' + v.key + '"' + (variant && variant.key===v.key ? ' selected' : '') + '>' +
          v.amount + v.unit + ' (물 ' + v.waterL + 'ℓ 기준)</option>';
      });
      html += '</select>';
    }
    html += '<label class="calc-label">물의 양</label>';
    html += '<div class="calc-water-row">';
    html += '<input id="calcWaterInput" type="number" min="0" step="any" class="calc-input" placeholder="' + (state.calcWaterUnit==="말" ? "예: 8" : "예: 200") + '" value="' + escapeHtml(state.calcWaterL||"") + '"/>';
    html += '<div class="calc-unit-toggle">';
    ["ℓ","말"].forEach(function(u){
      html += '<button type="button" class="calc-unit-btn' + (state.calcWaterUnit===u?" active":"") + '" data-action="calc-water-unit" data-val="' + u + '">' + u + '</button>';
    });
    html += '</div></div>';
    if(state.calcWaterUnit === "말") html += '<div class="calc-hint">💡 농사현장 기준 1말 = 20ℓ</div>';
    html += '<div id="calcResultBody">' + renderCalcResult(entry, variant) + '</div>';
    return html;
  }

  function resolveCalcSelection(){
    var entry = state.calcProductId != null ? DILUTION_PRODUCTS.find(function(x){ return x.id === state.calcProductId; }) : null;
    var cropGroup = null;
    var variant = null;
    if(entry){
      cropGroup = entry.crops.find(function(c){ return c.crop === state.calcCropName; }) || null;
      if(cropGroup){
        variant = cropGroup.variants.find(function(v){ return v.key === state.calcVariantKey; }) || cropGroup.variants[0];
        state.calcCropName = cropGroup.crop;
        state.calcVariantKey = variant.key;
      } else {
        state.calcVariantKey = null;
      }
    }
    return { entry: entry, cropGroup: cropGroup, variant: variant };
  }

  function renderDilutionCalcBody(){
    var r = resolveCalcSelection();
    var html = '<label class="calc-label">농약 선택</label>';
    html += '<div class="calc-product-picker">';
    html += '<input id="calcProductSearch" class="calc-input" type="text" autocomplete="off" placeholder="제품 이름으로 검색" value="' + escapeHtml(state.calcProductSearch||"") + '"/>';
    html += '<div id="calcProductSuggest">' + renderCalcProductSuggest() + '</div>';
    html += '</div>';
    html += '<div id="calcAfterProductBody">' + renderCalcAfterProductBody(r.entry, r.cropGroup, r.variant) + '</div>';
    return html;
  }

  function buildDilutionTable(){
    var byRatio = {};
    PRODUCTS.forEach(function(p){
      (p.targets||[]).forEach(function(t){
        if(!t.method || t.method.indexOf("경엽처리") === -1) return;
        if(/무인항공|무인헬기|드론|ULV/.test(t.method)) return;
        if(!t.dosage) return;
        var m = t.dosage.match(/^([0-9]+(?:\.[0-9]+)?)\s*(㎖|g)$/);
        if(!m) return;
        var num = parseFloat(m[1]);
        var ratio = Math.round(20000 / num);
        var label = m[1] + m[2];
        if(!byRatio[ratio]) byRatio[ratio] = {};
        byRatio[ratio][label] = true;
      });
    });
    return Object.keys(byRatio).map(function(r){ return parseInt(r, 10); })
      .sort(function(a,b){ return b - a; })
      .map(function(r){ return { ratio: r, amounts: Object.keys(byRatio[r]).sort(function(a,b){ return parseFloat(a)-parseFloat(b); }) }; });
  }

  function renderDilutionView(){
    var rows = buildDilutionTable();
    var html = '<div class="calc-card"><div class="calc-title">🧮 희석 계산기</div>' +
      '<div id="dilutionCalcBody">' + renderDilutionCalcBody() + '</div></div>';
    html += '<div class="banner">📐 <b>희석배수</b>는 물의 양을 약제 사용량으로 나눈 값이에요. 예를 들어 물 20ℓ(20,000㎖)에 약제 4㎖를 섞으면 <b>5,000배 희석</b>이 됩니다. 아래는 실제 제품 사용량 표(물 20ℓ 기준)에 자주 등장하는 값을 정리한 조견표예요.</div>';
    html += '<div class="table-scroll"><table class="target-table dilution-table"><thead><tr>' +
      '<th>사용량 (물 20ℓ 기준)</th><th>희석배수</th></tr></thead><tbody>';
    rows.forEach(function(r){
      html += '<tr><td>' + escapeHtml(r.amounts.join(' / ')) + '</td><td>' + r.ratio.toLocaleString() + '배</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<div class="dilution-note">※ 물의 양이 다르면 희석배수 = 물의 양(㎖) ÷ 사용량(㎖ 또는 g)으로 직접 계산할 수 있어요. 정확한 사용량과 살포 방법은 각 제품 상세 페이지에서 반드시 확인하세요.</div>';
    return html;
  }

  function renderProductsResultsBody(){
    if(state.productsView === "mix") return renderMixProductsBody();
    var html = "";
    if(state.filter && state.filter !== "전체"){
      var list = PRODUCTS.filter(function(p){ return p.category === state.filter; });
      html += '<div class="chiprow"><button class="chip active" data-action="cat" data-val="전체">← 전체 카테고리</button></div>';
      html += '<div class="section-label">' + CAT_ICON[state.filter] + ' ' + state.filter + ' (' + list.length + ')</div>';
      html += renderProductCards(list, state.query);
    } else if(state.query){
      html += '<div class="section-label">검색결과</div>';
      html += renderProductCards(PRODUCTS, state.query);
    } else {
      html += renderProductCategoryGrid();
    }
    return html;
  }

  // ---------- RENDER: 혼용정보 (MIXING INFO), 책자 기준 수도용/원예용 분류 ----------
  var MIX_INDEX = (function(){
    var map = {};
    MIX_BYCROP.forEach(function(m){
      map[m.baseProduct] = { name: m.baseProduct, source: "원예용" };
    });
    (D.mixingLists||[]).forEach(function(listEntry){
      (listEntry.products||[]).forEach(function(row){
        var name = row["제품명"];
        if(!name) return;
        if(!map[name]) map[name] = { name: name, source: "수도용" };
      });
    });
    return Object.keys(map).map(function(k){ return map[k]; });
  })();

  function mixCategoryCounts(){
    var counts = { "수도용": 0, "원예용": 0 };
    MIX_INDEX.forEach(function(m){ counts[m.source] = (counts[m.source]||0) + 1; });
    return counts;
  }

  function renderMixProductCards(list, q){
    var filtered = list.filter(function(m){ return matchesQuery(m.name, q||""); });
    if(filtered.length === 0) return '<div class="empty-state"><div class="big">🧪</div>해당하는 제품이 없습니다.</div>';
    var html = '<div class="card-list">';
    filtered.forEach(function(m){
      var p = productByName(m.name);
      html += '<button class="card" data-action="open-mixproduct" data-val="' + encodeURIComponent(m.name) + '">' +
        (p ? productThumb(p) : '<div class="thumb icon" style="background:var(--sg-gray-light);color:#fff;">🧪</div>') +
        '<div class="body"><div class="name">' + escapeHtml(m.name) + '</div>' +
        '<div class="meta">' + m.source + '</div></div>' +
        '<div class="arrow">›</div></button>';
    });
    html += '</div>';
    return html;
  }

  function renderMixCategoryGrid(){
    var counts = mixCategoryCounts();
    var html = '<div class="section-label">분류별로 찾기 (혼용정보 책자 기준)</div><div class="category-grid">';
    html += '<button class="category-tile" data-action="mixcat" data-val="수도용">' +
      '<div class="dot" style="background:#2f7fb8"></div><div class="name">🌾 수도용</div><div class="count">' + counts["수도용"] + '개 제품</div></button>';
    html += '<button class="category-tile" data-action="mixcat" data-val="원예용">' +
      '<div class="dot" style="background:#1b998b"></div><div class="name">🥬 원예용</div><div class="count">' + counts["원예용"] + '개 제품</div></button>';
    html += '</div>';
    html += '<div class="section-label">전체 (' + MIX_INDEX.length + ')</div>';
    html += renderMixProductCards(MIX_INDEX, state.query);
    return html;
  }

  function renderMixProductsBody(){
    var html = "";
    if(state.filter && (state.filter === "수도용" || state.filter === "원예용")){
      var list = MIX_INDEX.filter(function(m){ return m.source === state.filter; });
      html += '<div class="chiprow"><button class="chip active" data-action="mixcat" data-val="전체">← 전체 카테고리</button></div>';
      html += '<div class="section-label">' + state.filter + ' (' + list.length + ')</div>';
      html += renderMixProductCards(list, state.query);
    } else if(state.query){
      html += '<div class="section-label">검색결과</div>';
      html += renderMixProductCards(MIX_INDEX, state.query);
    } else {
      html += renderMixCategoryGrid();
    }
    return html;
  }

  function renderMixProductDetail(name){
    var p = productByName(name);
    var html = '<div class="detail-header"><button class="back-btn" data-action="back">‹</button>' +
      '<div><div class="detail-title">' + escapeHtml(name) + '</div><div class="detail-sci">혼용정보</div></div></div>';
    if(p && p.photoKey && D.photos[p.photoKey]) html += '<div class="product-hero"><img src="' + D.photos[p.photoKey] + '"/></div>';
    if(p){
      html += '<button class="recommend-box" data-action="open-product" data-val="' + p._id + '">' +
        '<div class="label">📋 제품 일반정보 보기</div><div class="pname">' + escapeHtml(name) + '</div></button>';
    }
    html += renderMixSection(name);
    return html;
  }

  var MIX_CAT_LABEL = { "살균제":"균", "살충제":"충", "살비제":"비" };
  function renderMixSection(productName){
    var m = mixByProductName(productName);
    var generic = findGenericMix(productName);
    if(!m && generic.length === 0) return "";
    var html = '<div class="info-card"><h3>🧪 혼용 가능 정보</h3>';
    if(m){
      m.byCrop.forEach(function(row){
        html += '<div class="mix-crop-block"><div class="crop-name">' + escapeHtml(row.crop) + '</div><div class="mix-pill-row">';
        ["살균제","살충제","살비제"].forEach(function(cat){
          (row[cat]||[]).forEach(function(prod){
            html += '<span class="mix-pill"><span class="mix-cat-label">' + MIX_CAT_LABEL[cat] + '</span>' + escapeHtml(prod) + '</span>';
          });
        });
        html += '</div></div>';
      });
    }
    if(generic.length){
      generic.forEach(function(g){
        html += '<div class="mix-crop-block"><div class="crop-name">' + escapeHtml(g.title) + '</div><div class="mix-pill-row">';
        ["살균제","살충제"].forEach(function(cat){
          (g.self[cat]||[]).forEach(function(prod){
            html += '<span class="mix-pill"><span class="mix-cat-label">' + MIX_CAT_LABEL[cat] + '</span>' + escapeHtml(prod) + '</span>';
          });
        });
        html += '</div></div>';
      });
    }
    html += '</div>';
    return html;
  }

  function renderProductDetail(id){
    var p = PRODUCTS[id];
    if(!p) return '<div class="empty-state">데이터를 찾을 수 없습니다.</div>';
    var html = '';
    html += '<div class="detail-header"><button class="back-btn" data-action="back">‹</button>' +
      '<div><div class="detail-title">' + escapeHtml(p.productName) + '</div>' +
      '<div class="detail-sci">' + escapeHtml(p.formulation||"") + '</div></div></div>';
    if(p.photoKey && D.photos[p.photoKey]){
      html += '<div class="product-hero"><img src="' + D.photos[p.photoKey] + '"/></div>';
    }
    html += '<span class="tag" style="background:' + CAT_COLOR[p.category] + '">' + CAT_ICON[p.category] + ' ' + p.category + '</span>';
    var fg = p.formulationBase ? FORMULATION_BY_KEY[p.formulationBase] : null;
    if(fg){
      html += ' <button class="tag formulation-tag" data-action="toggle-formulation">' +
        '<span class="form-tag-icon">' + formIconSvg(fg.icon) + '</span>' + escapeHtml(fg.key) +
        '<span class="form-tag-caret">' + (state.formulationOpen ? '▲' : '▼') + '</span></button>';
    }
    if(p.partial) html += '<span class="partial-badge" style="margin-left:6px;">일부 정보만 등록 (' + escapeHtml(p.sourceNote||"") + ')</span>';
    if(fg && state.formulationOpen) html += formulationCardHtml(fg);
    html += '<div style="height:12px"></div>';
    html += '<div class="info-card"><h3>기본 정보</h3>' +
      '<div class="kv-row"><div class="k">일반명</div><div class="v">' + escapeHtml(p.activeIngredient||"-") + '</div></div>' +
      '<div class="kv-row"><div class="k">계통</div><div class="v">' + escapeHtml(p.ingredientClass||"-") + '</div></div>' +
      '<div class="kv-row"><div class="k">포장단위</div><div class="v">' + escapeHtml(p.packaging||"-") + '</div></div>' +
      '</div>';
    if(p.features && p.features.length){
      html += '<div class="info-card"><h3>제품 특징</h3><ul class="feature-list">' +
        p.features.map(function(f){ return '<li>' + escapeHtml(f) + '</li>'; }).join('') + '</ul></div>';
    }
    if(p.targets && p.targets.length){
      html += '<div class="section-label">적용대상 및 사용량 (' + p.targets.length + ')</div>';
      html += '<div class="table-scroll"><table class="target-table"><thead><tr>' +
        '<th>작물</th><th>병해충/용도</th><th>사용적기</th><th>사용방법</th><th>사용량</th><th>비고</th></tr></thead><tbody>';
      p.targets.forEach(function(t){
        html += '<tr><td>' + escapeHtml(t.crop) + '</td><td>' + escapeHtml(t.target) + '</td>' +
          '<td>' + escapeHtml(t.timing||"") + '</td><td>' + escapeHtml(t.method||"") + '</td>' +
          '<td>' + formatDosage(t) + '</td><td>' + escapeHtml(t.notes||"") + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }
    if(mixByProductName(p.productName) || findGenericMix(p.productName).length){
      html += '<button class="recommend-box" data-action="open-mixproduct" data-val="' + encodeURIComponent(p.productName) + '">' +
        '<div class="label">🧪 혼용정보 보기</div><div class="pname">이 제품과 함께 쓸 수 있는 약제 확인</div></button>';
    }
    return html;
  }

  // ---------- RENDER: PHOTO TAB ----------
  function renderPhotoView(){
    return '<div class="banner"><b>준비 중인 기능</b> · 사진을 업로드하면 AI가 병해충·잡초를 자동으로 분석하는 기능은 현재 준비 중입니다. 지금은 <b>검색진단</b> 탭에서 이름으로 찾아주세요.</div>' +
      '<div class="photo-drop">' +
      '<div class="icon">📷</div>' +
      '<div>사진을 여기에 끌어다 놓거나<br/>탭하여 업로드하세요</div>' +
      '<button data-action="photo-coming-soon">사진으로 진단하기</button>' +
      '</div>';
  }

  // ---------- RENDER: CHATBOT ----------
  var CHAT_SUGGESTIONS = ["사과", "고추 흰가루병", "오이 총채벌레", "배 진딧물", "강아지풀 방제"];

  function renderChatResultCard(kind, item){
    if(kind === "weed"){
      return '<button class="card" data-action="open-weed" data-val="' + item.id + '">' +
        (item.photoKey && D.photos[item.photoKey] ? '<img class="thumb" src="' + D.photos[item.photoKey] + '"/>' : '<div class="thumb icon">🌿</div>') +
        '<div class="body"><div class="name">' + escapeHtml(item.name) + '</div>' +
        '<div class="meta">' + (item.sciName ? escapeHtml(item.sciName) : "잡초") + '</div></div>' +
        '<div class="arrow">›</div></button>';
    }
    if(kind === "target"){
      return '<button class="card" data-action="open-target" data-val="' + encodeURIComponent(item.target) + '">' +
        targetThumb(item) +
        '<div class="body"><div class="name">' + escapeHtml(item.target) + '</div>' +
        '<div class="meta">' + item.cropCount + '개 작물 · 추천제품 ' + item.totalRows + '건</div></div>' +
        '<div class="arrow">›</div></button>';
    }
    if(kind === "product"){
      return '<button class="card" data-action="open-product" data-val="' + item._id + '">' +
        productThumb(item) +
        '<div class="body"><div class="name">' + escapeHtml(item.productName) + '</div>' +
        '<div class="meta">' + escapeHtml(item.formulation||"") + '</div></div>' +
        '<div class="arrow">›</div></button>';
    }
    return "";
  }

  function renderCropOverview(ov){
    var html = '<div class="crop-overview">';
    CAT_ORDER.forEach(function(cat){
      var list = ov.byCat[cat];
      if(!list || !list.length) return;
      html += '<div class="crop-cat-block">';
      html += '<div class="crop-cat-title"><span class="tag" style="background:' + CAT_COLOR[cat] + '">' + CAT_ICON[cat] + ' ' + cat + '</span> <span class="crop-cat-count">' + list.length + '개 제품</span></div>';
      html += '<div class="card-list">';
      list.forEach(function(item){
        var p = item.product;
        var targetPreview = item.targets.slice(0,3).join(", ") + (item.targets.length > 3 ? " 외 " + (item.targets.length - 3) + "건" : "");
        html += '<button class="card" data-action="open-product" data-val="' + p._id + '">' +
          productThumb(p) +
          '<div class="body"><div class="name">' + escapeHtml(p.productName) + '</div>' +
          '<div class="meta">' + escapeHtml(targetPreview) + '</div></div>' +
          '<div class="arrow">›</div></button>';
      });
      html += '</div></div>';
    });
    html += '</div>';
    return html;
  }

  function renderChatView(){
    var html = '<div class="chat-scroll" id="chatScroll">';
    if(state.chatMessages.length === 0){
      html += '<div class="chat-welcome">' +
        '<div class="chat-welcome-icon">💬</div>' +
        '<div class="chat-welcome-title">SG 한팀장</div>' +
        '<div class="chat-welcome-badge">🌱 SG 한국삼공 병해충 챗봇</div>' +
        '<div class="chat-welcome-sub">작물과 증상을 자유롭게 입력해보세요.<br/>예: "고추에 흰가루병 생겼는데 뭐 써야돼?"</div>' +
        '<div class="chiprow" style="justify-content:center;flex-wrap:wrap;">' +
        CHAT_SUGGESTIONS.map(function(s){ return '<button class="chip" data-action="chat-suggest" data-val="' + escapeHtml(s) + '">' + escapeHtml(s) + '</button>'; }).join('') +
        '</div></div>';
    } else {
      state.chatMessages.forEach(function(m){
        if(m.role === "user"){
          html += '<div class="bubble-row user"><div class="bubble user">' + escapeHtml(m.text) + '</div></div>';
        } else {
          html += '<div class="bot-name-tag">한팀장</div>' +
            '<div class="bubble-row bot"><div class="bubble bot">' + escapeHtml(m.text) + '</div></div>';
          if(m.cropOverview){
            html += renderCropOverview(m.cropOverview);
          } else if(m.results){
            var r = m.results;
            if(r.weeds.length || r.targets.length || r.products.length){
              html += '<div class="chat-results">';
              r.weeds.forEach(function(w){ html += renderChatResultCard("weed", w); });
              r.targets.forEach(function(t){ html += renderChatResultCard("target", t); });
              r.products.forEach(function(p){ html += renderChatResultCard("product", p); });
              html += '</div>';
            }
          }
        }
      });
    }
    html += '</div>';
    html += '<div class="chat-tools">' +
      (voiceSupported() ? '<button class="chat-tool-btn" id="micBtn" data-action="voice-input" title="음성으로 질문">🎤 음성 질문</button>' : '<span class="chat-tool-note">이 브라우저는 음성 입력 미지원 (크롬/엣지 권장)</span>') +
      (ttsSupported() ? '<button class="chat-tool-btn' + (state.voiceOn?" on":"") + '" data-action="voice-toggle" title="답변 읽어주기">' + (state.voiceOn?"🔊 읽어주기 켜짐":"🔈 읽어주기 꺼짐") + '</button>' : '') +
      (state.chatMessages.length ? '<button class="chat-tool-btn" data-action="chat-clear">🗑️ 대화 지우기</button>' : '') +
      '</div>';
    html += '<form class="chat-input-row" id="chatForm">' +
      '<input id="chatInput" type="text" enterkeyhint="send" placeholder="예: 오이 흰가루병" autocomplete="off"/>' +
      '<button type="submit" id="chatSendBtn">보내기</button>' +
      '</form>';
    return html;
  }

  function submitChat(text){
    text = (text||"").trim();
    if(!text) return;
    state.chatMessages.push({ role: "user", text: text });

    var cropOverview = getCropOverview(text);
    if(cropOverview){
      var catList = CAT_ORDER.filter(function(c){ return cropOverview.byCat[c] && cropOverview.byCat[c].length; });
      var botText1 = '"' + text + '" 작물에 사용 가능한 제품을 분류별로 정리했어요 (총 ' + cropOverview.total + '개) 👇';
      state.chatMessages.push({ role: "bot", text: botText1, cropOverview: cropOverview, q: text, kind: "crop" });
      var journalSummary = catList.map(function(c){
        return c + " " + cropOverview.byCat[c].length + "개(" + cropOverview.byCat[c].slice(0,3).map(function(x){ return x.product.productName; }).join(", ") + ")";
      }).join(" / ");
      addJournalEntry(text, "사용 가능 제품 " + cropOverview.total + "개 — " + journalSummary);
      saveChat();
      speak(botText1);
      render();
      var scroller1 = document.getElementById("chatScroll");
      if(scroller1) scroller1.scrollTop = scroller1.scrollHeight;
      return;
    }

    var results = chatSearch(text);
    var total = results.weeds.length + results.targets.length + results.products.length;
    var botText = total > 0
      ? '"' + text + '" 관련해서 이런 정보를 찾았어요 👇'
      : '음... "' + text + '"에 대한 정보를 찾지 못했어요. 작물명이나 병해충·잡초 이름을 다르게 표현해서 다시 물어봐 주세요.';
    state.chatMessages.push({ role: "bot", text: botText, results: results, q: text, kind: "search" });

    var jParts = [];
    results.targets.forEach(function(t){ jParts.push("병해충 " + t.target + "(" + t.cropCount + "개 작물)"); });
    results.weeds.forEach(function(w){ jParts.push("잡초 " + w.name); });
    results.products.forEach(function(p){ jParts.push("제품 " + p.productName); });
    addJournalEntry(text, jParts.length ? jParts.join(" / ") : "검색 결과 없음");
    saveChat();

    var spoken = botText;
    if(results.targets.length){
      var t0 = results.targets[0];
      var firstProd = t0.crops[0] && t0.crops[0].rows[0] ? t0.crops[0].rows[0].product : null;
      if(firstProd) spoken = t0.target + "에는 " + firstProd + " 등을 사용할 수 있습니다. 자세한 내용은 화면을 확인하세요.";
    }
    speak(spoken);

    render();
    var scroller = document.getElementById("chatScroll");
    if(scroller) scroller.scrollTop = scroller.scrollHeight;
  }

  // ---------- MAIN RENDER ----------
  // ---------- VOICE (Web Speech API, 브라우저 내장 · 외부 전송 없음) ----------
  var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recognizer = null;
  function voiceSupported(){ return !!SpeechRec; }
  function ttsSupported(){ return !!window.speechSynthesis; }

  function speak(text){
    if(!ttsSupported() || !state.voiceOn || !text) return;
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = "ko-KR"; u.rate = 1.0;
      window.speechSynthesis.speak(u);
    } catch(e){}
  }

  function startVoiceInput(){
    if(!voiceSupported()){ toast("이 브라우저는 음성 인식을 지원하지 않아요 (크롬/엣지 권장)"); return; }
    if(recognizer){ try{ recognizer.stop(); }catch(e){} recognizer = null; return; }
    try {
      recognizer = new SpeechRec();
      recognizer.lang = "ko-KR";
      recognizer.interimResults = false;
      recognizer.maxAlternatives = 1;
      var btn = document.getElementById("micBtn");
      if(btn) btn.classList.add("listening");
      recognizer.onresult = function(ev){
        var said = ev.results[0][0].transcript;
        var ci = document.getElementById("chatInput");
        if(ci) ci.value = said;
        submitChat(said);
      };
      recognizer.onerror = function(ev){
        if(ev.error === "not-allowed") toast("마이크 권한이 필요합니다");
        else if(ev.error !== "aborted") toast("음성 인식에 실패했어요. 다시 시도해주세요");
      };
      recognizer.onend = function(){
        recognizer = null;
        var b = document.getElementById("micBtn");
        if(b) b.classList.remove("listening");
      };
      recognizer.start();
      toast("🎤 듣고 있어요… 말씀하세요");
    } catch(e){ toast("음성 인식을 시작할 수 없어요"); recognizer = null; }
  }

  // ---------- 업무일지 (JOURNAL) ----------
  function addJournalEntry(question, answer){
    state.journal.unshift({ id: Date.now() + "_" + Math.floor(Math.random()*1e6), ts: nowStamp(), q: question, a: answer, memo: "" });
    if(state.journal.length > 500) state.journal.length = 500;
    saveJournal(state.journal);
  }

  function journalPlainText(){
    if(!state.journal.length) return "";
    return state.journal.map(function(e){
      return "[" + e.ts + "]\n문의: " + e.q + "\n답변: " + e.a + (e.memo ? "\n메모: " + e.memo : "") + "\n";
    }).join("\n");
  }

  function renderJournalView(){
    var html = '<div class="banner">📝 <b>업무일지</b>는 한팀장에게 물어본 내용이 자동으로 기록되는 공간이에요. 이동 중 음성으로 물어본 내용도 그대로 남으니, 복귀 후 메모만 덧붙여 정리하면 됩니다. <b>기록은 이 기기에만 저장</b>되며 외부로 전송되지 않습니다.</div>';
    if(!state.journal.length){
      return html + '<div class="empty-state"><div class="big">📝</div>아직 기록이 없어요.<br/>한팀장 탭에서 질문하면 자동으로 쌓입니다.</div>';
    }
    html += '<div class="journal-toolbar">' +
      '<span class="journal-count">총 ' + state.journal.length + '건</span>' +
      '<button class="journal-btn" data-action="journal-copy">📋 전체 복사</button>' +
      '<button class="journal-btn danger" data-action="journal-clear">전체 삭제</button>' +
      '</div>';
    state.journal.forEach(function(e){
      html += '<div class="journal-item">' +
        '<div class="journal-ts">' + escapeHtml(e.ts) + '</div>' +
        '<div class="journal-q">Q. ' + escapeHtml(e.q) + '</div>' +
        '<div class="journal-a">' + escapeHtml(e.a) + '</div>' +
        '<textarea class="journal-memo" data-jid="' + e.id + '" rows="2" placeholder="메모 추가 (거래처, 후속조치 등)">' + escapeHtml(e.memo||"") + '</textarea>' +
        '<button class="journal-del" data-action="journal-del" data-val="' + e.id + '">삭제</button>' +
        '</div>';
    });
    return html;
  }

  // ---------- 퀴즈 (QUIZ) ----------
  function pickRandom(arr, n){
    var copy = arr.slice();
    var out = [];
    while(copy.length && out.length < n) out.push(copy.splice(Math.floor(Math.random()*copy.length), 1)[0]);
    return out;
  }

  function buildQuiz(){
    var kinds = ["target", "formulation", "category"];
    for(var attempt = 0; attempt < 12; attempt++){
      var kind = kinds[Math.floor(Math.random()*kinds.length)];

      if(kind === "target"){
        var pool = TARGET_ENTRIES.filter(function(e){ return e.crops.length && e.totalRows >= 1; });
        var e2 = pickRandom(pool, 1)[0];
        if(!e2) continue;
        var cg = pickRandom(e2.crops, 1)[0];
        var correct = cg.rows[0].product;
        var wrongPool = PRODUCTS.filter(function(p){
          return p.productName !== correct && !(p.targets||[]).some(function(t){ return t.target === e2.target; });
        }).map(function(p){ return p.productName; });
        var wrongs = pickRandom(wrongPool, 3);
        if(wrongs.length < 3) continue;
        return {
          q: '"' + cg.crop + '"의 <b>' + escapeHtml(e2.target) + '</b>에 사용할 수 있는 제품은?',
          options: pickRandom([correct].concat(wrongs), 4),
          answer: correct,
          why: cg.crop + "의 " + e2.target + " 방제에는 " + correct + "을(를) 사용합니다."
        };
      }

      if(kind === "formulation"){
        var withForm = PRODUCTS.filter(function(p){ return p.formulationBase; });
        var p2 = pickRandom(withForm, 1)[0];
        if(!p2) continue;
        var correctF = p2.formulationBase;
        var wrongF = pickRandom(FORMULATION_GUIDE.filter(function(f){ return f.key !== correctF; }).map(function(f){ return f.key; }), 3);
        if(wrongF.length < 3) continue;
        return {
          q: '<b>' + escapeHtml(p2.productName) + '</b>의 제형은 무엇일까요?',
          options: pickRandom([correctF].concat(wrongF), 4),
          answer: correctF,
          why: p2.productName + "은(는) " + correctF + " 제형입니다." + (FORMULATION_BY_KEY[correctF] ? " " + FORMULATION_BY_KEY[correctF].form : "")
        };
      }

      var p3 = pickRandom(PRODUCTS, 1)[0];
      if(!p3 || !p3.category) continue;
      var wrongC = pickRandom(CAT_ORDER.filter(function(c){ return c !== p3.category; }), 3);
      if(wrongC.length < 3) continue;
      return {
        q: '<b>' + escapeHtml(p3.productName) + '</b>은(는) 어떤 분류의 약제일까요?',
        options: pickRandom([p3.category].concat(wrongC), 4),
        answer: p3.category,
        why: p3.productName + "은(는) " + p3.category + "입니다." + (p3.activeIngredient ? " (주성분: " + p3.activeIngredient + ")" : "")
      };
    }
    return null;
  }

  function getQuizStat(){
    try { return JSON.parse(lsGet(uKey(LS.quizStat), '{"correct":0,"total":0}')); }
    catch(e){ return {correct:0, total:0}; }
  }
  function bumpQuizStat(isCorrect){
    var s = getQuizStat();
    s.total = (s.total||0) + 1;
    if(isCorrect) s.correct = (s.correct||0) + 1;
    lsSet(uKey(LS.quizStat), JSON.stringify(s));
  }

  function renderQuizView(){
    var stat = getQuizStat();
    var rate = stat.total ? Math.round((stat.correct/stat.total)*100) : 0;
    var html = '<div class="banner">🎯 <b>역량 퀴즈</b>는 앱에 등록된 실제 제품·병해충 데이터에서 자동으로 출제됩니다. 인사평가와는 무관하며, 스스로 부족한 부분을 확인하는 학습용입니다.</div>';
    html += '<div class="quiz-stat">누적 ' + (stat.total||0) + '문제 · 정답 ' + (stat.correct||0) + '개 · 정답률 <b>' + rate + '%</b></div>';

    if(!state.quiz){
      html += '<div class="quiz-card"><div class="quiz-empty">준비되면 시작해보세요.</div>' +
        '<button class="quiz-next-btn" data-action="quiz-new">퀴즈 시작하기</button></div>';
      return html;
    }

    var q = state.quiz;
    html += '<div class="quiz-card"><div class="quiz-q">' + q.q + '</div><div class="quiz-options">';
    q.options.forEach(function(opt){
      var cls = "quiz-opt";
      if(state.quizAnswered){
        if(opt === q.answer) cls += " correct";
        else if(opt === state.quizAnswered) cls += " wrong";
      }
      html += '<button class="' + cls + '" data-action="quiz-answer" data-val="' + escapeHtml(opt) + '"' +
        (state.quizAnswered ? ' disabled' : '') + '>' + escapeHtml(opt) + '</button>';
    });
    html += '</div>';
    if(state.quizAnswered){
      var ok = state.quizAnswered === q.answer;
      html += '<div class="quiz-feedback ' + (ok?"ok":"no") + '">' + (ok ? "✅ 정답입니다!" : "❌ 아쉬워요. 정답은 " + escapeHtml(q.answer)) + '</div>';
      html += '<div class="quiz-why">' + escapeHtml(q.why) + '</div>';
      html += '<button class="quiz-next-btn" data-action="quiz-new">다음 문제 →</button>';
    }
    html += '</div>';
    return html;
  }

  // ---------- 관리자 설정 (ADMIN) ----------
  function renderAdminBody(){
    if(!state.adminAuthed){
      return '<div class="admin-hint">관리자 비밀번호를 입력하세요.</div>' +
        '<input id="adminPwInput" class="calc-input" type="password" placeholder="관리자 비밀번호" autocomplete="off"/>' +
        '<div class="admin-error" id="adminError"></div>' +
        '<div class="modal-actions">' +
        '<button class="modal-btn" data-action="close-admin">닫기</button>' +
        '<button class="modal-btn primary" data-action="admin-login">확인</button>' +
        '</div>';
    }
    return '<div class="admin-hint">현재 인증코드: <b>' + escapeHtml(getAccessCode()) + '</b></div>' +
      '<label class="calc-label">새 인증코드</label>' +
      '<input id="newCodeInput" class="calc-input" type="text" placeholder="예: SG2026" autocomplete="off"/>' +
      '<label class="calc-label">새 관리자 비밀번호 (변경 시에만 입력)</label>' +
      '<input id="newAdminPwInput" class="calc-input" type="password" placeholder="비워두면 변경 안 함" autocomplete="off"/>' +
      '<div class="admin-error" id="adminError"></div>' +
      '<div class="admin-warn">⚠️ 이 앱은 정적 웹페이지라 인증코드가 페이지 소스에 남습니다. 외부 완전 차단용이 아니라 <b>사내 공유 관문</b>으로만 사용하세요. 또한 설정은 이 브라우저에만 저장되므로, 배포본의 기본 코드를 바꾸려면 재배포가 필요합니다.</div>' +
      '<div class="modal-actions">' +
      '<button class="modal-btn" data-action="close-admin">닫기</button>' +
      '<button class="modal-btn primary" data-action="admin-save">저장</button>' +
      '</div>';
  }

  function openAdmin(){
    state.adminAuthed = false;
    document.getElementById("adminBody").innerHTML = renderAdminBody();
    document.getElementById("adminModal").classList.remove("hidden");
  }
  function closeAdmin(){
    document.getElementById("adminModal").classList.add("hidden");
  }

  var NAV_ITEMS = [
    {id:"search", icon:"🔍", label:"검색진단", desc:"병해충·잡초 찾기"},
    {id:"chat", icon:"💬", label:"한팀장", desc:"음성/대화 상담"},
    {id:"journal", icon:"📝", label:"업무일지", desc:"질문 자동기록"},
    {id:"quiz", icon:"🎯", label:"역량퀴즈", desc:"학습 자가진단"},
    {id:"products", icon:"🧴", label:"제품정보", desc:"제품·혼용·희석"},
    {id:"formulation", icon:"💊", label:"제형", desc:"제형별 특징"},
    {id:"photo", icon:"📷", label:"사진진단", desc:"준비 중"}
  ];

  function render(){
    var navHtml = NAV_ITEMS.map(function(t){
      return '<button class="nav-item' + (state.tab===t.id?" active":"") + '" data-action="tab" data-val="' + t.id + '">' +
        '<span class="nav-icon">' + t.icon + '</span>' +
        '<span class="nav-text"><span class="nav-label">' + t.label + '</span>' +
        '<span class="nav-desc">' + t.desc + '</span></span></button>';
    }).join('');
    document.getElementById("sidebarNav").innerHTML = navHtml;

    var uName = state.user || "";
    document.getElementById("sidebarFooter").innerHTML =
      (uName
        ? '<div class="sidebar-user"><span class="user-avatar">' + escapeHtml(uName.slice(0,1)) + '</span>' +
          '<span class="sidebar-user-name">' + escapeHtml(uName) + '</span>' +
          '<button class="sidebar-user-switch" data-action="switch-user">변경</button></div>'
        : '') +
      '<button class="sidebar-admin-btn" data-action="open-admin">⚙️ 관리자 설정</button>';

    var cur = NAV_ITEMS.find(function(t){ return t.id === state.tab; });
    var ht = document.getElementById("headerTitle");
    if(ht && cur) ht.textContent = cur.icon + " " + cur.label;

    document.getElementById("sidebar").classList.toggle("open", !!state.sidebarOpen);
    document.getElementById("sidebarBackdrop").classList.toggle("show", !!state.sidebarOpen);

    var body = "";
    if(state.view === "detail"){
      if(state.selected.kind === "weed") body = renderWeedDetail(state.selected.key);
      else if(state.selected.kind === "target") body = renderTargetDetail(decodeURIComponent(state.selected.key));
      else if(state.selected.kind === "product") body = renderProductDetail(state.selected.key);
      else if(state.selected.kind === "mixproduct") body = renderMixProductDetail(decodeURIComponent(state.selected.key));
    } else {
      if(state.tab === "search") body = renderSearchList();
      else if(state.tab === "chat") body = renderChatView();
      else if(state.tab === "photo") body = renderPhotoView();
      else if(state.tab === "products") body = renderProductsList();
      else if(state.tab === "formulation") body = renderFormulationList();
      else if(state.tab === "journal") body = renderJournalView();
      else if(state.tab === "quiz") body = renderQuizView();
    }
    document.getElementById("view").innerHTML = body;

    var input = document.getElementById("searchInput") || document.getElementById("productSearchInput");
    if(input){
      input.focus();
      var val = input.value;
      input.value = "";
      input.value = val;
    }
    if(state.tab === "chat" && state.view !== "detail"){
      var chatInput = document.getElementById("chatInput");
      if(chatInput) chatInput.focus();
      var scroller = document.getElementById("chatScroll");
      if(scroller) scroller.scrollTop = scroller.scrollHeight;
    }
  }

  document.addEventListener("click", function(ev){
    var el = ev.target.closest("[data-action]");
    if(!el) return;
    var action = el.dataset.action;
    var val = el.dataset.val;
    if(action === "tab") setTab(val);
    else if(action === "filter"){ state.filter = val; state.page = 1; render(); }
    else if(action === "pagesize"){
      state.pageSize = parseInt(val, 10); state.page = 1;
      var body1 = document.getElementById("searchResultsBody");
      if(body1) body1.innerHTML = renderSearchResultsBody(); else render();
    }
    else if(action === "page"){
      if(val === "prev") state.page = Math.max(1, state.page - 1);
      else if(val === "next") state.page = state.page + 1;
      var body2 = document.getElementById("searchResultsBody");
      if(body2) body2.innerHTML = renderSearchResultsBody(); else render();
      window.scrollTo(0, 0);
    }
    else if(action === "cat"){ state.filter = (val==="전체")?"전체":val; state.formFilter = null; state.query=""; render(); }
    else if(action === "mixcat"){ state.filter = (val==="전체")?"전체":val; state.query=""; render(); }
    else if(action === "formcat"){ state.formFilter = val ? val : null; state.filter = "전체"; state.query=""; render(); }
    else if(action === "products-toggle"){ state.productsView = val; state.filter = "전체"; state.formFilter = null; state.query = ""; render(); }
    else if(action === "open-weed") openDetail("weed", val);
    else if(action === "open-target") openDetail("target", val);
    else if(action === "open-product") openDetail("product", parseInt(val,10));
    else if(action === "open-mixproduct") openDetail("mixproduct", val);
    else if(action === "back") goBack();
    else if(action === "toggle-formulation"){ state.formulationOpen = !state.formulationOpen; render(); }
    else if(action === "photo-coming-soon") toast("🙏 AI 사진 진단 기능은 준비 중입니다");
    else if(action === "chat-suggest") submitChat(val);
    else if(action === "toggle-sidebar"){ state.sidebarOpen = !state.sidebarOpen; render(); }
    else if(action === "close-sidebar"){ state.sidebarOpen = false; render(); }
    else if(action === "open-admin") openAdmin();
    else if(action === "close-admin") closeAdmin();
    else if(action === "admin-login"){
      var pwEl = document.getElementById("adminPwInput");
      if(pwEl && pwEl.value === getAdminPw()){
        state.adminAuthed = true;
        document.getElementById("adminBody").innerHTML = renderAdminBody();
      } else {
        var errEl = document.getElementById("adminError");
        if(errEl) errEl.textContent = "비밀번호가 올바르지 않습니다.";
      }
    }
    else if(action === "admin-save"){
      var codeEl = document.getElementById("newCodeInput");
      var newPwEl = document.getElementById("newAdminPwInput");
      var errEl2 = document.getElementById("adminError");
      var newCode = codeEl ? codeEl.value.trim() : "";
      if(!newCode){ if(errEl2) errEl2.textContent = "새 인증코드를 입력하세요."; return; }
      lsSet(LS.code, newCode);
      if(newPwEl && newPwEl.value.trim()) lsSet(LS.admin, newPwEl.value.trim());
      closeAdmin();
      toast("✅ 인증코드가 변경되었습니다");
    }
    else if(action === "chat-clear"){
      if(window.confirm("이 사용자의 대화내용을 지울까요? 업무일지는 그대로 남습니다.")){
        state.chatMessages = []; saveChat(); render();
      }
    }
    else if(action === "voice-input") startVoiceInput();
    else if(action === "voice-toggle"){
      state.voiceOn = !state.voiceOn;
      if(!state.voiceOn && ttsSupported()) window.speechSynthesis.cancel();
      render();
    }
    else if(action === "journal-copy"){
      var txt = journalPlainText();
      if(!txt){ toast("복사할 기록이 없어요"); return; }
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(txt).then(function(){ toast("📋 업무일지를 복사했어요"); },
          function(){ toast("복사에 실패했어요"); });
      } else { toast("이 브라우저는 복사를 지원하지 않아요"); }
    }
    else if(action === "journal-clear"){
      if(window.confirm("업무일지를 전부 삭제할까요? 되돌릴 수 없습니다.")){
        state.journal = []; saveJournal(state.journal); render();
        toast("업무일지를 비웠습니다");
      }
    }
    else if(action === "journal-del"){
      state.journal = state.journal.filter(function(e){ return e.id !== val; });
      saveJournal(state.journal); render();
    }
    else if(action === "quiz-new"){
      state.quiz = buildQuiz(); state.quizAnswered = null; render();
      if(!state.quiz) toast("퀴즈를 만들 데이터가 부족해요");
    }
    else if(action === "quiz-answer"){
      if(state.quizAnswered) return;
      state.quizAnswered = val;
      bumpQuizStat(val === state.quiz.answer);
      render();
    }
    else if(action === "calc-water-unit"){
      state.calcWaterUnit = val;
      var r5 = resolveCalcSelection();
      var afterBody5 = document.getElementById("calcAfterProductBody");
      if(afterBody5) afterBody5.innerHTML = renderCalcAfterProductBody(r5.entry, r5.cropGroup, r5.variant);
    }
    else if(action === "calc-pick-product"){
      var picked = DILUTION_PRODUCTS.find(function(x){ return x.id === parseInt(val, 10); });
      state.calcProductId = picked ? picked.id : null;
      state.calcProductSearch = picked ? picked.name : "";
      state.calcCropName = null;
      state.calcVariantKey = null;
      var pbody = document.getElementById("dilutionCalcBody");
      if(pbody) pbody.innerHTML = renderDilutionCalcBody();
    }
  });

  document.addEventListener("change", function(ev){
    if(ev.target.id === "calcCropSelect"){
      state.calcCropName = ev.target.value || null;
      state.calcVariantKey = null;
      var r1 = resolveCalcSelection();
      var afterBody1 = document.getElementById("calcAfterProductBody");
      if(afterBody1) afterBody1.innerHTML = renderCalcAfterProductBody(r1.entry, r1.cropGroup, r1.variant);
    } else if(ev.target.id === "calcVariantSelect"){
      state.calcVariantKey = ev.target.value;
      var r2 = resolveCalcSelection();
      var afterBody2 = document.getElementById("calcAfterProductBody");
      if(afterBody2) afterBody2.innerHTML = renderCalcAfterProductBody(r2.entry, r2.cropGroup, r2.variant);
    }
  });

  document.addEventListener("submit", function(ev){
    if(ev.target && ev.target.id === "chatForm"){
      ev.preventDefault();
      var ci = document.getElementById("chatInput");
      if(ci){ submitChat(ci.value); ci.value = ""; }
    }
  });

  document.addEventListener("input", function(ev){
    if(ev.target.id === "searchInput"){
      state.query = ev.target.value;
      state.page = 1;
      document.getElementById("searchResultsBody").innerHTML = renderSearchResultsBody();
    } else if(ev.target.id === "productSearchInput"){
      state.query = ev.target.value;
      document.getElementById("productsResultsBody").innerHTML = renderProductsResultsBody();
    } else if(ev.target.id === "calcWaterInput"){
      state.calcWaterL = ev.target.value;
      var r3 = resolveCalcSelection();
      var resultBody = document.getElementById("calcResultBody");
      if(resultBody) resultBody.innerHTML = renderCalcResult(r3.entry, r3.variant);
    } else if(ev.target.id === "calcProductSearch"){
      state.calcProductSearch = ev.target.value;
      var curEntry = state.calcProductId != null ? DILUTION_PRODUCTS.find(function(x){ return x.id === state.calcProductId; }) : null;
      if(curEntry && curEntry.name !== state.calcProductSearch){
        state.calcProductId = null;
        state.calcCropName = null;
        state.calcVariantKey = null;
      }
      var suggestBody = document.getElementById("calcProductSuggest");
      if(suggestBody) suggestBody.innerHTML = renderCalcProductSuggest();
      var afterBody3 = document.getElementById("calcAfterProductBody");
      if(afterBody3){
        var r4 = resolveCalcSelection();
        afterBody3.innerHTML = renderCalcAfterProductBody(r4.entry, r4.cropGroup, r4.variant);
      }
    } else if(ev.target.classList && ev.target.classList.contains("journal-memo")){
      var jid = ev.target.getAttribute("data-jid");
      var entry = state.journal.find(function(e){ return e.id === jid; });
      if(entry){ entry.memo = ev.target.value; saveJournal(state.journal); }
    }
  });

  // ---------- AUTH GATE ----------
  // 선택된 사용자의 기록을 메모리로 불러온다
  function loadUserSession(){
    state.user = getCurrentUser();
    state.journal = loadJournal();
    state.chatMessages = loadChat();
    state.quiz = null;
    state.quizAnswered = null;
  }

  function renderUserGate(){
    var users = getUsers();
    var html = '<div class="auth-title">사용자 선택</div>' +
      '<div class="auth-sub">기록(대화·업무일지·퀴즈)을 사용자별로 따로 저장합니다.</div>';
    if(users.length){
      html += '<div class="user-list">';
      users.forEach(function(u){
        html += '<button type="button" class="user-item" data-action="pick-user" data-val="' + escapeHtml(u) + '">' +
          '<span class="user-avatar">' + escapeHtml(u.slice(0,1)) + '</span>' + escapeHtml(u) +
          '<span class="user-del" data-action="del-user" data-val="' + escapeHtml(u) + '">삭제</span></button>';
      });
      html += '</div><div class="user-or">또는 새로 등록</div>';
    }
    html += '<form id="userForm" autocomplete="off">' +
      '<input id="userInput" type="text" placeholder="이름 입력 (예: 홍길동)" autocomplete="off"/>' +
      '<button type="submit">시작하기</button>' +
      '</form>' +
      '<div class="auth-error" id="userError"></div>' +
      '<div class="auth-note">서버가 없어 기록은 <b>이 기기</b>에만 저장됩니다.<br/>다른 기기와 동기화되지 않으며, 이름 선택은 본인 확인 수단이 아닙니다.</div>';
    return html;
  }

  function showUserGate(){
    var gate = document.getElementById("authGate");
    gate.classList.remove("hidden");
    document.getElementById("appRoot").classList.add("hidden");
    gate.querySelector(".auth-card").innerHTML =
      '<img class="auth-logo" src="' + D.logo + '" alt="SG 한국삼공"/>' + renderUserGate();
    var ui = document.getElementById("userInput");
    if(ui) ui.focus();
  }

  function enterAppAs(name){
    setCurrentUser(name);
    addUser(name);
    loadUserSession();
    document.getElementById("authGate").classList.add("hidden");
    document.getElementById("appRoot").classList.remove("hidden");
    state.tab = "search"; state.view = "list"; state.selected = null;
    render();
  }

  function unlockApp(){
    var cur = getCurrentUser();
    if(cur){ enterAppAs(cur); return; }
    showUserGate();
  }

  // 사용자 선택 화면의 클릭/제출 처리
  document.addEventListener("click", function(ev){
    var el = ev.target.closest("[data-action]");
    if(!el) return;
    var action = el.dataset.action;
    if(action === "pick-user"){ enterAppAs(el.dataset.val); }
    else if(action === "del-user"){
      ev.stopPropagation();
      var name = el.dataset.val;
      if(window.confirm('"' + name + '" 사용자와 그 기록을 모두 삭제할까요?')){
        saveUsers(getUsers().filter(function(u){ return u !== name; }));
        lsDel(LS.journal + "__" + name);
        lsDel(LS.chat + "__" + name);
        lsDel(LS.quizStat + "__" + name);
        if(getCurrentUser() === name) setCurrentUser("");
        showUserGate();
      }
    }
    else if(action === "switch-user"){
      setCurrentUser("");
      showUserGate();
    }
  });

  document.addEventListener("submit", function(ev){
    if(ev.target && ev.target.id === "userForm"){
      ev.preventDefault();
      var v = (document.getElementById("userInput").value || "").trim();
      var err = document.getElementById("userError");
      if(!v){ if(err) err.textContent = "이름을 입력하세요."; return; }
      if(v.length > 20){ if(err) err.textContent = "이름이 너무 깁니다 (20자 이내)."; return; }
      enterAppAs(v);
    }
  });

  function initAuth(){
    var gate = document.getElementById("authGate");
    var form = document.getElementById("authForm");
    var input = document.getElementById("authInput");
    var errEl = document.getElementById("authError");

    if(lsGet(LS.authed, "") === getAccessCode()){ unlockApp(); return; }

    form.addEventListener("submit", function(ev){
      ev.preventDefault();
      var v = (input.value||"").trim();
      if(v === getAccessCode()){
        lsSet(LS.authed, v);
        unlockApp();
      } else {
        errEl.textContent = "인증코드가 올바르지 않습니다.";
        input.value = "";
        input.focus();
        gate.querySelector(".auth-card").classList.remove("shake");
        void gate.querySelector(".auth-card").offsetWidth;
        gate.querySelector(".auth-card").classList.add("shake");
      }
    });
    input.focus();
  }

  initAuth();
})();
