/* ============================================================
   FC NOVA — interface rendering & interactions
   ============================================================ */
(function () {
  "use strict";
  const D = window.FCN.data;
  const S = window.FCN.store;
  const Sound = window.FCN.sound;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const fmt = (n) => Math.round(n).toLocaleString("vi-VN");
  const clampInt = (v, a, b) => Math.max(a, Math.min(b, v));

  const resultHandler = { fn: null };
  let currentScreen = "home";
  let setupCtx = null;

  /* ---------------- tiny helpers ---------------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function rarityLabel(p) { return D.RARITY_LABEL[p.rarity] || "Đồng"; }
  function nationName(code) { return D.NATIONS[code] || code; }

  function avatarSVG(p) {
    const uid = String(p.id).replace(/[^a-zA-Z0-9]/g, "");
    const elite = p.rarity === "elite" || p.rarity === "legend";
    const kitA = elite ? "#f2fbff" : "#172231";
    const kitB = elite ? "#b9d6e8" : "#0a111c";
    const trim = elite ? "#b072ff" : "#c8ff2e";
    const numColor = elite ? "#1b0a33" : "#eaf7ff";
    const skin = p.skin || "#e0ad7f";
    const skinDark = shade(skin, -0.16);
    const hair = p.hair || "#1b1b1b";
    const style = p.hairStyle || 0;
    let hairPath = "";
    if (style === 0) {
      hairPath = `<path d="M33 54 Q34 36 50 35 Q66 36 67 54 Q63 44 50 44 Q37 44 33 54Z" fill="${hair}"/><path d="M36 43 Q43 38 50 38" stroke="rgba(255,255,255,.22)" stroke-width="1.5" fill="none"/>`;
    } else if (style === 1) {
      hairPath = `<path d="M33 56 Q33 39 50 38 Q67 39 67 56 L64 49 Q58 45 50 45 Q42 45 36 49Z" fill="${hair}"/><path d="M38 47 Q44 42 51 42" stroke="rgba(255,255,255,.18)" stroke-width="1.5" fill="none"/>`;
    } else if (style === 2) {
      hairPath = `<g fill="${hair}"><circle cx="36" cy="44" r="6"/><circle cx="42" cy="39" r="6.4"/><circle cx="50" cy="37" r="6.5"/><circle cx="58" cy="39" r="6.4"/><circle cx="64" cy="44" r="6"/><path d="M33 55 Q33 38 50 37 Q67 38 67 55 Q62 46 50 46 Q38 46 33 55Z"/></g>`;
    } else {
      hairPath = `<path d="M33 55 Q33 36 50 35 Q67 36 67 55 L67 68 Q63 70 62 60 L62 47 Q56 43 50 43 Q44 43 38 47 L38 60 Q37 70 33 68Z" fill="${hair}"/>`;
    }
    return `<svg viewBox="0 0 100 132" aria-hidden="true">
      <defs>
        <linearGradient id="k${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${kitA}"/><stop offset="1" stop-color="${kitB}"/></linearGradient>
        <radialGradient id="f${uid}" cx="42%" cy="36%" r="70%"><stop offset="0" stop-color="${shade(skin, 0.14)}"/><stop offset=".7" stop-color="${skin}"/><stop offset="1" stop-color="${skinDark}"/></radialGradient>
      </defs>
      <ellipse cx="50" cy="127" rx="32" ry="6" fill="#000" opacity=".2"/>
      <path d="M23 132 C23 108 30 94 40 89 L60 89 C70 94 77 108 77 132 Z" fill="url(#k${uid})"/>
      <path d="M23 132 C15 125 12 112 15 101 L27 92 L33 105 L28 115 L30 132 Z" fill="url(#k${uid})"/>
      <path d="M77 132 C85 125 88 112 85 101 L73 92 L67 105 L72 115 L70 132 Z" fill="url(#k${uid})"/>
      <path d="M27 92 L33 105 M73 92 L67 105" stroke="${trim}" stroke-width="2.2" opacity=".9"/>
      <path d="M41 89 L50 100 L59 89" fill="none" stroke="${trim}" stroke-width="2.6"/>
      <text x="50" y="124" font-family="Barlow Condensed, sans-serif" font-weight="800" font-size="23" fill="${numColor}" text-anchor="middle" opacity=".92">${p.number || 9}</text>
      <path d="M44 76 L44 91 Q50 97 56 91 L56 76 Z" fill="${skinDark}"/>
      <ellipse cx="33" cy="61" rx="3" ry="4.4" fill="${skinDark}"/>
      <ellipse cx="67" cy="61" rx="3" ry="4.4" fill="${skinDark}"/>
      <ellipse cx="50" cy="59" rx="16.2" ry="18.6" fill="url(#f${uid})"/>
      <path d="M36 69 Q42 79 50 79 Q58 79 64 69 Q58 76 50 76 Q42 76 36 69Z" fill="${skinDark}" opacity=".5"/>
      ${hairPath}
      <path d="M37 53 Q40 49 43 51" stroke="${shade(hair, 0.15)}" stroke-width="1.4" fill="none" opacity=".8" stroke-linecap="round"/>
    </svg>`;
  }
  function shade(hex, amt) {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const num = parseInt(h, 16);
    let r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
    if (amt >= 0) { r = r + (255 - r) * amt; g = g + (255 - g) * amt; b = b + (255 - b) * amt; }
    else { r = r * (1 + amt); g = g * (1 + amt); b = b * (1 + amt); }
    return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  }

  function playerCard(p, opts = {}) {
    if (!p) return "";
    return `<div class="pcard r-${p.rarity} ${opts.className || ""}" data-player-card="${p.id}">
      <div class="pcard-inner">
        <div class="pcard-shine"></div>
        <div class="pcard-head"><b>${p.ovr}</b><span>${p.pos}</span></div>
        <div class="pcard-badge">${p.nation}</div>
        <div class="pcard-num">${String(p.number || 9).padStart(2, "0")}</div>
        <div class="pcard-art">${avatarSVG(p)}</div>
        <div class="pcard-foot"><b>${esc(p.name)}</b><span>${p.nation} · ${esc(p.club || "NOVA FC")}</span></div>
      </div>
    </div>`;
  }

  /* ---------------- render ---------------- */
  function render() {
    const st = S.getState();
    renderResources(st);
    renderHome(st);
    renderSquad(st);
    renderStore(st);
    renderProfile(st);
    renderDaily(st);
    renderSound(st);
  }

  function renderResources(st) {
    $("#res-coins").textContent = fmt(st.coins);
    $("#res-gems").textContent = fmt(st.gems);
    const sc = $("#store-coins");
    if (sc) sc.textContent = fmt(st.coins);
    const lvl = S.levelInfo();
    const pl = $("#profile-level");
    if (pl) pl.textContent = lvl.level;
    $("#hero-record").textContent = `${st.record.w}-${st.record.d}-${st.record.l}`;
    $("#hero-trophies").textContent = st.trophies;
  }

  function renderHome(st) {
    const squad = S.getSquadPlayers().map((x) => x.player).filter(Boolean);
    const best = squad.slice().sort((a, b) => b.ovr - a.ovr)[0] || st.collection[0];
    const hero = $("#hero-card");
    if (hero && best) hero.innerHTML = playerCard(best, { className: "hero-card" });
    $("#hero-ovr").textContent = S.squadOverall(st);
    $("#mini-formation").textContent = st.formation;
    $("#mini-ovr").textContent = S.squadOverall(st);
    $("#mini-count").textContent = st.collection.length;

    const slots = D.FORMATIONS[st.formation].slots;
    const mini = $("#mini-pitch");
    if (mini) {
      mini.innerHTML = slots.map((slot, i) => {
        const p = S.getPlayer(st.squad[i]);
        const cap = p && p.ovr === Math.max(...squad.map((x) => x.ovr));
        return `<span class="mini-dot ${cap ? "cap" : ""}" style="left:${slot.x}%;top:${Math.min(94, Math.max(6, slot.y))}%" title="${p ? esc(p.name) : ""}">${cap ? p.number : ""}</span>`;
      }).join("");
    }

    const gold = D.PACKS.find((p) => p.id === "gold");
    const hp = $("#home-pack");
    if (hp) {
      hp.innerHTML = `<div class="home-pack-art"><svg class="ico"><use href="#i-ball"/></svg><span>GÓI VÀNG · 3 CẦU THỦ</span></div>
        <div class="home-pack-info"><div><b>GÓI VÀNG</b><small>Từ 74 → 84 OVR</small></div><b class="pc-price"><svg class="ico"><use href="#i-coin"/></svg>${fmt(gold.price)}</b></div>
        <button class="btn btn-primary" data-pack="${gold.id}">MỞ GÓI</button>`;
    }
    const news = $("#news-list");
    if (news) {
      news.innerHTML = D.NEWS.map(([t, d]) => `<div class="news-item"><i></i><div><b>${esc(t)}</b><span>${esc(d)}</span></div></div>`).join("");
    }
  }

  function renderSquad(st) {
    const slots = D.FORMATIONS[st.formation].slots;
    $("#squad-ovr").textContent = S.squadOverall(st);
    $("#squad-count").textContent = st.collection.length;
    const tabs = $("#formation-tabs");
    if (tabs) {
      tabs.innerHTML = Object.keys(D.FORMATIONS).map((key) => `<button class="formation-tab ${st.formation === key ? "active" : ""}" data-formation="${key}">${key}</button>`).join("");
    }
    const board = $("#squad-pitch");
    if (board) {
      board.innerHTML = slots.map((slot, i) => {
        const p = S.getPlayer(st.squad[i]);
        if (!p) {
          return `<button class="squad-slot empty" style="left:${slot.x}%;top:${slot.y}%" data-slot="${i}"><span class="slot-ovr">+</span><span class="slot-info"><b>Trống</b><small>${slot.pos}</small></span></button>`;
        }
        return `<button class="squad-slot" data-rarity="${p.rarity}" data-slot="${i}" style="left:${slot.x}%;top:${slot.y}%">
          <span class="slot-ovr">${p.ovr}</span><span class="slot-info"><b>${esc(p.name)}</b><small>${slot.pos} · ${p.nation}</small></span>
        </button>`;
      }).join("");
    }
    const bd = S.squadBreakdown(st);
    $("#sum-atk").textContent = bd.atk;
    $("#sum-mid").textContent = bd.mid;
    $("#sum-def").textContent = bd.def;
    const list = $("#player-list");
    if (list) {
      const inSquad = new Set(st.squad);
      list.innerHTML = st.collection.slice().sort((a, b) => b.ovr - a.ovr).map((p) => `
        <button class="player-row ${inSquad.has(p.id) ? "in-squad" : ""}" data-rarity="${p.rarity}" data-player-detail="${p.id}">
          <span class="pr-ovr">${p.ovr}</span>
          <span class="pr-info"><b>${esc(p.name)}</b><small>${nationName(p.nation)} · ${rarityLabel(p)}</small></span>
          <span class="pr-pos">${p.pos}</span>
        </button>`).join("");
    }
  }

  function renderStore(st) {
    const feature = D.PACKS.find((p) => p.id === "gold");
    const feat = $("#pack-feature");
    if (feat) {
      feat.innerHTML = `<div class="pf-copy">
        <span class="tag">GÓI NỔI BẬT</span>
        <h3>GÓI VÀNG<br>PHỔ BIẾN</h3>
        <p>3 cầu thủ chất lượng từ 74 đến 84 OVR. Cơ hội nhận cầu thủ Tinh Anh!</p>
        <div class="pf-price"><b><svg class="ico"><use href="#i-coin"/></svg>${fmt(feature.price)}</b><span>mỗi gói</span></div>
      </div>
      <div class="pf-art"><div class="beam"></div><svg class="ico"><use href="#i-ball"/></svg></div>
      <button class="btn btn-primary btn-lg" data-pack="${feature.id}">MỞ GÓI NGAY</button>`;
    }
    const grid = $("#pack-grid");
    if (grid) {
      grid.innerHTML = D.PACKS.map((pack) => `
        <div class="pack-card" style="--pack-color:${pack.color};--pack-bg:${pack.bg};--pack-card:linear-gradient(155deg,${pack.color},${pack.color2})">
          <div class="pc-art"><span class="pc-tag">${pack.tag}</span><svg class="ico"><use href="#i-ball"/></svg></div>
          <div class="pc-info"><b>${pack.name}</b><span>${pack.desc}</span></div>
          <div class="pc-odds"><i class="on"></i><i class="on"></i><i></i><i></i></div>
          <div class="pc-buy"><span class="pc-price"><svg class="ico"><use href="#i-coin"/></svg>${fmt(pack.price)}</span><button class="btn btn-primary btn-sm" data-pack="${pack.id}">MỞ</button></div>
        </div>`).join("");
    }
  }

  function renderProfile(st) {
    const lvl = S.levelInfo();
    $("#profile-level").textContent = lvl.level;
    $("#profile-rank").textContent = lvl.rank;
    $("#xp-bar").style.width = Math.min(100, (lvl.into / lvl.need) * 100) + "%";
    $("#xp-label").textContent = `${lvl.into} / ${lvl.need} XP`;
    $("#profile-trophies").textContent = st.trophies;
    $("#stat-matches").textContent = st.record.w + st.record.d + st.record.l;
    $("#stat-wins").textContent = st.record.w;
    const total = st.record.w + st.record.d + st.record.l;
    $("#stat-wr").textContent = total ? Math.round((st.record.w / total) * 100) + "%" : "0%";
    $("#stat-gf").textContent = st.record.gf;
    $("#stat-ga").textContent = st.record.ga;
    $("#stat-gd").textContent = (st.record.gf - st.record.ga > 0 ? "+" : "") + (st.record.gf - st.record.ga);
    const A = S.achievements();
    $("#achievements").innerHTML = A.map((a) => `
      <div class="ach ${a.done ? "done" : ""}">
        <span class="ach-icon"><svg class="ico"><use href="#i-${a.icon}"/></svg></span>
        <div><b>${a.title}</b><span>${a.desc}</span></div>
        <svg class="ico ach-check"><use href="#i-check"/></svg>
      </div>`).join("");
  }

  function renderDaily(st) {
    const available = S.dailyAvailable();
    const b = $("#daily-claim");
    if (b) {
      b.textContent = available ? "NHẬN" : "ĐÃ NHẬN";
      b.disabled = !available;
      b.style.opacity = available ? "1" : ".45";
    }
    const add = $("#daily-btn");
    if (add) {
      add.style.opacity = available ? "1" : ".4";
      add.title = available ? "Nhận 750 xu hôm nay" : "Đã nhận thưởng hôm nay";
    }
  }

  function renderSound(st) {
    const on = st.settings.sound !== false;
    const btn = $("#sound-toggle");
    if (btn) btn.innerHTML = `<svg class="ico"><use href="#i-${on ? "sound" : "mute"}"/></svg>`;
    const state = $("#sound-state");
    if (state) state.textContent = on ? "BẬT" : "TẮT";
  }

  /* ---------------- navigation ---------------- */
  function navigate(screen) {
    if (screen === "play") { openSetup(); return; }
    if (!D.TEAMS.nova || !$(`#screen-${screen}`)) return;
    currentScreen = screen;
    $$(".screen").forEach((s) => s.classList.toggle("active", s.dataset.screen === screen));
    $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.nav === screen));
    window.scrollTo({ top: 0, behavior: "smooth" });
    render();
    if (screen === "squad") {
      // allow the board to breathe on small screens
      $("#screen-squad").classList.add("in");
    }
    Sound.click();
  }

  /* ---------------- modal ---------------- */
  function openModal(html, cls = "") {
    const root = $("#modal-root");
    root.innerHTML = `<div class="modal-backdrop" data-close></div><div class="modal ${cls}" role="dialog" aria-modal="true">${html}</div>`;
    root.classList.add("open");
    document.body.style.overflow = "hidden";
    return $(".modal", root);
  }
  function closeModal() {
    const root = $("#modal-root");
    root.classList.remove("open");
    root.innerHTML = "";
    document.body.style.overflow = "";
  }

  function toast(msg) {
    const root = $("#toast-root");
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = msg;
    root.appendChild(el);
    setTimeout(() => el.remove(), 3100);
  }

  /* ---------------- squad interactions ---------------- */
  function openSlotPicker(index) {
    const st = S.getState();
    const slot = D.FORMATIONS[st.formation].slots[index];
    const current = S.getPlayer(st.squad[index]);
    const players = st.collection.slice().sort((a, b) => {
      const fa = S.fitScore(a.pos, slot.pos) * 20 + a.ovr;
      const fb = S.fitScore(b.pos, slot.pos) * 20 + b.ovr;
      return fb - fa;
    });
    const body = players.map((p) => `
      <button class="pick-player ${current && p.id === current.id ? "current" : ""}" data-pick="${p.id}" data-slot-index="${index}">
        <span class="pick-ovr" data-rarity="${p.rarity}">${p.ovr}</span>
        <span class="pick-info"><b>${esc(p.name)}</b><span>${nationName(p.nation)} · ${rarityLabel(p)} · ${p.pos}</span></span>
        ${S.fitScore(p.pos, slot.pos) >= 0.9 ? '<span class="pick-add">PHÙ HỢP</span>' : ""}
        <span class="pick-pos">${p.pos}</span>
      </button>`).join("");
    const modal = openModal(`<div class="sheet-head"><div><div class="modal-title">VỊ TRÍ ${slot.pos}</div><div class="modal-sub">Chọn cầu thủ cho vị trí này</div></div><button class="sheet-close" data-close><svg class="ico"><use href="#i-close"/></svg></button></div>
      <div class="sheet-body">${body || '<div class="sheet-empty">Chưa có cầu thủ nào.</div>'}</div>`, "sheet");
    modal.addEventListener("click", (e) => {
      const pick = e.target.closest("[data-pick]");
      if (!pick) return;
      S.setSlot(index, pick.dataset.pick);
      Sound.select();
      closeModal();
      render();
      toast("Đã cập nhật đội hình");
    });
  }

  function openPlayerDetail(id) {
    const p = S.getPlayer(id);
    if (!p) return;
    const st = S.getState();
    const inSquad = st.squad.includes(id);
    const stats = Object.entries(p.stats).map(([k, v]) => {
      const labels = { pac: "TỐC ĐỘ", sho: "SÚT", pas: "CHUYỀN", dri: "RÊ BÓNG", def: "PHÒNG NGỰ", phy: "THỂ LỰC", div: "BẮT BÓNG", han: "XỬ LÝ", kic: "PHÁT BÓNG", ref: "PHẢN XẠ", spd: "TỐC ĐỘ", pos: "VỊ TRÍ" };
      return `<div class="stat-line"><span>${labels[k] || k.toUpperCase()}</span><i><b style="width:${v}%"></b></i><em>${v}</em></div>`;
    }).join("");
    const modal = openModal(`
      <button class="modal-close" data-close><svg class="ico"><use href="#i-close"/></svg></button>
      <div class="detail-layout">
        <div class="detail-card">${playerCard(p, { className: "detail-pcard" })}</div>
        <div class="detail-info">
          <div class="eyebrow">${rarityLabel(p)} · ${p.pos}</div>
          <h2>${esc(p.name)}</h2>
          <div class="detail-meta"><span>${nationName(p.nation)}</span><span>${esc(p.club || "NOVA FC")}</span><span>#${p.number}</span></div>
          <div class="stat-lines">${stats}</div>
          ${inSquad ? '<div class="in-squad-tag"><svg class="ico"><use href="#i-check"/></svg> ĐANG TRONG ĐỘI HÌNH</div>' : `<button class="btn btn-primary btn-block" data-place="${p.id}">XẾP VÀO ĐỘI HÌNH</button>`}
        </div>
      </div>`, "wide detail-modal");
    modal.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-place]");
      if (!btn) return;
      placeBest(btn.dataset.place);
    });
  }

  function placeBest(id) {
    const st = S.getState();
    const p = S.getPlayer(id);
    if (!p) return;
    const slots = D.FORMATIONS[st.formation].slots;
    let bestIdx = -1, bestGain = -999;
    slots.forEach((slot, i) => {
      const cur = S.getPlayer(st.squad[i]);
      const fit = S.fitScore(p.pos, slot.pos);
      const curFit = cur ? S.fitScore(cur.pos, slot.pos) : 0;
      const gain = p.ovr * fit - (cur ? cur.ovr * curFit : 0);
      if (gain > bestGain) { bestGain = gain; bestIdx = i; }
    });
    if (bestIdx < 0) return;
    S.setSlot(bestIdx, id);
    Sound.select();
    closeModal();
    render();
    toast(`Đã xếp <b>${esc(p.name)}</b> vào đội hình`);
  }

  /* ---------------- store / packs ---------------- */
  function openPackFlow(packId) {
    const pack = D.PACKS.find((p) => p.id === packId);
    if (!pack) return;
    if (!S.canAfford(pack)) {
      toast("Không đủ xu. Hãy đá trận để kiếm thêm!");
      Sound.click();
      return;
    }
    const res = S.openPack(pack);
    if (!res.ok) { toast("Không đủ xu."); return; }
    Sound.pack();
    render();
    const modal = openModal(`
      <div class="reveal-modal">
        <div class="eyebrow" style="justify-content:center">${pack.name}</div>
        <div class="reveal-stage" id="reveal-stage">
          <button class="reveal-pack" id="reveal-pack" style="--pack-card:linear-gradient(155deg,${pack.color},${pack.color2});--pack-glow:${pack.glow}">
            <svg class="ico"><use href="#i-ball"/></svg>
          </button>
        </div>
        <div class="reveal-info" id="reveal-info">Chạm vào gói để mở · ${res.cards.length} cầu thủ</div>
        <div class="reveal-actions" id="reveal-actions"><button class="btn btn-ghost" data-close>ĐỂ SAU</button></div>
      </div>`, "wide reveal-modal");

    const packEl = $("#reveal-pack", modal);
    const stage = $("#reveal-stage", modal);
    const info = $("#reveal-info", modal);
    const actions = $("#reveal-actions", modal);
    let opened = false;
    packEl.addEventListener("click", () => {
      if (opened) return;
      opened = true;
      packEl.remove();
      Sound.pack();
      const best = res.cards.slice().sort((a, b) => b.ovr - a.ovr)[0];
      stage.innerHTML = `<div class="reveal-cards" id="reveal-cards">${res.cards.map((p) => playerCard(p, { className: p.rarity === "elite" ? "elite-glow" : "" })).join("")}</div><div class="reveal-spark" id="reveal-spark"></div>`;
      const cards = $$(".pcard", stage);
      cards.forEach((c, i) => {
        setTimeout(() => {
          c.classList.add("show");
          Sound.reveal(i);
          const rect = c.getBoundingClientRect();
          spawnSparks($("#reveal-spark", stage), rect);
        }, 260 + i * 420);
      });
      setTimeout(() => {
        info.innerHTML = `Cầu thủ tốt nhất: <b>${esc(best.name)}</b> · ${best.ovr} OVR`;
        actions.innerHTML = `<button class="btn btn-primary" data-auto-squad>XẾP ĐỘI HÌNH</button><button class="btn btn-ghost" data-close>TIẾP TỤC</button>`;
        Sound.win();
        $("#reveal-spark", stage)?.remove();
      }, 260 + cards.length * 420 + 350);
      actions.innerHTML = "";
    });
    modal.addEventListener("click", (e) => {
      if (e.target.closest("[data-auto-squad]")) {
        S.autoSquad();
        render();
        closeModal();
        toast("Đã tự động xếp đội hình mạnh nhất");
        Sound.select();
      }
    });
  }

  function spawnSparks(container, rect) {
    if (!container) return;
    const n = 16;
    for (let i = 0; i < n; i++) {
      const s = document.createElement("i");
      const ang = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 90;
      s.style.left = rect.left - container.getBoundingClientRect().left + rect.width / 2 + "px";
      s.style.top = rect.top - container.getBoundingClientRect().top + rect.height / 2 + "px";
      s.style.setProperty("--dx", Math.cos(ang) * dist + "px");
      s.style.setProperty("--dy", Math.sin(ang) * dist + "px");
      s.style.background = ["#c8ff2e", "#fff", "#ffe27a", "#a06bff", "#43e9ff"][i % 5];
      s.style.animationDelay = Math.random() * 0.2 + "s";
      container.appendChild(s);
    }
  }

  /* ---------------- match setup ---------------- */
  function openSetup(opts = {}) {
    const st = S.getState();
    setupCtx = {
      mode: opts.mode || "quick",
      team: opts.team || "raven",
      difficulty: opts.difficulty || "normal",
      fixed: !!opts.fixed
    };
    if (!opts.fixed && !opts.difficulty) {
      const preset = D.OPPONENTS.find((o) => o.team === setupCtx.team);
      if (preset) setupCtx.difficulty = preset.difficulty;
    }
    if (opts.mode === "cup") {
      const cup = st.cup || { round: 1 };
      const round = clampInt((cup.round || 1) - 1, 0, 2);
      const opp = D.OPPONENTS[round + 1] || D.OPPONENTS[1];
      setupCtx.team = opp.team;
      setupCtx.difficulty = ["normal", "hard", "insane"][round];
      setupCtx.fixed = true;
    }
    const ovr = S.squadOverall(st);
    const modal = openModal(`
      <button class="modal-close" data-close><svg class="ico"><use href="#i-close"/></svg></button>
      <div class="modal-head"><span class="slash"></span><div><div class="modal-title">${setupCtx.mode === "cup" ? "CÚP NOVA" : "ĐÁ NHANH"}</div><div class="modal-sub">${setupCtx.fixed ? "Trận đấu trong giải — đối thủ đã được xác định" : "Chọn đối thủ và độ khó"}</div></div></div>
      <div class="setup-opponents" id="setup-opponents">
        ${D.OPPONENTS.map((o) => {
          const t = D.TEAMS[o.team];
          return `<button class="opponent ${setupCtx.team === o.team ? "selected" : ""}" data-opp="${o.team}" ${setupCtx.fixed ? "disabled" : ""} style="--c:${t.color}">
            <span class="opp-crest">${t.crest}</span>
            <span class="opp-info"><b>${t.name}</b><span>${o.label} · ${t.style || "cân bằng"}</span></span>
            <span class="opp-ovr">${o.ovr}</span>
          </button>`;
        }).join("")}
      </div>
      <div class="eyebrow">ĐỘ KHÓ</div>
      <div class="diff-row" id="setup-diff">
        ${Object.entries(D.DIFFICULTIES).map(([key, d]) => `<button class="diff-btn ${setupCtx.difficulty === key ? "selected" : ""}" data-diff="${key}" ${setupCtx.fixed ? "disabled" : ""} style="${setupCtx.fixed ? "opacity:.45" : ""}">${d.name}<small>${d.sub}</small></button>`).join("")}
      </div>
      <div class="setup-lineup">
        <div class="sl-team"><span class="crest" style="background:${D.TEAMS.nova.color}">N</span><div><b>NOVA FC</b><small>${st.formation} · ${st.collection.length} CẦU THỦ</small></div></div>
        <span class="sl-ovr">${ovr}</span>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>HỦY</button>
        <button class="btn btn-primary" id="setup-start"><svg class="ico"><use href="#i-play"/></svg> VÀO TRẬN</button>
      </div>
      <p class="fineprint" style="text-align:center">Trận đấu 3 phút · 2 hiệp · 11 đấu 11. Mẹo: giữ nút SÚT để lấy đà.</p>
    `, "wide");
    modal.addEventListener("click", (e) => {
      const oppBtn = e.target.closest("[data-opp]");
      if (oppBtn && !setupCtx.fixed) {
        setupCtx.team = oppBtn.dataset.opp;
        const o = D.OPPONENTS.find((x) => x.team === setupCtx.team);
        setupCtx.difficulty = o.difficulty;
        $$(".opponent", modal).forEach((b) => b.classList.toggle("selected", b.dataset.opp === setupCtx.team));
        $$(".diff-btn", modal).forEach((b) => b.classList.toggle("selected", b.dataset.diff === setupCtx.difficulty));
        Sound.click();
      }
      const diffBtn = e.target.closest("[data-diff]");
      if (diffBtn && !setupCtx.fixed) {
        setupCtx.difficulty = diffBtn.dataset.diff;
        $$(".diff-btn", modal).forEach((b) => b.classList.toggle("selected", b === diffBtn));
        Sound.click();
      }
      if (e.target.closest("#setup-start")) {
        Sound.whistle(false);
        closeModal();
        if (setupCtx.mode === "cup") {
          const st2 = S.getState();
          if (!st2.cup) { st2.cup = { round: 1, startedAt: Date.now() }; }
          S.changed();
        }
        if (window.FCN.app && window.FCN.app.startMatch) {
          window.FCN.app.startMatch({
            mode: setupCtx.mode,
            team: setupCtx.team,
            difficulty: setupCtx.difficulty
          });
        }
      }
    });
  }

  /* ---------------- cup ---------------- */
  function openCup() {
    const st = S.getState();
    const active = st.cup && st.cup.round <= 3;
    const round = active ? Math.min(2, (st.cup.round || 1) - 1) : 0;
    const names = ["TỨ KẾT", "BÁN KẾT", "CHUNG KẾT"];
    if (!active) {
      const modal = openModal(`
        <button class="modal-close" data-close><svg class="ico"><use href="#i-close"/></svg></button>
        <div class="cup-hero">
          <div class="cup-art"><svg class="ico"><use href="#i-trophy"/></svg></div>
          <div><div class="eyebrow">GIẢI ĐẤU LOẠI TRỰC TIẾP</div><div class="modal-title">CÚP NOVA</div><p class="modal-sub">Ba trận. Ba đối thủ. Một chiếc cúp.<br>Thắng cả ba để nhận <b style="color:var(--gold)">5.000 xu</b> và 1 cúp.</p></div>
        </div>
        <div class="cup-bracket">${[1, 2, 3].map((r, i) => {
          const t = D.TEAMS[D.OPPONENTS[r].team];
          return `<div class="cup-node"><span class="cup-round">${names[i]}</span><span class="cup-crest" style="background:${t.color}">${t.crest}</span><b>${t.name}</b><small>${D.OPPONENTS[r].ovr} OVR</small></div>`;
        }).join("")}</div>
        <div class="modal-actions"><button class="btn btn-ghost" data-close>ĐỂ SAU</button><button class="btn btn-primary" id="cup-start"><svg class="ico"><use href="#i-play"/></svg> BẮT ĐẦU CÚP</button></div>
      `);
      modal.addEventListener("click", (e) => {
        if (e.target.closest("#cup-start")) {
          const s = S.getState();
          s.cup = { round: 1, startedAt: Date.now() };
          S.changed();
          closeModal();
          openSetup({ mode: "cup" });
        }
      });
    } else {
      const opp = D.OPPONENTS[round + 1];
      const t = D.TEAMS[opp.team];
      const modal = openModal(`
        <button class="modal-close" data-close><svg class="ico"><use href="#i-close"/></svg></button>
        <div class="cup-hero">
          <div class="cup-art"><svg class="ico"><use href="#i-trophy"/></svg></div>
          <div><div class="eyebrow">CÚP NOVA · ${names[round]}</div><div class="modal-title">${t.name}</div><p class="modal-sub">Đối thủ tiếp theo đang chờ bạn. Thắng để đi tiếp, thua là dừng bước.</p></div>
        </div>
        <div class="cup-progress">${[0, 1, 2].map((i) => {
          const done = st.cup.round > i + 1;
          const current = st.cup.round === i + 1;
          return `<div class="cup-step ${done ? "done" : ""} ${current ? "current" : ""}"><span>${done ? "✓" : i + 1}</span><b>${names[i]}</b><small>${D.TEAMS[D.OPPONENTS[i + 1].team].name}</small></div>`;
        }).join("")}</div>
        <div class="setup-lineup"><div class="sl-team"><span class="crest" style="background:${t.color}">${t.crest}</span><div><b>${t.name}</b><small>${opp.label} · ${opp.ovr} OVR</small></div></div><span class="sl-ovr">VS</span></div>
        <div class="modal-actions"><button class="btn btn-ghost" data-close>THOÁT</button><button class="btn btn-primary" id="cup-next"><svg class="ico"><use href="#i-play"/></svg> ĐÁ TRẬN</button></div>
      `);
      modal.addEventListener("click", (e) => {
        if (e.target.closest("#cup-next")) { closeModal(); openSetup({ mode: "cup" }); }
      });
    }
  }

  /* ---------------- match overlays ---------------- */
  function showPause(handlers) {
    const root = $("#match-overlay");
    root.innerHTML = `<div class="overlay-card">
      <div class="eyebrow" style="justify-content:center">TẠM DỪNG</div>
      <h3>NGHỈ GIẢI LAO</h3>
      <p>Trận đấu đang tạm dừng. Sẵn sàng trở lại sân?</p>
      <div class="ov-actions">
        <button class="btn btn-primary" data-match-action="resume"><svg class="ico"><use href="#i-play"/></svg> TIẾP TỤC</button>
        <button class="btn btn-ghost" data-match-action="sound"><svg class="ico"><use href="#i-sound"/></svg> BẬT / TẮT ÂM THANH</button>
        <button class="btn btn-ghost" data-match-action="quit">RỜI TRẬN</button>
      </div>
    </div>`;
    root.classList.add("open");
    root.onclick = (e) => {
      const b = e.target.closest("[data-match-action]");
      if (!b) return;
      const a = b.dataset.matchAction;
      if (a === "resume") { hideOverlay(); handlers.resume(); }
      else if (a === "sound") {
        const st = S.getState();
        st.settings.sound = st.settings.sound === false;
        S.changed();
        Sound.setEnabled(st.settings.sound);
        renderSound(st);
        toast(st.settings.sound ? "Đã bật âm thanh" : "Đã tắt âm thanh");
      } else if (a === "quit") { hideOverlay(); handlers.quit(); }
    };
  }

  function showResult(data) {
    const root = $("#match-overlay");
    const title = data.champion ? "VÔ ĐỊCH!" : data.won ? "CHIẾN THẮNG!" : data.drawn ? "HÒA" : "THUA";
    const cls = data.champion ? "goal" : data.won ? "" : data.drawn ? "info" : "";
    const cupNote = data.mode === "cup"
      ? `<div class="ov-note" style="margin-bottom:10px">${data.champion ? "Bạn đã chinh phục Cúp Nova!" : data.won ? `Đi tiếp! Trận kế: ${data.nextOpp || "Chung kết"}` : "Cúp Nova kết thúc tại đây."}</div>`
      : "";
    const nextBtn = data.mode === "cup" && data.won && !data.champion
      ? `<button class="btn btn-primary" data-result="next"><svg class="ico"><use href="#i-play"/></svg> TRẬN TIẾP</button>` : "";
    root.innerHTML = `<div class="overlay-card">
      <div class="eyebrow" style="justify-content:center">${data.mode === "cup" ? "CÚP NOVA" : "HẾT GIỜ"}</div>
      <h3 style="${data.won || data.champion ? "color:var(--lime)" : ""}">${title}</h3>
      <div class="overlay-score">
        <div><b>${data.homeScore}</b><span>NOVA FC</span></div><i>:</i><div><b>${data.awayScore}</b><span>${esc(data.oppName)}</span></div>
      </div>
      <div class="overlay-stats">
        <div><b>${data.stats.possession}%</b><span>KIỂM SOÁT</span></div>
        <div><b>${data.stats.shots}</b><span>SÚT</span></div>
        <div><b>${data.stats.onTarget}</b><span>TRÚNG ĐÍCH</span></div>
        <div><b>${data.stats.passes}</b><span>CHUYỀN</span></div>
      </div>
      <div class="reward-line"><svg class="ico"><use href="#i-coin"/></svg>+${fmt(data.reward.coins)} xu <span style="font-family:var(--font);font-size:9px;color:var(--muted);letter-spacing:1px;margin-left:6px">+${data.reward.xp} XP</span></div>
      ${cupNote}
      <div class="ov-actions">
        ${nextBtn}
        <button class="btn btn-ghost" data-result="replay"><svg class="ico"><use href="#i-play"/></svg> ĐÁ LẠI</button>
        <button class="btn btn-ghost" data-result="home">VỀ SÂN NHÀ</button>
      </div>
    </div>`;
    root.classList.add("open");
    root.onclick = (e) => {
      const b = e.target.closest("[data-result]");
      if (!b) return;
      if (resultHandler.fn) resultHandler.fn(b.dataset.result);
    };
    if (data.champion) Sound.win();
    else if (data.won) Sound.win();
    else if (!data.drawn) Sound.lose();
  }

  function showHalftime() {
    const root = $("#match-overlay");
    root.innerHTML = `<div class="overlay-card" style="text-align:center">
      <div class="eyebrow" style="justify-content:center">HẾT HIỆP 1</div>
      <h3>NGHỈ GIỮA HIỆP</h3>
      <p>Hít thở sâu. Hiệp hai bắt đầu ngay.</p>
      <div class="ov-note" style="margin-top:14px">Tự động tiếp tục sau vài giây…</div>
    </div>`;
    root.classList.add("open");
  }
  function hideOverlay() {
    const root = $("#match-overlay");
    root.classList.remove("open");
    root.onclick = null;
  }

  /* ---------------- events ---------------- */
  function init() {
    document.addEventListener("click", (e) => {
      const nav = e.target.closest("[data-nav]");
      if (nav) {
        if (nav.dataset.nav === "play") { Sound.click(); openSetup(); }
        else navigate(nav.dataset.nav);
        return;
      }
      if (e.target.closest("[data-close]")) { closeModal(); return; }
      if (e.target.closest("#hero-play") || e.target.closest("#quick-match")) { Sound.click(); openSetup(); return; }
      if (e.target.closest("#cup-match")) { Sound.click(); openCup(); return; }
      if (e.target.closest("#daily-claim") || e.target.closest("#daily-btn")) {
        const res = S.dailyClaim();
        if (res.ok) { Sound.win(); render(); toast(`Điểm danh thành công: <b>+750 xu</b>`); }
        else { Sound.click(); toast("Hôm nay bạn đã nhận thưởng rồi."); }
        return;
      }
      const packBtn = e.target.closest("[data-pack]");
      if (packBtn) { Sound.click(); openPackFlow(packBtn.dataset.pack); return; }
      const formBtn = e.target.closest("[data-formation]");
      if (formBtn) { S.setFormation(formBtn.dataset.formation); Sound.select(); render(); return; }
      if (e.target.closest("#auto-squad")) { S.autoSquad(); Sound.select(); render(); toast("Đã chọn đội hình mạnh nhất"); return; }
      if (e.target.closest("#squad-play")) { Sound.click(); openSetup(); return; }
      const slot = e.target.closest("[data-slot]");
      if (slot) { openSlotPicker(Number(slot.dataset.slot)); return; }
      const detail = e.target.closest("[data-player-detail]");
      if (detail) { openPlayerDetail(detail.dataset.playerDetail); return; }
      const setSound = e.target.closest("#setting-sound") || e.target.closest("#sound-toggle");
      if (setSound) {
        const st = S.getState();
        st.settings.sound = st.settings.sound === false;
        S.changed();
        Sound.setEnabled(st.settings.sound);
        renderSound(st);
        toast(st.settings.sound ? "Đã bật âm thanh" : "Đã tắt âm thanh");
        if (st.settings.sound) Sound.click();
        return;
      }
      if (e.target.closest("#setting-reset")) {
        const m = openModal(`<div class="modal-head"><span class="slash"></span><div><div class="modal-title">XÓA DỮ LIỆU?</div><div class="modal-sub">Toàn bộ đội hình, xu và thành tích sẽ bị xóa. Không thể hoàn tác.</div></div></div>
          <div class="modal-actions"><button class="btn btn-ghost" data-close>HỦY</button><button class="btn btn-primary" id="confirm-reset" style="background:linear-gradient(135deg,#ff8a94,#ff4f5e);color:#1a0407">XÓA HẾT</button></div>`);
        m.addEventListener("click", (ev) => {
          if (ev.target.closest("#confirm-reset")) {
            S.reset();
            render();
            closeModal();
            navigate("home");
            toast("Đã đặt lại dữ liệu");
          }
        });
        return;
      }
      if (e.target.closest("#sound-toggle")) return;
    });

    // endless hover shine on hero cannot be done by CSS, add subtle pointer tilt
    const hero = $(".hero-card-wrap");
    if (hero && window.matchMedia("(pointer:fine)").matches) {
      hero.addEventListener("pointermove", (e) => {
        const card = $("#hero-card");
        if (!card) return;
        const r = hero.getBoundingClientRect();
        const dx = (e.clientX - r.left) / r.width - 0.5;
        const dy = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `rotateY(${dx * 16}deg) rotateX(${-dy * 12}deg) translateZ(8px)`;
      });
      hero.addEventListener("pointerleave", () => {
        const card = $("#hero-card");
        if (card) card.style.transform = "";
      });
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && window.FCN.app && window.FCN.app.autoPause) window.FCN.app.autoPause();
    });
  }

  window.FCN.ui = {
    init, render, navigate, openModal, closeModal, toast, openSetup, openCup,
    showPause, showResult, showHalftime, hideOverlay, openPackFlow, playerCard,
    resultHandler, get currentScreen() { return currentScreen; }
  };
})();
