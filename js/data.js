/* ============================================================
   FC NOVA — data: players, formations, teams, packs
   ============================================================ */
(function () {
  "use strict";

  const POSITIONS = ["GK", "LB", "CB", "RB", "LWB", "RWB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "ST"];

  const FORMATIONS = {
    "4-3-3": {
      name: "4-3-3",
      slots: [
        { pos: "GK", x: 50, y: 91 },
        { pos: "LB", x: 13, y: 74 },
        { pos: "CB", x: 35, y: 77 },
        { pos: "CB", x: 65, y: 77 },
        { pos: "RB", x: 87, y: 74 },
        { pos: "CM", x: 27, y: 54 },
        { pos: "CM", x: 50, y: 59 },
        { pos: "CM", x: 73, y: 54 },
        { pos: "LW", x: 15, y: 30 },
        { pos: "ST", x: 50, y: 22 },
        { pos: "RW", x: 85, y: 30 }
      ]
    },
    "4-2-3-1": {
      name: "4-2-3-1",
      slots: [
        { pos: "GK", x: 50, y: 91 },
        { pos: "LB", x: 13, y: 74 },
        { pos: "CB", x: 35, y: 77 },
        { pos: "CB", x: 65, y: 77 },
        { pos: "RB", x: 87, y: 74 },
        { pos: "CDM", x: 35, y: 58 },
        { pos: "CDM", x: 65, y: 58 },
        { pos: "LM", x: 14, y: 38 },
        { pos: "CAM", x: 50, y: 42 },
        { pos: "RM", x: 86, y: 38 },
        { pos: "ST", x: 50, y: 20 }
      ]
    },
    "3-5-2": {
      name: "3-5-2",
      slots: [
        { pos: "GK", x: 50, y: 91 },
        { pos: "CB", x: 26, y: 78 },
        { pos: "CB", x: 50, y: 81 },
        { pos: "CB", x: 74, y: 78 },
        { pos: "LWB", x: 9, y: 56 },
        { pos: "CM", x: 35, y: 57 },
        { pos: "CM", x: 50, y: 52 },
        { pos: "CM", x: 65, y: 57 },
        { pos: "RWB", x: 91, y: 56 },
        { pos: "ST", x: 38, y: 24 },
        { pos: "ST", x: 62, y: 24 }
      ]
    }
  };

  const NATIONS = {
    VIE: "Việt Nam", BRA: "Brasil", ARG: "Argentina", FRA: "Pháp", ENG: "Anh", ESP: "Tây Ban Nha",
    POR: "Bồ Đào Nha", GER: "Đức", ITA: "Ý", NED: "Hà Lan", JPN: "Nhật Bản", KOR: "Hàn Quốc",
    MAR: "Maroc", SEN: "Sénégal", NGA: "Nigeria", CRO: "Croatia", SRB: "Serbia", SWE: "Thụy Điển",
    NOR: "Na Uy", DEN: "Đan Mạch", MEX: "Mexico", USA: "Mỹ", COL: "Colombia", URU: "Uruguay",
    GHA: "Ghana", EGY: "Ai Cập", ALG: "Algeria", AUS: "Úc", CAN: "Canada", BEL: "Bỉ",
    SUI: "Thụy Sĩ", TUR: "Thổ Nhĩ Kỳ", MLI: "Mali", IRL: "Ireland", PAK: "Pakistan", TUN: "Tunisia", CZE: "Séc"
  };

  const RARITY_LABEL = { bronze: "Đồng", silver: "Bạc", gold: "Vàng", elite: "Tinh anh", legend: "Huyền thoại" };

  function rarityFor(ovr) {
    if (ovr >= 91) return "legend";
    if (ovr >= 85) return "elite";
    if (ovr >= 75) return "gold";
    if (ovr >= 67) return "silver";
    return "bronze";
  }

  // deterministic tiny rng
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const ROLE_BIAS = {
    GK: { pac: -22, sho: -35, pas: -6, dri: -18, def: 4, phy: 4 },
    CB: { pac: -4, sho: -20, pas: -3, dri: -9, def: 9, phy: 8 },
    LB: { pac: 6, sho: -9, pas: 4, dri: 2, def: 4, phy: -1 },
    RB: { pac: 6, sho: -9, pas: 4, dri: 2, def: 4, phy: -1 },
    LWB: { pac: 9, sho: -7, pas: 5, dri: 4, def: 2, phy: -3 },
    RWB: { pac: 9, sho: -7, pas: 5, dri: 4, def: 2, phy: -3 },
    CDM: { pac: -2, sho: -7, pas: 5, dri: 0, def: 8, phy: 7 },
    CM: { pac: 0, sho: 0, pas: 8, dri: 5, def: 2, phy: 2 },
    CAM: { pac: 4, sho: 7, pas: 9, dri: 9, def: -9, phy: -3 },
    LM: { pac: 8, sho: 2, pas: 4, dri: 8, def: -5, phy: -3 },
    RM: { pac: 8, sho: 2, pas: 4, dri: 8, def: -5, phy: -3 },
    LW: { pac: 10, sho: 8, pas: 3, dri: 10, def: -12, phy: -5 },
    RW: { pac: 10, sho: 8, pas: 3, dri: 10, def: -12, phy: -5 },
    ST: { pac: 7, sho: 12, pas: -4, dri: 5, def: -13, phy: 4 }
  };

  const GK_BIAS = { div: 6, han: 5, kic: 0, ref: 6, spd: -4, pos: 5 };

  const SKIN = ["#f1c9a5", "#e0ad7f", "#c68b5c", "#a96f44", "#7c4b2b", "#5a3620", "#f3d4b5"];
  const HAIR = ["#1b1b1b", "#31201a", "#5a3a22", "#a9702a", "#d9b45c", "#2b2b2b", "#6b3d24"];

  function buildStats(ovr, pos, seed) {
    const rnd = mulberry(seed);
    if (pos === "GK") {
      const out = {};
      for (const k in GK_BIAS) {
        out[k] = clamp(Math.round(ovr + GK_BIAS[k] + (rnd() * 10 - 5)), 38, 99);
      }
      return out;
    }
    const bias = ROLE_BIAS[pos] || ROLE_BIAS.CM;
    const out = {};
    for (const k in bias) out[k] = clamp(Math.round(ovr + bias[k] + (rnd() * 12 - 6)), 32, 99);
    return out;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function makePlayer({ id, name, pos, ovr, nation, seed, number, club }) {
    const s = seed || hash(id + name + pos);
    const rnd = mulberry(s);
    return {
      id, name, pos, ovr,
      nation: nation || "BRA",
      rarity: rarityFor(ovr),
      stats: buildStats(ovr, pos, s),
      number: number || (Math.floor(rnd() * 40) + 1),
      skin: SKIN[Math.floor(rnd() * SKIN.length)],
      hair: HAIR[Math.floor(rnd() * HAIR.length)],
      hairStyle: Math.floor(rnd() * 4),
      club: club || "NOVA FC"
    };
  }

  const CURATED = [
    // elite
    ["c01", "R. Duarte", "ST", 89, "BRA"],
    ["c02", "K. Mensah", "LW", 88, "FRA"],
    ["c03", "L. Moretti", "CM", 87, "ITA"],
    ["c04", "A. Castillo", "RW", 87, "ARG"],
    ["c05", "N. Petrov", "CB", 86, "CRO"],
    ["c06", "D. Nakamura", "CAM", 85, "JPN"],
    ["c07", "Y. Haddad", "ST", 85, "MAR"],
    ["c08", "O. Lindberg", "GK", 86, "SWE"],
    // gold
    ["c09", "M. Santos", "RB", 82, "BRA"],
    ["c10", "J. Bakker", "CB", 81, "NED"],
    ["c11", "E. Okafor", "CDM", 81, "NGA"],
    ["c12", "S. Kim", "LM", 80, "KOR"],
    ["c13", "T. Ferreira", "CAM", 80, "POR"],
    ["c14", "E. Novak", "CM", 79, "CZE"],
    ["c15", "K. Benali", "LW", 79, "ALG"],
    ["c16", "M. Rossi", "LB", 78, "ITA"],
    ["c17", "S. Osei", "ST", 78, "GHA"],
    ["c18", "F. Andersen", "GK", 78, "DEN"],
    ["c19", "Đ. Minh Long", "CM", 77, "VIE"],
    ["c20", "L. Fernández", "CB", 77, "URU"],
    ["c21", "N. Williams", "RM", 76, "ENG"],
    ["c22", "A. Bouzid", "RW", 76, "TUN"],
    ["c23", "P. Jovanović", "CB", 75, "SRB"],
    // silver
    ["c24", "N. Hoàng Nam", "CAM", 72, "VIE"],
    ["c25", "C. Reed", "CM", 71, "ENG"],
    ["c26", "D. Álvarez", "LB", 71, "MEX"],
    ["c27", "J. Weber", "GK", 70, "GER"],
    ["c28", "R. Aziz", "CDM", 70, "EGY"],
    ["c29", "T. Brooks", "RB", 69, "USA"],
    ["c30", "I. Horvat", "ST", 69, "CRO"],
    ["c31", "S. Mori", "LW", 68, "JPN"],
    ["c32", "A. Keita", "RW", 68, "MLI"],
    ["c33", "B. Tavares", "CB", 67, "POR"],
    ["c34", "L. O'Connor", "CM", 67, "IRL"],
    // bronze
    ["c35", "E. Lund", "CB", 65, "NOR"],
    ["c36", "H. Demir", "ST", 65, "TUR"],
    ["c37", "P. Giménez", "RB", 64, "ESP"],
    ["c38", "S. Khan", "GK", 63, "PAK"],
    ["c39", "L. Meyer", "LM", 62, "GER"],
    ["c40", "T. Văn Hùng", "RM", 61, "VIE"],
    ["c41", "N. Brown", "CM", 60, "CAN"],
    ["c42", "I. Molina", "LB", 60, "ESP"]
  ].map(([id, name, pos, ovr, nation]) => makePlayer({ id, name, pos, ovr, nation }));

  const PLAYER_POOL = CURATED;
  const PLAYER_BY_ID = Object.fromEntries(CURATED.map((p) => [p.id, p]));

  // starting collection: a competitive but improvable squad
  const STARTER_IDS = ["c18", "c16", "c20", "c23", "c09", "c11", "c14", "c19", "c15", "c17", "c21", "c24", "c25", "c28", "c30", "c32", "c37", "c40", "c39", "c41"];

  const FIRST_NAMES = ["Lucas", "Mateo", "Noah", "Ethan", "Ivan", "Karim", "Diego", "Lorenzo", "Tomas", "Rafael", "Milan", "Omar", "Yuki", "Hugo", "Sami", "Andre", "Felix", "Nico", "Bruno", "Emre", "Kaito", "Adam", "Jonas", "Rui", "Dani", "Leo", "Marco", "Kofi", "Ismail", "Aron"];
  const LAST_NAMES = ["Varela", "Nkosi", "Silva", "Moreau", "Kovač", "Farah", "Mendes", "Ito", "Bauer", "Traoré", "Gil", "Pires", "Kang", "Haaland", "Ozil", "Costa", "Marsh", "Dembélé", "Rossi", "Sato", "Almeida", "Mbeki", "Hansen", "Reyes", "Kaur", "Duval", "Turan", "Weiss", "Bianchi", "Osei"];
  let genCounter = 0;

  function generatePlayer(targetOvr, pos) {
    const rnd = mulberry((Date.now() ^ (genCounter++ * 2654435761)) >>> 0);
    const name = FIRST_NAMES[Math.floor(rnd() * FIRST_NAMES.length)][0] + ". " + LAST_NAMES[Math.floor(rnd() * LAST_NAMES.length)];
    const ovr = clamp(Math.round(targetOvr + (rnd() * 4 - 2)), 55, 92);
    const nationKeys = Object.keys(NATIONS);
    const position = pos || POSITIONS[Math.floor(rnd() * POSITIONS.length)];
    return makePlayer({
      id: "g" + Date.now().toString(36) + Math.floor(rnd() * 9999).toString(36),
      name, pos: position, ovr, nation: nationKeys[Math.floor(rnd() * nationKeys.length)]
    });
  }

  const TEAMS = {
    nova: { key: "nova", name: "NOVA FC", short: "NOVA", crest: "N", color: "#c8ff2e", color2: "#0b1207", text: "#0a1004", ovr: 76 },
    raven: { key: "raven", name: "RAVEN FC", short: "RAVEN", crest: "R", color: "#ff4f5e", color2: "#16080b", text: "#16080b", ovr: 72, style: "cân bằng" },
    atlas: { key: "atlas", name: "ATLAS CITY", short: "ATLAS", crest: "A", color: "#5da7ff", color2: "#071224", text: "#06101e", ovr: 78, style: "kiểm soát" },
    aurora: { key: "aurora", name: "AURORA SC", short: "AURORA", crest: "A", color: "#b072ff", color2: "#120822", text: "#120822", ovr: 82, style: "tấn công" },
    titan: { key: "titan", name: "TITAN UTD", short: "TITAN", crest: "T", color: "#ff9f2e", color2: "#1d0e02", text: "#1d0e02", ovr: 85, style: "áp đặt" }
  };

  const OPPONENTS = [
    { team: "raven", ovr: 72, label: "Dễ", difficulty: "easy" },
    { team: "atlas", ovr: 78, label: "Thường", difficulty: "normal" },
    { team: "aurora", ovr: 82, label: "Khó", difficulty: "hard" },
    { team: "titan", ovr: 85, label: "Ác mộng", difficulty: "insane" }
  ];

  const DIFFICULTIES = {
    easy: { name: "DỄ", sub: "AI chậm", speed: 0.82, react: 0.55, press: 0.6, keeper: 0.82, aggression: 0.7 },
    normal: { name: "THƯỜNG", sub: "Cân bằng", speed: 0.96, react: 0.8, press: 0.85, keeper: 0.95, aggression: 1 },
    hard: { name: "KHÓ", sub: "AI nhanh", speed: 1.05, react: 1.05, press: 1.05, keeper: 1.08, aggression: 1.25 },
    insane: { name: "ÁC MỘNG", sub: "Rất khó", speed: 1.12, react: 1.25, press: 1.2, keeper: 1.18, aggression: 1.45 }
  };

  const PACKS = [
    {
      id: "starter", name: "GÓI KHỞI ĐẦU", tag: "TÂN BINH", price: 600, count: 3, min: 62, max: 71,
      desc: "3 cầu thủ · Đồng → Bạc", color: "#d2915b", color2: "#7a4126",
      bg: "linear-gradient(160deg,#3a2418,#141019)", glow: "rgba(210,145,91,.4)"
    },
    {
      id: "silver", name: "GÓI BẠC", tag: "TIẾT KIỆM", price: 1600, count: 3, min: 68, max: 77,
      desc: "3 cầu thủ · Bạc → Vàng", color: "#dbe4ee", color2: "#59636f",
      bg: "linear-gradient(160deg,#2a3442,#0f141c)", glow: "rgba(219,228,238,.4)"
    },
    {
      id: "gold", name: "GÓI VÀNG", tag: "PHỔ BIẾN", price: 3800, count: 3, min: 74, max: 84,
      desc: "3 cầu thủ · Vàng → Tinh anh", color: "#ffe27a", color2: "#c99114",
      bg: "linear-gradient(160deg,#3a2b0c,#14110a)", glow: "rgba(255,204,77,.5)", featured: true
    },
    {
      id: "elite", name: "GÓI TINH ANH", tag: "CAO CẤP", price: 9500, count: 2, min: 82, max: 90,
      desc: "2 cầu thủ · Tinh anh trở lên", color: "#b072ff", color2: "#00c8ff",
      bg: "linear-gradient(160deg,#241040,#0a1020)", glow: "rgba(160,107,255,.55)"
    }
  ];

  const NEWS = [
    ["CÚP NOVA mở đăng ký", "3 trận loại trực tiếp, thưởng lớn cho nhà vô địch."],
    ["Cầu thủ tuần này", "R. Duarte (89) đang dẫn đầu bảng xếp hạng phong độ."],
    ["Mẹo nhỏ", "Giữ nút SÚT để tích lực, thả ra đúng lúc để có cú đá hiểm."],
    ["Đội hình gợi ý", "Dùng nút TỰ ĐỘNG CHỌN để tối ưu độ mạnh nhanh chóng."]
  ];

  window.FCN = window.FCN || {};
  window.FCN.data = {
    POSITIONS, FORMATIONS, RARITY_LABEL, rarityFor, NATIONS, TEAMS, OPPONENTS, DIFFICULTIES, PACKS, NEWS,
    PLAYER_POOL, PLAYER_BY_ID, STARTER_IDS, generatePlayer, makePlayer, clamp, mulberry, hash
  };
})();
