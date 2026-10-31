/* ============================================================
   FC NOVA — save state, squad logic, packs, progression
   ============================================================ */
(function () {
  "use strict";
  const D = window.FCN.data;
  const KEY = "fcnova.save.v1";
  const clone = (o) => JSON.parse(JSON.stringify(o));

  const POS_FAMILY = {
    GK: "GK",
    CB: "DEF", LB: "DEF", RB: "DEF", LWB: "DEF", RWB: "DEF",
    CDM: "MID", CM: "MID", CAM: "MID", LM: "MID", RM: "MID",
    LW: "ATT", RW: "ATT", ST: "ATT"
  };
  const POS_RELATED = {
    CB: ["CDM"], LB: ["LWB", "LM"], RB: ["RWB", "RM"], LWB: ["LB", "LM"], RWB: ["RB", "RM"],
    CDM: ["CM", "CB"], CM: ["CDM", "CAM"], CAM: ["CM", "LM", "RM", "ST"],
    LM: ["LW", "LWB", "CM"], RM: ["RW", "RWB", "CM"],
    LW: ["LM", "ST", "CAM"], RW: ["RM", "ST", "CAM"], ST: ["LW", "RW", "CAM"]
  };

  function fitScore(playerPos, slotPos) {
    if (playerPos === slotPos) return 1;
    if ((playerPos === "GK") !== (slotPos === "GK")) return 0.35;
    if (POS_FAMILY[playerPos] === POS_FAMILY[slotPos]) return 0.9;
    if ((POS_RELATED[playerPos] || []).includes(slotPos)) return 0.82;
    return 0.64;
  }

  function autoPick(collection, formationKey) {
    const slots = D.FORMATIONS[formationKey].slots;
    const used = new Set();
    const result = new Array(slots.length).fill(null);
    const order = slots.map((s, i) => i).sort((a, b) => {
      const pa = slots[a].pos === "GK" ? 0 : 1;
      const pb = slots[b].pos === "GK" ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return 0;
    });
    for (const idx of order) {
      const slot = slots[idx];
      let best = null;
      let bestScore = -1;
      for (const p of collection) {
        if (used.has(p.id)) continue;
        const score = p.ovr * 0.82 + fitScore(p.pos, slot.pos) * 22;
        if (score > bestScore) { bestScore = score; best = p; }
      }
      if (best) { result[idx] = best.id; used.add(best.id); }
    }
    // fill remaining slots with best unused
    const rest = collection.filter((p) => !used.has(p.id)).sort((a, b) => b.ovr - a.ovr);
    for (let i = 0; i < result.length; i++) {
      if (!result[i] && rest.length) result[i] = rest.shift().id;
    }
    return result;
  }

  function squadOverall(state) {
    const ids = state.squad.filter(Boolean);
    if (!ids.length) return 0;
    return Math.round(ids.reduce((sum, id) => {
      const p = state.collection.find((c) => c.id === id);
      return sum + (p ? p.ovr : 0);
    }, 0) / ids.length);
  }

  function squadBreakdown(state) {
    const slots = D.FORMATIONS[state.formation].slots;
    const groups = { atk: [], mid: [], def: [] };
    state.squad.forEach((id, i) => {
      const p = state.collection.find((c) => c.id === id);
      if (!p) return;
      const fam = POS_FAMILY[slots[i] ? slots[i].pos : p.pos];
      if (fam === "ATT") groups.atk.push(p.ovr);
      else if (fam === "MID") groups.mid.push(p.ovr);
      else if (fam === "DEF") groups.def.push(p.ovr);
      else groups.def.push(p.ovr * 0.6);
    });
    const avg = (a) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0;
    return { atk: avg(groups.atk), mid: avg(groups.mid), def: avg(groups.def) };
  }

  function defaultState() {
    const collection = D.STARTER_IDS.map((id) => clone(D.PLAYER_BY_ID[id])).filter(Boolean);
    const state = {
      v: 1,
      coins: 3200,
      gems: 60,
      xp: 0,
      trophies: 0,
      packsOpened: 0,
      bestWinGoals: 0,
      collection,
      formation: "4-3-3",
      squad: [],
      record: { w: 0, d: 0, l: 0, gf: 0, ga: 0 },
      settings: { sound: true },
      lastDaily: null,
      cup: null,
      createdAt: Date.now()
    };
    state.squad = autoPick(collection, state.formation);
    return state;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.collection)) return defaultState();
      const base = defaultState();
      const s = Object.assign(base, parsed);
      s.settings = Object.assign({ sound: true }, parsed.settings || {});
      s.record = Object.assign({ w: 0, d: 0, l: 0, gf: 0, ga: 0 }, parsed.record || {});
      if (!D.FORMATIONS[s.formation]) s.formation = "4-3-3";
      // repair squad
      const ids = new Set(s.collection.map((p) => p.id));
      if (!Array.isArray(s.squad) || s.squad.length !== 11) s.squad = autoPick(s.collection, s.formation);
      s.squad = s.squad.map((id) => (ids.has(id) ? id : null));
      if (s.squad.filter(Boolean).length < 11) s.squad = autoPick(s.collection, s.formation);
      return s;
    } catch (e) {
      console.warn("save load failed", e);
      return defaultState();
    }
  }

  let state = load();
  const listeners = new Set();

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
  }
  function changed() {
    save();
    listeners.forEach((fn) => { try { fn(state); } catch (e) { console.error(e); } });
  }
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function getState() { return state; }

  function getPlayer(id) { return state.collection.find((p) => p.id === id) || null; }
  function getSquadPlayers() {
    const slots = D.FORMATIONS[state.formation].slots;
    return slots.map((slot, i) => ({ slot, player: getPlayer(state.squad[i]) }));
  }
  function benchPlayers() {
    const inSquad = new Set(state.squad);
    return state.collection.filter((p) => !inSquad.has(p.id)).sort((a, b) => b.ovr - a.ovr);
  }

  function setFormation(key) {
    if (!D.FORMATIONS[key]) return;
    state.formation = key;
    state.squad = autoPick(state.collection, key);
    changed();
  }

  function autoSquad() {
    state.squad = autoPick(state.collection, state.formation);
    changed();
  }

  function setSlot(index, playerId) {
    if (index < 0 || index > 10) return;
    if (!getPlayer(playerId)) return;
    const existing = state.squad.indexOf(playerId);
    if (existing === index) return;
    if (existing >= 0) {
      const tmp = state.squad[index];
      state.squad[index] = playerId;
      state.squad[existing] = tmp;
    } else {
      state.squad[index] = playerId;
    }
    changed();
  }

  function addCoins(n) { state.coins = Math.max(0, state.coins + n); changed(); }
  function addGems(n) { state.gems = Math.max(0, state.gems + n); changed(); }

  function canAfford(pack) { return state.coins >= pack.price; }

  function openPack(pack) {
    if (state.coins < pack.price) return { ok: false, reason: "coins" };
    state.coins -= pack.price;
    const owned = new Set(state.collection.map((p) => p.id));
    const cards = [];
    for (let i = 0; i < pack.count; i++) {
      let candidates = D.PLAYER_POOL.filter((p) => p.ovr >= pack.min && p.ovr <= pack.max && !owned.has(p.id));
      let player;
      if (candidates.length) {
        // prefer the higher end a little
        candidates.sort((a, b) => b.ovr - a.ovr);
        const pool = candidates.slice(0, Math.max(1, Math.ceil(candidates.length * 0.7)));
        player = clone(pool[Math.floor(Math.random() * pool.length)]);
      } else {
        player = D.generatePlayer(pack.min + Math.random() * (pack.max - pack.min), null);
        player.club = "NOVA FC";
      }
      // widen a touch: small chance of a surprise elite
      if (Math.random() < 0.04 + (pack.id === "elite" ? 0.25 : 0)) {
        const boost = D.generatePlayer(Math.min(90, pack.max + 4), player.pos);
        boost.name = player.name;
        player = boost;
      }
      owned.add(player.id);
      state.collection.push(player);
      cards.push(player);
    }
    state.packsOpened = (state.packsOpened || 0) + 1;
    changed();
    return { ok: true, cards };
  }

  function dailyClaim() {
    const today = new Date().toISOString().slice(0, 10);
    if (state.lastDaily === today) return { ok: false };
    state.lastDaily = today;
    state.coins += 750;
    changed();
    return { ok: true, amount: 750 };
  }
  function dailyAvailable() {
    return state.lastDaily !== new Date().toISOString().slice(0, 10);
  }

  function recordMatch({ goalsFor, goalsAgainst, won, drawn, extraTrophies }) {
    state.record.gf += goalsFor;
    state.record.ga += goalsAgainst;
    if (won) state.record.w++;
    else if (drawn) state.record.d++;
    else state.record.l++;
    if (won) state.bestWinGoals = Math.max(state.bestWinGoals || 0, goalsFor - goalsAgainst);
    const coins = won ? 900 + goalsFor * 80 : drawn ? 450 + goalsFor * 50 : 200 + goalsFor * 30;
    const xp = won ? 200 + goalsFor * 12 : drawn ? 110 + goalsFor * 8 : 55 + goalsFor * 6;
    state.coins += coins;
    state.xp += xp;
    if (extraTrophies) state.trophies += extraTrophies;
    changed();
    return { coins, xp };
  }

  function levelInfo() {
    const level = Math.floor(state.xp / 1000) + 1;
    const into = state.xp % 1000;
    const ranks = ["Tân binh", "HLV tập sự", "HLV chuyên nghiệp", "Chiến lược gia", "Bậc thầy chiến thuật", "Huyền thoại"];
    return { level, into, need: 1000, rank: ranks[Math.min(ranks.length - 1, Math.floor((level - 1) / 2))] };
  }

  function achievements() {
    const r = state.record;
    const wins = r.w;
    const best = state.collection.reduce((a, p) => Math.max(a, p.ovr), 0);
    const ovr = squadOverall(state);
    return [
      { id: "first", icon: "ball", title: "Trận đầu ra sân", desc: "Hoàn thành trận đấu đầu tiên", done: r.w + r.d + r.l >= 1 },
      { id: "win5", icon: "trophy", title: "Chuỗi ngày chiến thắng", desc: "Thắng 5 trận", done: wins >= 5 },
      { id: "goals25", icon: "bolt", title: "Cơn lốc tấn công", desc: "Ghi 25 bàn thắng", done: r.gf >= 25 },
      { id: "elite", icon: "shield", title: "Ngôi sao tinh anh", desc: "Sở hữu cầu thủ 85+ OVR", done: best >= 85 },
      { id: "ovr80", icon: "squad", title: "Đội hình trong mơ", desc: "Đạt độ mạnh đội hình 80", done: ovr >= 80 },
      { id: "cup", icon: "trophy", title: "Nhà vô địch", desc: "Vô địch Cúp Nova", done: state.trophies >= 1 },
      { id: "packs10", icon: "store", title: "Tay chơi chuyển nhượng", desc: "Mở 10 gói cầu thủ", done: (state.packsOpened || 0) >= 10 },
      { id: "bigwin", icon: "ball", title: "Đại thắng", desc: "Thắng với cách biệt 3 bàn", done: (state.bestWinGoals || 0) >= 3 }
    ];
  }

  function reset() {
    state = defaultState();
    changed();
    return state;
  }

  window.FCN.store = {
    getState, getPlayer, getSquadPlayers, benchPlayers, squadOverall, squadBreakdown,
    setFormation, autoSquad, setSlot, autoPick, openPack, canAfford, addCoins, addGems,
    dailyClaim, dailyAvailable, recordMatch, levelInfo, achievements, reset, save, changed, onChange,
    fitScore, POS_FAMILY
  };
})();
