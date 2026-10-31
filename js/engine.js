/* ============================================================
   FC NOVA — 11v11 football engine + pseudo-3D renderer
   ============================================================ */
(function () {
  "use strict";
  const D = window.FCN.data;
  const S = window.FCN.store;
  const Sound = window.FCN.sound;
  const TAU = Math.PI * 2;

  const PITCH_W = 68;
  const PITCH_L = 104;
  const HALF_L = 52;
  const GOAL_HALF = 3.66;
  const GOAL_H = 2.44;
  const MATCH_SECONDS = 180; // real seconds -> 90'
  const HALF_AT = MATCH_SECONDS / 2;
  const NEAR = 0.55;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const len = (x, z) => Math.hypot(x, z);
  const norm = (x, z) => { const l = len(x, z) || 1; return { x: x / l, z: z / l }; };
  const dot = (ax, az, bx, bz) => ax * bx + az * bz;

  function slotWorld(slot, side) {
    const x = (slot.x / 100 - 0.5) * PITCH_W;
    const depth = ((100 - slot.y) / 100) * PITCH_L;
    return { x, z: side === 1 ? depth : PITCH_L - depth };
  }

  function lum(hex) {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  }
  function ink(hex) { return lum(hex) > 0.58 ? "#0a1014" : "#f6fbff"; }
  function shade(hex, amt) {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
    else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
    return "#" + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");
  }

  class Match {
    constructor(canvas, config, hooks) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.config = config;
      this.hooks = hooks || {};
      this.team = D.TEAMS.nova;
      this.opp = D.TEAMS[config.team] || D.TEAMS.raven;
      this.opponent = D.OPPONENTS.find((o) => o.team === config.team) || D.OPPONENTS[0];
      this.diff = D.DIFFICULTIES[config.difficulty] || D.DIFFICULTIES.normal;
      this.oppOvr = this.opponent.ovr;

      this.state = "intro";
      this.paused = false;
      this.running = false;
      this.ended = false;
      this.elapsed = 0;
      this.time = 0;
      this.halfDone = false;
      this.freeze = 0;
      this.stateTimer = 0;
      this.restartTimer = 0;
      this.restartInfo = null;
      this.shotLock = 0;
      this.switchLock = 0;
      this.switchCd = 0;
      this.active = null;
      this.lastHud = -1;
      this.score = { home: 0, away: 0 };
      this.stats = { shots: 0, onTarget: 0, passes: 0, tackles: 0, saves: 0, possHome: 0, possAway: 0, lastOwner: "home" };
      this.particles = [];
      this.shake = 0;
      this.camera = { x: 0, y: 15.5, z: 28 };
      this.look = { x: 0, y: 1.1, z: 58 };
      this.focal = 700;
      this.players = [];
      this.ball = { x: 0, z: HALF_L, h: 0.11, vx: 0, vz: 0, vy: 0, owner: null, lastTouch: null, lastTeam: "home", lock: 0, kicker: null, rot: 0, saveTried: false };
      this.input = { x: 0, z: 0, sprint: false };
      this.stick = { x: 0, z: 0 };
      this.sprintHeld = false;
      this.pendingPass = false;
      this.pendingTackle = false;
      this.shootCharging = false;
      this.shootPower = 0;
      this.shootRelease = null;
      this.keys = {};
      this.bannerTimer = null;
      this.commTimer = null;
      this.lastComment = 0;
      this.crowdSeed = Array.from({ length: 150 }, () => ({ x: -52 + Math.random() * 104, y: 2.2 + Math.random() * 8.6, c: Math.random() }));

      this.buildTeams();
      this.bindControls();
      this.resize();
      this.updateHUD(true);
      this.showBanner("KICK OFF", `${this.team.name} · HIỆP 1`, "info", 1600);
      this.setActive(this.homeKicker);
      Sound.crowdOn();
    }

    /* ---------------- team setup ---------------- */
    buildTeams() {
      this.players = [];
      this.homeKicker = null;
      this.awayKicker = null;
      const st = S.getState();
      const homeFormation = D.FORMATIONS[st.formation] || D.FORMATIONS["4-3-3"];
      const homeSquad = S.getSquadPlayers();
      const homeKit = {
        shirt: this.team.color, shirt2: shade(this.team.color, -0.18), shorts: "#0a1208",
        socks: this.team.color, gkShirt: "#ff9f2e", gkShorts: "#1b1b1b", gkSocks: "#ff9f2e"
      };
      const awayKit = {
        shirt: this.opp.color, shirt2: shade(this.opp.color, -0.2), shorts: this.opp.color2,
        socks: this.opp.color, gkShirt: "#5ee7ff", gkShorts: "#0d1520", gkSocks: "#5ee7ff"
      };
      homeFormation.slots.forEach((slot, i) => {
        const row = homeSquad[i];
        let p = row && row.player;
        if (!p) {
          p = D.generatePlayer(70, slot.pos);
          p.name = "NOVA " + (i + 1);
        }
        this.players.push(this.makePlayer(p, slot, 1, homeKit, "home"));
      });
      const awaySlots = D.FORMATIONS["4-3-3"].slots;
      awaySlots.forEach((slot, i) => {
        const roleBonus = slot.pos === "GK" ? 1 : ["CB", "LB", "RB"].includes(slot.pos) ? -3 : ["ST", "LW", "RW"].includes(slot.pos) ? 3 : 0;
        const target = this.oppOvr + roleBonus + (Math.random() * 4 - 2);
        const p = D.generatePlayer(clamp(target, 58, 91), slot.pos);
        p.club = this.opp.name;
        this.players.push(this.makePlayer(p, slot, -1, awayKit, "away"));
      });
      // active + kickoff takers
      const homeOut = this.players.filter((p) => p.team === "home" && !p.isGK);
      const awayOut = this.players.filter((p) => p.team === "away" && !p.isGK);
      this.homeKicker = homeOut.slice().sort((a, b) => dist(a, { x: 0, z: HALF_L }) - dist(b, { x: 0, z: HALF_L }))[0];
      this.awayKicker = awayOut.slice().sort((a, b) => dist(a, { x: 0, z: HALF_L }) - dist(b, { x: 0, z: HALF_L }))[0];
      this.resetPositions(this.homeKicker);
    }

    makePlayer(data, slot, side, kit, team) {
      const isGK = slot.pos === "GK";
      const base = slotWorld(slot, side);
      const pace = isGK ? (data.stats.spd || 65) : (data.stats.pac || 70);
      const ovr = data.ovr || 70;
      const speed = isGK ? 5.15 + pace * 0.006 : 5.75 + pace * 0.024 + (ovr - 70) * 0.008;
      return {
        id: (team === "home" ? "h" : "a") + this.players.length,
        data,
        name: data.name,
        num: data.number || this.players.length + 1,
        ovr,
        team,
        side,
        isGK,
        slotPos: slot.pos,
        base,
        x: base.x,
        z: base.z,
        vx: 0,
        vz: 0,
        dir: side === 1 ? 0 : Math.PI,
        speed,
        sprint: isGK ? 1.12 : 1.28,
        stamina: 100,
        anim: Math.random() * TAU,
        stun: 0,
        cd: 0,
        dribbleCd: 0,
        glove: isGK,
        kit: isGK ? { ...kit, shirt: kit.gkShirt, shirt2: shade(kit.gkShirt, -0.18), shorts: kit.gkShorts, socks: kit.gkSocks } : kit,
        skin: data.skin || "#e0ad7f",
        hair: data.hair || "#1b1b1b",
        hairStyle: data.hairStyle || 0,
        stats: data.stats || {},
        isActive: false
      };
    }

    resetPositions(kicker) {
      for (const p of this.players) {
        const zLimit = p.side === 1 ? HALF_L - 1.4 : HALF_L + 1.4;
        p.x = p.base.x;
        p.z = p.base.z;
        if (p.isGK) p.z = p.side === 1 ? 4.2 : PITCH_L - 4.2;
        else if (p.side === 1) p.z = Math.min(p.z, zLimit);
        else p.z = Math.max(p.z, zLimit);
        p.vx = p.vz = 0;
        p.stun = 0;
        p.cd = 0;
        p.stamina = 100;
        p.dir = p.side === 1 ? 0 : Math.PI;
      }
      this.ball.x = 0;
      this.ball.z = HALF_L;
      this.ball.h = 0.11;
      this.ball.vx = this.ball.vz = this.ball.vy = 0;
      this.ball.owner = null;
      this.ball.lock = 0;
      this.ball.kicker = null;
      this.ball.rot = 0;
      this.ball.saveTried = false;
      const taker = kicker || this.homeKicker;
      if (taker) {
        taker.x = 0;
        taker.z = taker.side === 1 ? HALF_L - 0.7 : HALF_L + 0.7;
        taker.dir = taker.side === 1 ? 0 : Math.PI;
        this.ball.owner = taker;
        this.ball.lastTouch = taker;
        this.ball.lastTeam = taker.team;
        this.attachBall(taker);
        if (taker.team === "home") this.setActive(taker);
      }
    }

    setActive(p) {
      if (!p || p.team !== "home") return;
      if (this.active) this.active.isActive = false;
      this.active = p;
      p.isActive = true;
      this.switchLock = 0;
    }

    /* ---------------- controls ---------------- */
    bindControls() {
      this.ac = new AbortController();
      const signal = this.ac.signal;
      const zone = document.getElementById("stick-zone");
      const knob = document.getElementById("stick-knob");
      let stickId = null;
      let cx = 0, cy = 0, radius = 1;
      const resetStick = () => {
        stickId = null;
        this.stick.x = 0;
        this.stick.z = 0;
        if (knob) knob.style.transform = "translate(-50%,-50%)";
      };
      const moveStick = (e) => {
        const dx = e.clientX - cx, dy = e.clientY - cy;
        const d = Math.hypot(dx, dy);
        const max = radius;
        const cl = Math.min(1, d / max);
        const nx = d ? (dx / d) * cl : 0;
        const ny = d ? (dy / d) * cl : 0;
        const dead = 0.14;
        const mag = Math.hypot(nx, ny);
        if (mag < dead) { this.stick.x = 0; this.stick.z = 0; }
        else {
          const scaled = (mag - dead) / (1 - dead);
          const ux = nx / (mag || 1), uy = ny / (mag || 1);
          this.stick.x = ux * scaled;
          this.stick.z = -uy * scaled;
        }
        if (knob) knob.style.transform = `translate(calc(-50% + ${nx * max * 0.74}px), calc(-50% + ${ny * max * 0.74}px))`;
      };
      if (zone) {
        zone.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          stickId = e.pointerId;
          const r = zone.getBoundingClientRect();
          cx = r.left + r.width / 2;
          cy = r.top + r.height / 2;
          radius = r.width * 0.42;
          zone.setPointerCapture(e.pointerId);
          moveStick(e);
        }, { signal, passive: false });
        zone.addEventListener("pointermove", (e) => {
          if (e.pointerId !== stickId) return;
          e.preventDefault();
          moveStick(e);
        }, { signal, passive: false });
        const end = (e) => { if (e.pointerId === stickId) resetStick(); };
        zone.addEventListener("pointerup", end, { signal });
        zone.addEventListener("pointercancel", end, { signal });
      }

      const hold = (id, onDown, onUp) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          el.setPointerCapture(e.pointerId);
          el.classList.add("pressed");
          onDown && onDown();
        }, { signal, passive: false });
        const up = () => { el.classList.remove("pressed"); onUp && onUp(); };
        el.addEventListener("pointerup", up, { signal });
        el.addEventListener("pointercancel", up, { signal });
        el.addEventListener("lostpointercapture", up, { signal });
      };
      hold("btn-pass", () => { this.pendingPass = true; }, null);
      hold("btn-tackle", () => { this.pendingTackle = true; }, null);
      hold("btn-sprint", () => { this.sprintHeld = true; }, () => { this.sprintHeld = false; });
      hold("btn-shoot", () => {
        this.shootCharging = true;
        this.shootPower = 0;
        document.getElementById("btn-shoot")?.classList.add("charging");
      }, () => {
        if (!this.shootCharging) return;
        this.shootCharging = false;
        this.shootRelease = clamp(0.22 + this.shootPower, 0.22, 1);
        document.getElementById("btn-shoot")?.classList.remove("charging");
        const ring = document.getElementById("charge-ring");
        if (ring) ring.style.transform = "";
      });

      const pauseBtn = document.getElementById("match-pause");
      if (pauseBtn) pauseBtn.addEventListener("click", () => this.pause(), { signal });

      window.addEventListener("keydown", (e) => {
        const k = e.key.toLowerCase();
        if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
        this.keys[k] = true;
        if (k === "j") this.pendingPass = true;
        if (k === "l") this.pendingTackle = true;
        if (k === "k" && !this.shootCharging) {
          this.shootCharging = true;
          this.shootPower = 0;
          document.getElementById("btn-shoot")?.classList.add("charging");
        }
        if (k === "escape") this.pause();
      }, { signal });
      window.addEventListener("keyup", (e) => {
        const k = e.key.toLowerCase();
        this.keys[k] = false;
        if (k === "k") {
          this.shootCharging = false;
          this.shootRelease = clamp(0.22 + this.shootPower, 0.22, 1);
          document.getElementById("btn-shoot")?.classList.remove("charging");
        }
      }, { signal });

      const prevent = (e) => e.preventDefault();
      document.getElementById("match-root").addEventListener("contextmenu", prevent, { signal });
    }

    readKeys() {
      let x = 0, z = 0;
      if (this.keys["a"] || this.keys["arrowleft"]) x -= 1;
      if (this.keys["d"] || this.keys["arrowright"]) x += 1;
      if (this.keys["w"] || this.keys["arrowup"]) z += 1;
      if (this.keys["s"] || this.keys["arrowdown"]) z -= 1;
      if (x || z) {
        const n = norm(x, z);
        this.input.x = n.x;
        this.input.z = n.z;
      } else {
        this.input.x = this.stick.x;
        this.input.z = this.stick.z;
      }
      this.input.sprint = this.sprintHeld || !!this.keys["shift"];
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.w = Math.max(1, r.width);
      this.h = Math.max(1, r.height);
      this.dpr = dpr;
      this.canvas.width = Math.round(this.w * dpr);
      this.canvas.height = Math.round(this.h * dpr);
      const aspect = this.w / this.h;
      if (aspect >= 1.35) this.focal = this.h * 0.98;
      else if (aspect >= 0.85) this.focal = this.w * 1.02;
      else this.focal = this.w * 1.62;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* ---------------- lifecycle ---------------- */
    start() {
      this.running = true;
      this.last = performance.now();
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.canvas.parentElement);
      this.resize();
      const step = (ts) => {
        if (!this.running) return;
        const dt = Math.min(0.04, Math.max(0.001, (ts - this.last) / 1000));
        this.last = ts;
        this.frame(dt);
        this.raf = requestAnimationFrame(step);
      };
      this.raf = requestAnimationFrame(step);
    }

    stop() {
      this.running = false;
      if (this.raf) cancelAnimationFrame(this.raf);
      if (this.ac) this.ac.abort();
      if (this.resizeObserver) this.resizeObserver.disconnect();
      Sound.crowdOff();
    }

    frame(dt) {
      if (this.paused) {
        this.render();
        return;
      }
      this.time += dt;
      this.updateCamera(dt);
      this.updateParticles(dt);
      this.shake = Math.max(0, this.shake - dt * 2.2);
      if (this.state === "play") {
        if (this.freeze > 0) {
          this.freeze -= dt;
          this.updateHUD();
          this.render();
          return;
        }
        this.updatePlay(dt);
      } else if (this.state === "celebrate") {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.state = "play";
          this.freeze = 0.7;
          this.resetPositions(this.concededBy === "home" ? this.homeKicker : this.awayKicker);
          this.showBanner("KICK OFF", `${this.team.short} ${this.score.home} : ${this.score.away} ${this.opp.short}`, "info", 1200);
          Sound.whistle(false);
        }
      } else if (this.state === "restart") {
        this.restartTimer -= dt;
        this.updateRestartMovement(dt);
        if (this.restartTimer <= 0) this.finishRestart();
      } else if (this.state === "halftime") {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.state = "play";
          this.freeze = 0.8;
          FCN.ui.hideOverlay();
          this.resetPositions(this.awayKicker);
          this.showBanner("HIỆP 2", "Bóng lăn trở lại", "info", 1200);
          Sound.whistle(false);
        }
      } else if (this.state === "intro") {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.state = "play";
          this.freeze = 0.55;
          this.showBanner("BẮT ĐẦU", "Chúc may mắn, HLV!", "info", 900);
          this.commentary("Trận đấu đã bắt đầu. <b>NOVA FC</b> giao bóng.");
          this.updateHUD(true);
        }
      }
      if (this.shootCharging) {
        this.shootPower = Math.min(1, this.shootPower + dt / 0.62);
        const ring = document.getElementById("charge-ring");
        if (ring) {
          const sc = 0.85 + this.shootPower * 0.4;
          ring.style.transform = `scale(${sc})`;
          ring.style.opacity = String(0.45 + this.shootPower * 0.55);
        }
      }
      this.updateHUD();
      this.render();
    }

    pause() {
      if (this.paused || this.state === "fulltime") return;
      this.paused = true;
      this.shootCharging = false;
      document.getElementById("btn-shoot")?.classList.remove("charging");
      FCN.ui.showPause({
        resume: () => { this.paused = false; this.last = performance.now(); },
        quit: () => {
          this.stop();
          FCN.ui.hideOverlay();
          FCN.app.exitMatch();
        }
      });
    }

    autoPause() {
      if (!this.paused && this.state !== "fulltime") this.pause();
    }

    /* ---------------- per-frame gameplay ---------------- */
    updatePlay(dt) {
      this.elapsed += dt;
      this.readKeys();
      const owner = this.ball.owner;
      if (owner) {
        this.stats.lastOwner = owner.team;
        if (owner.team === "home") this.stats.possHome += dt;
        else this.stats.possAway += dt;
      } else if (this.stats.lastOwner === "home") this.stats.possHome += dt;
      else this.stats.possAway += dt;

      this.updateActive(dt);
      this.handleInput();
      this.updateUser(dt);
      this.updateAI(dt);
      this.separate();
      this.updateBall(dt);
      this.checkBoundaries();
      this.updateHUD();

      if (!this.halfDone && this.elapsed >= HALF_AT) {
        this.halfDone = true;
        this.state = "halftime";
        this.stateTimer = 2.6;
        this.shootCharging = false;
        this.pendingPass = false;
        FCN.ui.showHalftime();
        Sound.whistle(true);
        this.commentary("Hết hiệp một. Các cầu thủ tạm nghỉ.");
      } else if (this.elapsed >= MATCH_SECONDS && this.state === "play") {
        this.endMatch();
      }
    }

    updateActive(dt) {
      const owner = this.ball.owner;
      if (this.switchLock > 0) this.switchLock -= dt;
      if (this.switchCd > 0) this.switchCd -= dt;
      if (owner && owner.team === "home" && !owner.isGK) {
        if (this.active !== owner) this.setActive(owner);
        return;
      }
      if (this.switchLock > 0) return;
      const outfield = this.players.filter((p) => p.team === "home" && !p.isGK);
      if (!outfield.length) return;
      const target = owner || this.ball;
      let nearest = outfield[0], best = Infinity;
      for (const p of outfield) {
        const d = dist(p, target);
        if (d < best) { best = d; nearest = p; }
      }
      if (this.active && this.active.team === "home") {
        const cur = dist(this.active, target);
        if (best < cur - 2.4 && this.switchCd <= 0) {
          this.setActive(nearest);
          this.switchCd = 0.4;
          this.switchLock = 0.25;
        }
      } else if (nearest) {
        this.setActive(nearest);
      }
    }

    handleInput() {
      if (this.pendingPass) {
        this.pendingPass = false;
        this.attemptPass(this.active);
      }
      if (this.pendingTackle) {
        this.pendingTackle = false;
        this.attemptTackle(this.active);
      }
      if (this.shootRelease != null) {
        const power = this.shootRelease;
        this.shootRelease = null;
        this.attemptShoot(this.active, power);
      }
    }

    updateUser(dt) {
      const p = this.active;
      if (!p || p.team !== "home") return;
      if (p.stun > 0) {
        p.stun -= dt;
        p.vx *= 0.86;
        p.vz *= 0.86;
        p.x = clamp(p.x + p.vx * dt, -PITCH_W / 2 + 0.8, PITCH_W / 2 - 0.8);
        p.z = clamp(p.z + p.vz * dt, 0.8, PITCH_L - 0.8);
        return;
      }
      let ix = this.input.x, iz = this.input.z;
      const mag = Math.hypot(ix, iz);
      if (mag > 1) { ix /= mag; iz /= mag; }
      const moving = mag > 0.08;
      const sprinting = this.input.sprint && p.stamina > 2 && moving;
      const hasBall = this.ball.owner === p;
      let sp = p.speed * (sprinting ? p.sprint : 1) * (hasBall ? 0.94 : 1);
      if (p.stamina < 18) sp *= 0.9;
      const targetVX = moving ? ix * sp : 0;
      const targetVZ = moving ? iz * sp : 0;
      const accel = Math.min(1, dt * 11);
      p.vx = lerp(p.vx, targetVX, accel);
      p.vz = lerp(p.vz, targetVZ, accel);
      p.x = clamp(p.x + p.vx * dt, -PITCH_W / 2 + 0.7, PITCH_W / 2 - 0.7);
      p.z = clamp(p.z + p.vz * dt, 0.9, PITCH_L - 0.9);
      const spd = Math.hypot(p.vx, p.vz);
      if (spd > 0.25) p.dir = Math.atan2(p.vx, p.vz);
      p.anim += spd * dt * 2.1;
      if (sprinting) p.stamina = Math.max(0, p.stamina - dt * 15);
      else p.stamina = Math.min(100, p.stamina + dt * 8);
    }

    movePlayer(p, tx, tz, speed, dt) {
      const dx = tx - p.x, dz = tz - p.z;
      const d = Math.hypot(dx, dz);
      let tvx = 0, tvz = 0;
      if (d > 0.55) {
        tvx = (dx / d) * speed;
        tvz = (dz / d) * speed;
      }
      const accel = Math.min(1, dt * (p === this.active ? 11 : 7.2));
      p.vx = lerp(p.vx, tvx, accel);
      p.vz = lerp(p.vz, tvz, accel);
      p.x = clamp(p.x + p.vx * dt, -PITCH_W / 2 + 0.8, PITCH_W / 2 - 0.8);
      p.z = clamp(p.z + p.vz * dt, 0.8, PITCH_L - 0.8);
      const spd = Math.hypot(p.vx, p.vz);
      if (spd > 0.2) p.dir = Math.atan2(p.vx, p.vz);
      p.anim += spd * dt * 2.1;
    }

    updateAI(dt) {
      const owner = this.ball.owner;
      const teamTarget = owner || this.ball;
      const chasers = { home: new Set(), away: new Set() };
      for (const team of ["home", "away"]) {
        const out = this.players.filter((p) => p.team === team && !p.isGK);
        out.sort((a, b) => dist(a, teamTarget) - dist(b, teamTarget));
        if (out[0] && dist(out[0], teamTarget) < 34) chasers[team].add(out[0].id);
        if (out[1] && dist(out[1], teamTarget) < 18) chasers[team].add(out[1].id);
      }
      for (const p of this.players) {
        if (p.isGK) { this.updateGK(p, dt); continue; }
        if (p === this.active) continue;
        if (p.stun > 0) { p.stun -= dt; p.vx *= 0.85; p.vz *= 0.85; p.x += p.vx * dt; p.z += p.vz * dt; continue; }
        if (p.cd > 0) p.cd -= dt;
        if (owner === p) { this.aiCarrier(p, dt); continue; }
        const teamHas = owner && owner.team === p.team;
        const oppHas = owner && owner.team !== p.team;
        const isChaser = chasers[p.team].has(p.id);
        let tx = p.base.x, tz = p.base.z;
        let sprint = false;

        if (teamHas) {
          const adv = this.ball.z - HALF_L;
          tz = p.base.z + adv * 0.4;
          tx = p.base.x * 0.86 + this.ball.x * 0.14;
          const att = ["ST", "LW", "RW", "CAM"].includes(p.slotPos);
          const wide = ["LW", "RW", "LM", "RM", "LWB", "RWB"].includes(p.slotPos);
          if (att) {
            tz = this.ball.z + p.side * (12 + (p.ovr - 70) * 0.12);
            tx = p.base.x * 0.92 + this.ball.x * 0.08;
            sprint = true;
          } else if (wide) {
            tz += p.side * 4;
          }
          if (["CB", "LB", "RB"].includes(p.slotPos) && this.ball.z * p.side < HALF_L * p.side + 8) {
            tz = Math.min(tz, 43);
          }
        } else if (oppHas) {
          const opp = owner;
          if (isChaser) {
            tx = opp.x + opp.vx * 0.16;
            tz = opp.z + opp.vz * 0.16;
            sprint = true;
            if (dist(p, opp) < 1.85 && p.cd <= 0 && Math.random() < 0.7) {
              this.contestTackle(p, opp, p.team === "away" ? this.diff.aggression : 0.74);
              p.cd = 1.1;
            }
          } else {
            tz = p.base.z + (this.ball.z - p.base.z) * 0.38;
            tx = p.base.x * 0.82 + this.ball.x * 0.18;
            const def = ["CB", "LB", "RB", "CDM", "LWB", "RWB"].includes(p.slotPos);
            if (def) {
              const goalSide = this.ball.z - p.side * 9;
              tz = p.side === 1 ? Math.min(tz, goalSide) : Math.max(tz, goalSide);
              tz = clamp(tz, 3, 101);
            }
            // mark nearest opponent a little
            let oppNear = null, od = 15;
            for (const q of this.players) {
              if (q.team === p.team || q.isGK) continue;
              const d = dist(p, q);
              if (d < od) { od = d; oppNear = q; }
            }
            if (oppNear) {
              tx = lerp(tx, oppNear.x, 0.22);
              tz = lerp(tz, oppNear.z - p.side * 1.6, 0.18);
            }
          }
        } else {
          if (isChaser) {
            const d = dist(p, this.ball);
            const lead = Math.min(0.5, d / 40);
            tx = this.ball.x + this.ball.vx * lead;
            tz = this.ball.z + this.ball.vz * lead;
            sprint = true;
          } else {
            tz = p.base.z + (this.ball.z - p.base.z) * 0.3;
            tx = p.base.x * 0.85 + this.ball.x * 0.15;
          }
        }
        tx = clamp(tx, -PITCH_W / 2 + 1, PITCH_W / 2 - 1);
        tz = clamp(tz, 1, PITCH_L - 1);
        let sp = p.speed;
        if (p.team === "away") sp *= this.diff.speed;
        if (sprint && p.stamina > 5) {
          sp *= p.sprint;
          p.stamina = Math.max(0, p.stamina - dt * 11);
        } else {
          p.stamina = Math.min(100, p.stamina + dt * 6);
        }
        if (p.stamina < 16) sp *= 0.9;
        this.movePlayer(p, tx, tz, sp, dt);
      }
    }

    separate() {
      const RADIUS = 1.24;
      const list = this.players;
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j];
          let dx = b.x - a.x;
          let dz = b.z - a.z;
          let d = Math.hypot(dx, dz);
          if (d >= RADIUS) continue;
          if (d < 0.001) {
            const ang = ((i * 7 + j * 13) % 17) / 17 * TAU;
            dx = Math.cos(ang);
            dz = Math.sin(ang);
            d = 1;
          }
          const push = (RADIUS - d) * 0.5;
          const nx = dx / d;
          const nz = dz / d;
          a.x = clamp(a.x - nx * push, -PITCH_W / 2 + 0.8, PITCH_W / 2 - 0.8);
          a.z = clamp(a.z - nz * push, 0.8, PITCH_L - 0.8);
          b.x = clamp(b.x + nx * push, -PITCH_W / 2 + 0.8, PITCH_W / 2 - 0.8);
          b.z = clamp(b.z + nz * push, 0.8, PITCH_L - 0.8);
          a.vx *= 0.96; a.vz *= 0.96;
          b.vx *= 0.96; b.vz *= 0.96;
        }
      }
    }

    aiCarrier(p, dt) {
      p.dir = Math.atan2(p.vx || Math.sin(p.dir), p.vz || Math.cos(p.dir));
      const goalZ = p.side === 1 ? PITCH_L : 0;
      const goalDist = Math.abs(goalZ - p.z);
      if (p.decisionCd == null) p.decisionCd = 0.25;
      p.decisionCd -= dt;
      let pressure = 999, presser = null;
      for (const q of this.players) {
        if (q.team === p.team) continue;
        const d = dist(p, q);
        if (d < pressure) { pressure = d; presser = q; }
      }
      if (p.decisionCd <= 0) {
        p.decisionCd = p.team === "away" ? 0.32 / Math.max(0.7, this.diff.react) : 0.4;
        if (goalDist < 27 && pressure > 1.4 && Math.random() < 0.62) {
          this.attemptShoot(p, 0.62 + Math.random() * 0.3);
        } else if (pressure < 3.4 && Math.random() < 0.72) {
          this.aiPass(p);
        }
      }
      let tx = 0, tz = goalZ;
      const sidePush = p.x > 0 ? -1 : 1;
      if (goalDist < 30) {
        tx = sidePush * 2.6;
      } else {
        tx = clamp(p.x * 0.55 + sidePush * 3, -22, 22);
      }
      if (presser && dist(p, presser) < 5.5) {
        tx += (p.x - presser.x > 0 ? 1 : -1) * 5;
      }
      if (Math.abs(p.x) > 27) tx = p.x > 0 ? p.x - 8 : p.x + 8;
      tz = p.z + p.side * 8;
      let sp = p.speed * (p.team === "away" ? this.diff.speed : 1) * (p.stamina > 8 ? 1.07 : 1);
      if (p.stamina > 12) { sp *= 1.09; p.stamina = Math.max(0, p.stamina - dt * 5); }
      this.movePlayer(p, tx, clamp(tz, 2, PITCH_L - 2), sp, dt);
    }

    aiPass(p) {
      const aim = p.side === 1 ? { x: 0, z: 1 } : { x: 0, z: -1 };
      const target = this.findBestPass(p, aim, 48);
      if (target) this.doPass(p, target);
      else {
        const dir = p.side === 1 ? 1 : -1;
        this.looseKick(p, (Math.random() - 0.5) * 0.4, 1, dir);
      }
    }

    updateGK(p, dt) {
      const ownGoalZ = p.side === 1 ? 0 : PITCH_L;
      const outward = p.side;
      if (this.ball.owner === p) {
        p.hold = (p.hold || 0) + dt;
        p.dir = p.side === 1 ? 0 : Math.PI;
        p.x = lerp(p.x, clamp(p.x, -8, 8), Math.min(1, dt * 2));
        if (p.hold > 0.9) {
          p.hold = 0;
          const target = this.findBestPass(p, { x: 0, z: p.side }, 65);
          if (target) this.doPass(p, target);
          else this.looseKick(p, 0, 1, p.side, 6);
        }
        return;
      }
      let lineZ = ownGoalZ + outward * 1.7;
      let targetX = clamp(this.ball.x * 0.62, -6.4, 6.4);
      let targetZ = lineZ;
      const ballDist = Math.abs(this.ball.z - ownGoalZ);
      if (this.ball.owner && this.ball.owner.team !== p.team && ballDist < 22) {
        targetZ = ownGoalZ + outward * clamp(2 + (22 - ballDist) * 0.16, 2, 6.2);
        targetX = clamp(this.ball.x * 0.55, -5.6, 5.6);
      }
      // predict shots
      if (!this.ball.owner) {
        const towardGoal = (ownGoalZ - this.ball.z) * this.ball.vz > 0;
        if (towardGoal && Math.abs(this.ball.vz) > 2) {
          const t = (lineZ - this.ball.z) / this.ball.vz;
          if (t > 0 && t < 1.6) {
            const px = this.ball.x + this.ball.vx * t;
            targetX = clamp(px, -3.9, 3.9);
            targetZ = ownGoalZ + outward * (1.2 + Math.min(1.8, t));
            p.dive = Math.max(p.dive || 0, t < 0.9 ? 1 : 0);
          }
        }
        if (ballDist < 12 && Math.hypot(this.ball.x - p.x, this.ball.z - p.z) < 4 && this.ball.h < 1.2) {
          targetX = this.ball.x;
          targetZ = this.ball.z;
        }
      }
      const sp = 4.9 + (p.stats.ref || 60) * 0.018 + (p.dive ? 2.4 : 0);
      const reachX = Math.abs(targetX - p.x);
      this.movePlayer(p, targetX, p.z, Math.min(11, sp + reachX * 0.2), dt);
      p.z = clamp(p.z, ownGoalZ + outward * 0.9, ownGoalZ + outward * 7.5);
      if (p.dive) p.dive = Math.max(0, p.dive - dt * 0.8);
    }

    /* ---------------- player actions ---------------- */
    attemptPass(p) {
      if (!p || p.team !== "home") return;
      const owner = this.ball.owner;
      if (owner !== p) {
        // manual switch toward the stick
        const out = this.players.filter((q) => q.team === "home" && !q.isGK && q !== this.active);
        if (!out.length) return;
        const aim = this.getAim(p);
        let best = null, bs = -Infinity;
        for (const q of out) {
          const to = norm(q.x - p.x, q.z - p.z);
          const s = dot(to.x, to.z, aim.x, aim.z) * 10 - dist(p, q) * 0.08;
          if (s > bs) { bs = s; best = q; }
        }
        if (best) { this.setActive(best); this.switchLock = 0.45; this.commentary("Đổi người kiểm soát."); }
        return;
      }
      const aim = this.getAim(p);
      const target = this.findBestPass(p, aim, 42);
      if (target) this.doPass(p, target);
      else {
        const d = Math.hypot(Math.sin(p.dir), Math.cos(p.dir));
        this.looseKick(p, Math.sin(p.dir), Math.cos(p.dir), p.side, 9);
      }
    }

    getAim(p) {
      let ax = this.input.x, az = this.input.z;
      if (Math.hypot(ax, az) < 0.2) {
        ax = Math.sin(p.dir);
        az = Math.cos(p.dir);
        if (p.team === "away") az = -Math.abs(az) || -1;
      }
      return norm(ax, az);
    }

    findBestPass(p, aim, maxDist) {
      const mates = this.players.filter((q) => q.team === p.team && q !== p);
      const goalSide = p.side;
      let best = null, bestScore = -Infinity;
      for (const q of mates) {
        const d = dist(p, q);
        if (d < 2.2 || d > (maxDist || 44)) continue;
        const to = norm(q.x - p.x, q.z - p.z);
        const forward = (q.z - p.z) * goalSide;
        let open = 99;
        for (const o of this.players) {
          if (o.team === p.team) continue;
          open = Math.min(open, dist(o, q));
        }
        let score = dot(to.x, to.z, aim.x, aim.z) * 24 + forward * 0.32 + Math.min(open, 16) * 1.15 + (44 - d) * 0.2;
        if (q.isGK) score -= 14;
        if (this.lineBlocked(p.x, p.z, q.x, q.z, p.team)) score -= 26;
        if (score > bestScore) { bestScore = score; best = q; }
      }
      return bestScore > 5 ? best : null;
    }

    lineBlocked(x1, z1, x2, z2, team) {
      for (const o of this.players) {
        if (o.team === team) continue;
        const dx = x2 - x1, dz = z2 - z1;
        const L2 = dx * dx + dz * dz || 1;
        let t = ((o.x - x1) * dx + (o.z - z1) * dz) / L2;
        if (t < 0.06 || t > 0.94) continue;
        const px = x1 + dx * t, pz = z1 + dz * t;
        if (Math.hypot(o.x - px, o.z - pz) < 1.15) return true;
      }
      return false;
    }

    doPass(p, target) {
      const d = dist(p, target);
      const speed = clamp(10 + d * 0.58, 11, 27);
      const flight = d / speed;
      const lead = clamp(flight * 0.12, 0, 0.42);
      const tx = target.x + target.vx * lead;
      const tz = target.z + target.vz * lead;
      const dir = norm(tx - p.x, tz - p.z);
      this.ball.owner = null;
      this.ball.x = p.x + dir.x * 0.72;
      this.ball.z = p.z + dir.z * 0.72;
      this.ball.h = 0.13;
      this.ball.vx = dir.x * speed;
      this.ball.vz = dir.z * speed;
      this.ball.vy = d > 25 ? (1.0 - 0.13 + 4.9 * flight * flight) / flight : 0;
      this.ball.lastTouch = p;
      this.ball.lastTeam = p.team;
      this.ball.kicker = p;
      this.ball.lock = 0.18;
      this.ball.saveTried = false;
      this.ball.intendedReceiver = target;
      target.receiveBoost = 0.9;
      p.dir = Math.atan2(dir.x, dir.z);
      p.dir = Math.atan2(dir.x, dir.z);
      if (p.team === "home") this.stats.passes++;
      Sound.pass();
      if (p.team === "home") {
        this.setActive(target);
        this.switchLock = 0.55;
      }
      if (Math.random() < 0.12) this.commentary(p.team === "home" ? "NOVA phối hợp nhuần nhuyễn." : "Đối thủ chuyền bóng chính xác.");
    }

    looseKick(p, dx, dz, side, speed) {
      const d = norm(dx || 0.01, dz || side || 1);
      this.ball.owner = null;
      this.ball.x = p.x + d.x * 0.7;
      this.ball.z = p.z + d.z * 0.7;
      this.ball.h = 0.13;
      this.ball.vx = d.x * (speed || 10);
      this.ball.vz = d.z * (speed || 10);
      this.ball.vy = 1.4;
      this.ball.lastTouch = p;
      this.ball.lastTeam = p.team;
      this.ball.kicker = p;
      this.ball.lock = 0.3;
      this.ball.saveTried = false;
      p.dir = Math.atan2(d.x, d.z);
    }

    attemptShoot(p, power) {
      if (!p || p.team !== "home") return;
      if (this.ball.owner !== p) return;
      this.shoot(p, power);
    }

    shoot(p, power) {
      if (this.ball.owner !== p) return;
      const goalZ = p.side === 1 ? PITCH_L : 0;
      const gk = this.players.find((q) => q.team !== p.team && q.isGK);
      const aimX = this.input.x;
      let targetX;
      if (Math.abs(aimX) > 0.2) targetX = clamp(aimX * 4.1, -3.3, 3.3);
      else targetX = (gk && gk.x > 0 ? -1 : 1) * (1.4 + Math.random() * 1.3);
      targetX += (Math.random() - 0.5) * (1.6 - (p.stats.sho || 70) * 0.008);
      const dx = targetX - p.x;
      const dz = goalZ - p.z;
      const d = Math.hypot(dx, dz) || 1;
      const dir = { x: dx / d, z: dz / d };
      const speed = 23 + power * 10;
      const flight = d / speed;
      const desiredH = 0.45 + power * 0.95 + Math.random() * 0.3;
      const vy = (desiredH - 0.13 + 4.9 * flight * flight) / flight;
      this.ball.owner = null;
      this.ball.x = p.x + dir.x * 0.72;
      this.ball.z = p.z + dir.z * 0.72;
      this.ball.h = 0.14;
      this.ball.vx = dir.x * speed;
      this.ball.vz = dir.z * speed;
      this.ball.vy = clamp(vy, 0.6, 9);
      this.ball.lastTouch = p;
      this.ball.lastTeam = p.team;
      this.ball.kicker = p;
      this.ball.lock = 0.24;
      this.ball.saveTried = false;
      this.ball.intendedReceiver = null;
      p.dir = Math.atan2(dir.x, dir.z);
      p.stamina = Math.max(0, p.stamina - 4);
      if (p.team === "home") {
        this.stats.shots++;
        const xAt = p.x + dir.x * speed * flight;
        const yAt = 0.14 + clamp(vy, 0.6, 9) * flight - 4.9 * flight * flight;
        if (Math.abs(xAt) < GOAL_HALF && yAt < GOAL_H && yAt > -0.2) this.stats.onTarget++;
        if (Math.random() < 0.32) this.commentary("Cú sút từ <b>" + p.name + "</b>!");
      }
      Sound.kick();
      this.shake = Math.max(this.shake, Math.min(0.6, 0.15 + power * 0.4));
    }

    attemptTackle(p) {
      if (!p || p.team !== "home") return;
      const owner = this.ball.owner;
      let target = null, bd = 3.1;
      if (owner && owner.team !== "home") {
        const d = dist(p, owner);
        if (d < bd) target = owner;
      }
      if (!target) {
        const dir = this.getAim(p);
        p.vx += dir.x * 3.4;
        p.vz += dir.z * 3.4;
        return;
      }
      this.contestTackle(p, target, 1.0);
    }

    contestTackle(p, victim, aggression) {
      const def = p.stats.def || 55;
      const dri = victim.stats.dri || 60;
      const chance = clamp(0.3 + (def - dri) * 0.012 + (p.ovr - victim.ovr) * 0.004, 0.12, 0.82) * (aggression || 1);
      if (Math.random() < chance) {
        const dir = norm(victim.x - p.x, victim.z - p.z);
        this.ball.owner = null;
        this.ball.x = victim.x;
        this.ball.z = victim.z;
        this.ball.h = 0.13;
        this.ball.vx = (dir.x || (Math.random() - 0.5)) * 5.5;
        this.ball.vz = (dir.z || 1) * 5.5;
        this.ball.vy = 0.8;
        this.ball.lastTouch = p;
        this.ball.lastTeam = p.team;
        this.ball.kicker = p;
        this.ball.lock = 0.1;
        victim.stun = 0.42;
        victim.cd = 0.5;
        p.cd = 0.7;
        if (p.team === "home") {
          this.stats.tackles++;
          this.setActive(p);
          this.switchLock = 0.5;
        }
        Sound.tackle();
        this.shake = Math.max(this.shake, 0.15);
        if (Math.random() < 0.5) this.commentary(p.team === "home" ? "Cướp bóng thành công!" : "Đối thủ đoạt lại bóng.");
      } else {
        p.stun = 0.34;
        p.cd = 0.55;
        victim.stun = 0;
        Sound.tackle();
      }
    }

    /* ---------------- ball & rules ---------------- */
    attachBall(p) {
      const dx = Math.sin(p.dir), dz = Math.cos(p.dir);
      this.ball.x = p.x + dx * 0.58;
      this.ball.z = p.z + dz * 0.58;
      this.ball.h = 0.11;
      this.ball.vx = p.vx;
      this.ball.vz = p.vz;
      this.ball.vy = 0;
      this.ball.lastTouch = p;
      this.ball.lastTeam = p.team;
      this.ball.rot += Math.hypot(p.vx, p.vz) * 0.004;
    }

    updateBall(dt) {
      if (this.ball.lock > 0) this.ball.lock -= dt;
      if (this.ball.owner) {
        this.attachBall(this.ball.owner);
        this.ball.intendedReceiver = null;
        return;
      }
      const b = this.ball;
      b.vy -= 9.8 * dt;
      b.h += b.vy * dt;
      if (b.h <= 0.11) {
        b.h = 0.11;
        if (b.vy < -0.8) b.vy = -b.vy * 0.46;
        else b.vy = 0;
      }
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      const drag = b.h < 0.35 ? 0.42 : 0.07;
      const fr = Math.exp(-drag * dt);
      b.vx *= fr;
      b.vz *= fr;
      b.rot += Math.hypot(b.vx, b.vz) * dt * 0.9;
      if (b.h > 0.12 && b.h < 1.9) b.intendedReceiver = b.intendedReceiver;
      this.gkSaveCheck();
      this.tryPickup();
    }

    gkSaveCheck() {
      const b = this.ball;
      if (b.owner || b.saveTried) return;
      const speed = Math.hypot(b.vx, b.vz);
      if (speed < 12) return;
      for (const gk of this.players) {
        if (!gk.isGK) continue;
        const gz = gk.side === 1 ? 0 : PITCH_L;
        const incoming = (gz - b.z) * b.vz > 0;
        if (!incoming) continue;
        const d = Math.hypot(gk.x - b.x, gk.z - b.z);
        const reach = 1.55 + (gk.ovr - 65) * 0.012 + (gk.dive ? 0.65 : 0);
        if (d < reach && b.h < GOAL_H + 0.2) {
          b.saveTried = true;
          const chance = clamp(0.74 * this.diff.keeper - (gk.ovr - 72) * 0.006, 0.45, 0.92);
          if (Math.random() < chance || speed < 17) {
            // Save: mostly clean catches, sometimes a parry back into play.
            if (Math.random() < 0.58 || speed < 17) {
              b.owner = gk;
              b.vx = b.vz = b.vy = 0;
              b.h = 0.12;
              gk.hold = 0;
              b.lastTouch = gk;
              b.lastTeam = gk.team;
              this.commentary("<b>" + gk.name + "</b> cứu thua xuất sắc!");
            } else {
              b.vx *= -0.36;
              b.vz *= -0.3;
              b.vy = 2.2;
              b.h = Math.max(0.4, b.h);
              b.lock = 0.2;
              this.commentary("<b>" + gk.name + "</b> đẩy bóng ra!");
            }
            if (gk.team === "away") this.stats.saves++;
            Sound.save();
            this.separate();
          } else {
            // Beaten: let the ball run past the keeper.
            b.lock = 0.16;
          }
        }
      }
    }

    tryPickup() {
      const b = this.ball;
      if (b.owner) return;
      if (b.z < -2 || b.z > PITCH_L + 2 || Math.abs(b.x) > PITCH_W / 2 + 2) return;
      let best = null, bestD = Infinity;
      for (const p of this.players) {
        if (p.stun > 0.15) continue;
        if (b.lock > 0 && (p === b.kicker || p.isGK)) continue;
        const speed = Math.hypot(b.vx, b.vz);
        let radius = p.isGK ? 1.65 : 1.18;
        if (b.intendedReceiver === p && b.h < 2 && speed < 22) radius += 0.85;
        if (speed > 18) radius *= p.isGK ? 1 : 0.66;
        if (b.h > (p.isGK ? 2.2 : 1.65)) continue;
        const d = Math.hypot(p.x - b.x, p.z - b.z);
        if (d < radius && d < bestD) { bestD = d; best = p; }
      }
      if (!best) return;
      const speed = Math.hypot(b.vx, b.vz);
      b.owner = best;
      b.vx = b.vz = b.vy = 0;
      b.h = 0.11;
      b.lastTouch = best;
      b.lastTeam = best.team;
      b.intendedReceiver = null;
      best.hold = 0;
      if (best.team === "home") {
        this.setActive(best);
        this.switchLock = 0.3;
      } else {
        this.switchLock = 0.15;
      }
      if (best.isGK && speed > 10) Sound.save();
    }

    checkBoundaries() {
      const b = this.ball;
      if (b.owner) return;
      if (b.z <= 0 || b.z >= PITCH_L) {
        if (Math.abs(b.x) < GOAL_HALF && b.h < GOAL_H + 0.05) {
          const scoringTeam = b.z <= 0 ? "away" : "home";
          this.scoreGoal(scoringTeam);
        } else {
          const defendTeam = b.z <= 0 ? "home" : "away";
          this.outOfPlay("goalkick", defendTeam, b.z <= 0 ? 4.6 : PITCH_L - 4.6, 0);
        }
        return;
      }
      if (Math.abs(b.x) > PITCH_W / 2) {
        const team = b.lastTeam === "home" ? "away" : "home";
        this.outOfPlay("throwin", team, b.x > 0 ? PITCH_W / 2 - 0.6 : -PITCH_W / 2 + 0.6, clamp(b.z, 3, PITCH_L - 3));
      }
    }

    outOfPlay(type, team, x, z) {
      this.state = "restart";
      this.restartTimer = 1.15;
      this.ball.owner = null;
      this.ball.x = x;
      this.ball.z = z;
      this.ball.h = 0.11;
      this.ball.vx = this.ball.vz = this.ball.vy = 0;
      this.ball.lock = 0;
      this.ball.saveTried = false;
      this.restartInfo = { type, team, x, z, stage: 0 };
      this.shootCharging = false;
      this.pendingPass = false;
      this.showBanner(type === "throwin" ? "NÉM BIÊN" : "PHÁT BÓNG", team === "home" ? "NOVA FC" : this.opp.name, "info", 800);
      this.commentary(type === "throwin" ? "Bóng đi ra ngoài. Ném biên!" : "Phát bóng từ vạch cầu môn.");
      Sound.whistle(false);
    }

    updateRestartMovement(dt) {
      for (const p of this.players) {
        if (p.isGK) continue;
        const tz = clamp(p.base.z + (this.ball.z - p.base.z) * 0.2, 3, PITCH_L - 3);
        this.movePlayer(p, p.base.x, tz, p.speed * 0.45, dt);
      }
    }

    finishRestart() {
      const info = this.restartInfo;
      if (!info) return;
      const team = info.team;
      let taker = null;
      if (info.type === "goalkick") {
        taker = this.players.find((p) => p.team === team && p.isGK);
        info.z = team === "home" ? 5.0 : PITCH_L - 5.0;
      } else {
        const mates = this.players.filter((p) => p.team === team && !p.isGK);
        taker = mates.sort((a, b) => Math.hypot(a.x - info.x, a.z - info.z) - Math.hypot(b.x - info.x, b.z - info.z))[0];
      }
      if (!taker) taker = this.players.find((p) => p.team === team);
      if (taker) {
        if (!taker.isGK) {
          taker.x = clamp(info.x + (info.x > 0 ? -0.8 : 0.8), -PITCH_W / 2 + 1, PITCH_W / 2 - 1);
          taker.z = info.z;
          taker.dir = info.x > 0 ? Math.PI / 2 : -Math.PI / 2;
        } else {
          taker.x = clamp(info.x, -7, 7);
          taker.z = info.z;
        }
        this.ball.x = info.x;
        this.ball.z = info.z;
        this.ball.h = 0.11;
        this.ball.owner = taker;
        this.ball.vx = this.ball.vz = this.ball.vy = 0;
        this.ball.saveTried = false;
        this.ball.lastTouch = taker;
        this.ball.lastTeam = taker.team;
        this.attachBall(taker);
        if (team === "home") this.setActive(taker);
        else this.switchLock = 0.4;
      }
      this.restartInfo = null;
      this.state = "play";
      this.freeze = 0.35;
      this.switchLock = 0.3;
    }

    scoreGoal(team) {
      if (this.state === "celebrate") return;
      this.score[team]++;
      this.state = "celebrate";
      this.stateTimer = 3.0;
      this.concededBy = team === "home" ? "away" : "home";
      const b = this.ball;
      const scorer = b.lastTouch && b.lastTouch.team === team ? b.lastTouch.name : "Phản lưới";
      b.owner = null;
      b.vx = b.vz = b.vy = 0;
      b.h = 0.11;
      this.shootCharging = false;
      this.showBanner("BÀN THẮNG!", `${scorer} · ${this.team.short} ${this.score.home} : ${this.score.away} ${this.opp.short}`, "goal", 2600);
      const flash = document.getElementById("goal-flash");
      if (flash) {
        flash.classList.remove("fire");
        void flash.offsetWidth;
        flash.classList.add("fire");
      }
      this.spawnConfetti(90);
      this.shake = 0.9;
      this.commentary(`<b>${scorer}</b> ghi bàn! ${this.team.short} ${this.score.home} - ${this.score.away} ${this.opp.short}`);
      Sound.goal();
      this.updateHUD(true);
      if (team === "away" && this.state !== "fulltime") {
        // small camera punch handled by shake
      }
    }

    endMatch() {
      if (this.ended) return;
      this.ended = true;
      this.state = "fulltime";
      this.paused = false;
      this.shootCharging = false;
      this.showBanner("HẾT GIỜ", `${this.team.short} ${this.score.home} : ${this.score.away} ${this.opp.short}`, "info", 2200);
      Sound.whistle(true);
      this.updateHUD(true);
      const totalPoss = this.stats.possHome + this.stats.possAway || 1;
      const result = {
        mode: this.config.mode || "quick",
        homeScore: this.score.home,
        awayScore: this.score.away,
        won: this.score.home > this.score.away,
        drawn: this.score.home === this.score.away,
        oppName: this.opp.name,
        oppKey: this.opp.key,
        difficulty: this.config.difficulty,
        stats: {
          possession: Math.round((this.stats.possHome / totalPoss) * 100),
          shots: this.stats.shots,
          onTarget: this.stats.onTarget,
          passes: this.stats.passes,
          tackles: this.stats.tackles
        }
      };
      setTimeout(() => {
        if (this.hooks.onEnd) this.hooks.onEnd(result);
      }, 1100);
    }

    /* ---------------- camera ---------------- */
    updateCamera(dt) {
      const b = this.ball;
      const portrait = this.w / this.h < 0.85;
      const targetZ = clamp(b.z - (portrait ? 21 : 25.5), -19, 79);
      const targetX = clamp(b.x * 0.55, -12, 12);
      const k = Math.min(1, dt * 3.4);
      this.camera.z = lerp(this.camera.z, targetZ, k);
      this.camera.x = lerp(this.camera.x, targetX, k);
      this.camera.y = portrait ? 16.4 : 15.4;
      // Portrait screens need the ball nearer the middle so the touch
      // controls at the bottom do not cover the active player.
      const lookZ = portrait ? b.z + 2 : this.camera.z + 29;
      this.look.z = lerp(this.look.z, lookZ, Math.min(1, dt * 4));
      this.look.x = lerp(this.look.x, b.x * 0.7, Math.min(1, dt * 3));
      this.look.y = portrait ? 0.8 : 1.15;
      const fx = this.look.x - this.camera.x;
      const fy = this.look.y - this.camera.y;
      const fz = this.look.z - this.camera.z;
      const fl = Math.hypot(fx, fy, fz) || 1;
      this.fwd = { x: fx / fl, y: fy / fl, z: fz / fl };
      const rx = this.fwd.z, rz = -this.fwd.x;
      const rl = Math.hypot(rx, rz) || 1;
      this.right = { x: rx / rl, y: 0, z: rz / rl };
      this.up = {
        x: this.fwd.y * this.right.z - this.fwd.z * this.right.y,
        y: this.fwd.z * this.right.x - this.fwd.x * this.right.z,
        z: this.fwd.x * this.right.y - this.fwd.y * this.right.x
      };
    }

    toCam(x, y, z) {
      const dx = x - this.camera.x;
      const dy = y - this.camera.y;
      const dz = z - this.camera.z;
      return {
        x: dx * this.right.x + dy * this.right.y + dz * this.right.z,
        y: dx * this.up.x + dy * this.up.y + dz * this.up.z,
        z: dx * this.fwd.x + dy * this.fwd.y + dz * this.fwd.z
      };
    }

    projectCam(c) {
      const sx = this.w / 2 + (c.x * this.focal) / c.z + (this.shake ? (Math.random() - 0.5) * this.shake * 18 : 0);
      const cy = this.w / this.h < 0.85 ? 0.47 : 0.53;
      const sy = this.h * cy - (c.y * this.focal) / c.z + (this.shake ? (Math.random() - 0.5) * this.shake * 18 : 0);
      return { x: sx, y: sy, z: c.z };
    }

    project(x, y, z) {
      const c = this.toCam(x, y, z);
      if (c.z < NEAR) return null;
      const p = this.projectCam(c);
      p.depth = c.z;
      return p;
    }

    clipNear(camPts) {
      const out = [];
      for (let i = 0; i < camPts.length; i++) {
        const a = camPts[i];
        const b = camPts[(i + 1) % camPts.length];
        const ain = a.z >= NEAR;
        const bin = b.z >= NEAR;
        if (ain) out.push(a);
        if (ain !== bin) {
          const t = (NEAR - a.z) / (b.z - a.z);
          out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: NEAR });
        }
      }
      return out;
    }

    poly3D(points, fill, stroke, alpha) {
      const camPts = points.map((p) => this.toCam(p[0], p[1], p[2]));
      const clipped = this.clipNear(camPts);
      if (clipped.length < 3) return;
      const proj = clipped.map((c) => this.projectCam(c));
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      ctx.beginPath();
      ctx.moveTo(proj[0].x, proj[0].y);
      for (let i = 1; i < proj.length; i++) ctx.lineTo(proj[i].x, proj[i].y);
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
      ctx.restore();
    }

    line3D(a, b, color, width, alpha) {
      let ca = this.toCam(a[0], a[1], a[2]);
      let cb = this.toCam(b[0], b[1], b[2]);
      if (ca.z < NEAR && cb.z < NEAR) return;
      if (ca.z < NEAR) {
        const t = (NEAR - ca.z) / (cb.z - ca.z);
        ca = { x: ca.x + (cb.x - ca.x) * t, y: ca.y + (cb.y - ca.y) * t, z: NEAR };
      } else if (cb.z < NEAR) {
        const t = (NEAR - cb.z) / (ca.z - cb.z);
        cb = { x: cb.x + (ca.x - cb.x) * t, y: cb.y + (ca.y - cb.y) * t, z: NEAR };
      }
      const pa = this.projectCam(ca);
      const pb = this.projectCam(cb);
      const depth = (ca.z + cb.z) / 2;
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width || clamp((0.11 * this.focal) / depth, 0.65, 4.2);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
      ctx.restore();
    }

    /* ---------------- effects & hud ---------------- */
    spawnConfetti(n) {
      const colors = ["#c8ff2e", "#ffffff", "#ffe27a", "#43e9ff", "#a06bff", "#ff4f9a"];
      for (let i = 0; i < n; i++) {
        this.particles.push({
          x: Math.random() * this.w,
          y: -20 - Math.random() * 120,
          vx: (Math.random() - 0.5) * 180,
          vy: 120 + Math.random() * 260,
          rot: Math.random() * TAU,
          vr: (Math.random() - 0.5) * 8,
          w: 4 + Math.random() * 5,
          h: 8 + Math.random() * 8,
          color: colors[Math.floor(Math.random() * colors.length)],
          life: 3.2 + Math.random()
        });
      }
    }

    updateParticles(dt) {
      for (const p of this.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 260 * dt;
        p.rot += p.vr * dt;
        p.life -= dt;
      }
      this.particles = this.particles.filter((p) => p.life > 0 && p.y < this.h + 30);
    }

    showBanner(text, sub, cls, ms) {
      const el = document.getElementById("match-banner");
      if (!el) return;
      el.className = "match-banner show " + (cls || "info");
      el.innerHTML = text + (sub ? `<small>${sub}</small>` : "");
      clearTimeout(this.bannerTimer);
      this.bannerTimer = setTimeout(() => el.classList.remove("show"), ms || 1400);
    }

    commentary(text) {
      const now = performance.now();
      if (now - this.lastComment < 900) return;
      this.lastComment = now;
      const el = document.getElementById("commentary");
      if (!el) return;
      el.innerHTML = text;
      el.classList.add("show");
      clearTimeout(this.commTimer);
      this.commTimer = setTimeout(() => el.classList.remove("show"), 2400);
    }

    updateHUD(force) {
      if (!force && this.time - this.lastHud < 0.1) return;
      this.lastHud = this.time;
      const clock = document.getElementById("match-clock");
      if (clock) {
        const secs = Math.min(5400, (this.elapsed / MATCH_SECONDS) * 5400);
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        clock.textContent = String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
      }
      const hs = document.getElementById("sb-home-score");
      const as = document.getElementById("sb-away-score");
      if (hs) hs.textContent = this.score.home;
      if (as) as.textContent = this.score.away;
      const bar = document.getElementById("stamina-bar");
      if (bar && this.active) bar.style.width = Math.max(0, this.active.stamina) + "%";
      const hint = document.getElementById("match-hint");
      if (hint) hint.style.opacity = this.elapsed > 8 ? "0.18" : "0.55";
    }

    /* ---------------- renderer ---------------- */
    render() {
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      this.drawBackdrop(ctx);
      this.drawPitch(ctx);
      this.drawAdBoards(ctx);
      this.drawGoals(ctx);
      this.drawShadows(ctx);
      this.drawPlayers(ctx);
      this.drawBall(ctx);
      this.drawParticles(ctx);
    }

    drawBackdrop(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, this.h);
      g.addColorStop(0, "#04080e");
      g.addColorStop(0.55, "#07131a");
      g.addColorStop(1, "#03080b");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);

      // floodlight haze
      const glow = ctx.createRadialGradient(this.w * 0.5, -this.h * 0.15, 0, this.w * 0.5, -this.h * 0.15, this.w * 0.75);
      glow.addColorStop(0, "rgba(180,255,120,.20)");
      glow.addColorStop(0.4, "rgba(90,180,130,.06)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, this.w, this.h);

      // dark outer ground
      this.poly3D([[-90, 0, -40], [90, 0, -40], [90, 0, 130], [-90, 0, 130]], "#050e0a");

      // far stand wall
      this.poly3D([[-70, 0, 109], [70, 0, 109], [70, 20, 109], [-70, 20, 109]], "#081119");
      this.poly3D([[-70, 0, 109], [70, 0, 109], [70, 2.4, 109], [-70, 2.4, 109]], "#0c1a24");

      // crowd
      ctx.save();
      for (const c of this.crowdSeed) {
        const p = this.project(c.x, c.y, 108.8);
        if (!p) continue;
        const s = clamp(18 / p.depth, 0.8, 2.1);
        const tone = c.c > 0.85 ? "#c8ff2e" : c.c > 0.7 ? "#6b7c93" : c.c > 0.5 ? "#2a3a4c" : "#1a2634";
        ctx.fillStyle = tone;
        ctx.globalAlpha = 0.55;
        ctx.fillRect(p.x, p.y, s, s);
      }
      ctx.restore();

      // floodlight pylons
      this.drawPylon(-52, 109, 0x1);
      this.drawPylon(52, 109, 0x2);

      // vignette-ish top shade
      const vg = ctx.createLinearGradient(0, 0, 0, this.h * 0.32);
      vg.addColorStop(0, "rgba(0,0,0,.55)");
      vg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, this.w, this.h * 0.32);
    }

    drawPylon(x, z, seed) {
      const base = this.project(x, 0, z);
      const top = this.project(x, 26, z);
      if (!base || !top) return;
      const ctx = this.ctx;
      ctx.save();
      ctx.strokeStyle = "rgba(180,205,225,.22)";
      ctx.lineWidth = Math.max(1, this.focal / 420);
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(top.x, top.y);
      ctx.stroke();
      const r = clamp(this.focal / 90, 4, 22);
      const glow = ctx.createRadialGradient(top.x, top.y, 0, top.x, top.y, r * 2.4);
      glow.addColorStop(0, "rgba(225,255,235,.7)");
      glow.addColorStop(0.3, "rgba(180,255,180,.18)");
      glow.addColorStop(1, "rgba(180,255,180,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(top.x - r * 2.4, top.y - r * 2.4, r * 4.8, r * 4.8);
      ctx.fillStyle = "rgba(245,255,245,.9)";
      ctx.fillRect(top.x - r * 0.45, top.y - r * 0.12, r * 0.9, r * 0.24);
      ctx.restore();
    }

    drawPitch(ctx) {
      const bands = 20;
      const step = PITCH_L / bands;
      for (let i = 0; i < bands; i++) {
        const z0 = i * step, z1 = z0 + step;
        const t = i / bands;
        const c1 = i % 2 === 0 ? "#105c39" : "#0d5132";
        const light = 0.85 + (1 - t) * 0.28;
        const col = shade(c1, (light - 1) * 0.7);
        this.poly3D([[-PITCH_W / 2, 0, z0], [PITCH_W / 2, 0, z0], [PITCH_W / 2, 0, z1], [-PITCH_W / 2, 0, z1]], col);
      }
      const white = "rgba(238,246,255,.72)";
      const thin = "rgba(238,246,255,.55)";
      // outline
      this.line3D([-PITCH_W / 2, 0.01, 0], [PITCH_W / 2, 0.01, 0], white, null, 0.8);
      this.line3D([-PITCH_W / 2, 0.01, PITCH_L], [PITCH_W / 2, 0.01, PITCH_L], white, null, 0.8);
      this.line3D([-PITCH_W / 2, 0.01, 0], [-PITCH_W / 2, 0.01, PITCH_L], thin, null, 0.75);
      this.line3D([PITCH_W / 2, 0.01, 0], [PITCH_W / 2, 0.01, PITCH_L], thin, null, 0.75);
      // halfway & circle
      this.line3D([-PITCH_W / 2, 0.01, HALF_L], [PITCH_W / 2, 0.01, HALF_L], white, null, 0.75);
      this.arc3D(0, HALF_L, 9.15, 0, TAU, white, 40, 0.68);
      this.spot3D(0, HALF_L, 0.22, white);

      for (const end of [0, PITCH_L]) {
        const dir = end === 0 ? 1 : -1;
        const boxZ = end + dir * 16.5;
        const areaZ = end + dir * 5.5;
        // penalty box
        this.line3D([-20.16, 0.01, end], [-20.16, 0.01, boxZ], thin, null, 0.7);
        this.line3D([20.16, 0.01, end], [20.16, 0.01, boxZ], thin, null, 0.7);
        this.line3D([-20.16, 0.01, boxZ], [20.16, 0.01, boxZ], thin, null, 0.7);
        // six yard box
        this.line3D([-9.16, 0.01, end], [-9.16, 0.01, areaZ], thin, null, 0.6);
        this.line3D([9.16, 0.01, end], [9.16, 0.01, areaZ], thin, null, 0.6);
        this.line3D([-9.16, 0.01, areaZ], [9.16, 0.01, areaZ], thin, null, 0.6);
        // penalty spot
        this.spot3D(0, end + dir * 11, 0.2, white);
        // penalty arc
        const spotZ = end + dir * 11;
        for (let a = 0; a < 40; a++) {
          const a1 = (a / 40) * TAU, a2 = ((a + 1) / 40) * TAU;
          const zA = spotZ + Math.sin(a1) * 9.15;
          const zB = spotZ + Math.sin(a2) * 9.15;
          if ((dir === 1 && zA > boxZ && zB > boxZ) || (dir === -1 && zA < boxZ && zB < boxZ)) {
            this.line3D([Math.cos(a1) * 9.15, 0.01, zA], [Math.cos(a2) * 9.15, 0.01, zB], thin, null, 0.55);
          }
        }
      }
      // corner arcs
      const corners = [
        [-PITCH_W / 2, 0, 0, 0.5],
        [PITCH_W / 2, 0, PITCH_L, 2],
        [-PITCH_W / 2, 0, PITCH_L, 1.5],
        [PITCH_W / 2, 0, 0, 2.6]
      ];
      for (const [cx, , cz, start] of corners) {
        this.arc3D(cx, cz, 1, start, start + Math.PI / 2, thin, 8, 0.5);
      }
      // subtle light sweep
      const grad = ctx.createLinearGradient(0, this.h * 0.2, 0, this.h);
      grad.addColorStop(0, "rgba(255,255,255,.045)");
      grad.addColorStop(0.4, "rgba(255,255,255,0)");
      grad.addColorStop(1, "rgba(0,0,0,.12)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    arc3D(cx, cz, r, a0, a1, color, steps, alpha) {
      let prev = null;
      for (let i = 0; i <= steps; i++) {
        const a = a0 + ((a1 - a0) * i) / steps;
        const p = [cx + Math.cos(a) * r, 0.01, cz + Math.sin(a) * r];
        if (prev) this.line3D(prev, p, color, null, alpha);
        prev = p;
      }
    }

    spot3D(x, z, r, color) {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        pts.push([x + Math.cos(a) * r, 0.02, z + Math.sin(a) * r]);
      }
      this.poly3D(pts, color);
    }

    drawAdBoards(ctx) {
      const z = PITCH_L + 1.4;
      const colors = ["#20320e", "#101a24", "#3a2c0a", "#0d1a16"];
      for (let i = -6; i < 6; i++) {
        const x0 = i * 11, x1 = x0 + 10.6;
        const col = colors[(i + 6) % colors.length];
        this.poly3D([[x0, 0, z], [x1, 0, z], [x1, 1.45, z], [x0, 1.45, z]], col, "rgba(255,255,255,.08)");
        this.line3D([x0, 1.45, z], [x1, 1.45, z], "rgba(200,255,46,.35)");
      }
      // side touchline boards, muted
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 12; i++) {
          const z0 = (i / 12) * PITCH_L, z1 = z0 + PITCH_L / 12 - 0.5;
          const col = i % 3 === 0 ? "rgba(24,42,30,.9)" : "rgba(9,20,18,.9)";
          const x = sx * (PITCH_W / 2 + 1.1);
          this.poly3D([[x, 0, z0], [x, 0, z1], [x, 0.72, z1], [x, 0.72, z0]], col, "rgba(255,255,255,.05)");
        }
      }
      // corner flags
      for (const [x, cz] of [[-PITCH_W / 2, 0], [PITCH_W / 2, 0], [-PITCH_W / 2, PITCH_L], [PITCH_W / 2, PITCH_L]]) {
        this.line3D([x, 0, cz], [x, 1.55, cz], "rgba(235,245,255,.7)");
        const top = this.project(x, 1.55, cz);
        if (top) {
          ctx.save();
          ctx.fillStyle = "#c8ff2e";
          ctx.beginPath();
          ctx.moveTo(top.x, top.y);
          ctx.lineTo(top.x + 10, top.y + 3);
          ctx.lineTo(top.x, top.y + 7);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
    }

    drawGoals(ctx) {
      this.drawGoal(PITCH_L, 1);
      this.drawGoal(0, -1);
    }

    drawGoal(goalZ, out) {
      const zBack = goalZ + out * 1.9;
      const white = "rgba(245,250,255,.92)";
      const net = "rgba(235,245,255,.22)";
      const postW = null;
      // front frame
      this.line3D([-GOAL_HALF, 0, goalZ], [-GOAL_HALF, GOAL_H, goalZ], white, postW, 0.95);
      this.line3D([GOAL_HALF, 0, goalZ], [GOAL_HALF, GOAL_H, goalZ], white, postW, 0.95);
      this.line3D([-GOAL_HALF, GOAL_H, goalZ], [GOAL_HALF, GOAL_H, goalZ], white, postW, 0.95);
      // back frame
      this.line3D([-GOAL_HALF, 0, zBack], [-GOAL_HALF, GOAL_H * 0.82, zBack], "rgba(235,245,255,.5)");
      this.line3D([GOAL_HALF, 0, zBack], [GOAL_HALF, GOAL_H * 0.82, zBack], "rgba(235,245,255,.5)");
      this.line3D([-GOAL_HALF, GOAL_H * 0.82, zBack], [GOAL_HALF, GOAL_H * 0.82, zBack], "rgba(235,245,255,.5)");
      // roof
      this.line3D([-GOAL_HALF, GOAL_H, goalZ], [-GOAL_HALF, GOAL_H * 0.82, zBack], net);
      this.line3D([GOAL_HALF, GOAL_H, goalZ], [GOAL_HALF, GOAL_H * 0.82, zBack], net);
      // net grid
      for (let i = 1; i < 8; i++) {
        const x = -GOAL_HALF + (i * GOAL_HALF * 2) / 8;
        this.line3D([x, 0, zBack], [x, GOAL_H * 0.82, zBack], net);
      }
      for (let j = 1; j < 4; j++) {
        const y = (j * GOAL_H * 0.82) / 4;
        this.line3D([-GOAL_HALF, y, zBack], [GOAL_HALF, y, zBack], net);
      }
      // side nets
      for (let j = 1; j < 4; j++) {
        const y = (j * GOAL_H) / 4;
        this.line3D([-GOAL_HALF, y, goalZ], [-GOAL_HALF, y * 0.82, zBack], net);
        this.line3D([GOAL_HALF, y, goalZ], [GOAL_HALF, y * 0.82, zBack], net);
      }
      // net fill hint
      this.poly3D([[-GOAL_HALF, 0, zBack], [GOAL_HALF, 0, zBack], [GOAL_HALF, GOAL_H * 0.82, zBack], [-GOAL_HALF, GOAL_H * 0.82, zBack]], "rgba(220,240,255,.025)");
    }

    drawShadows(ctx) {
      ctx.save();
      for (const p of this.players) {
        const s = this.project(p.x, 0.02, p.z);
        if (!s) continue;
        const r = clamp((0.72 * this.focal) / s.depth, 2, 26);
        ctx.fillStyle = "rgba(0,0,0,.3)";
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, r, r * 0.34, 0, 0, TAU);
        ctx.fill();
      }
      const b = this.ball;
      const bs = this.project(b.x, 0.02, b.z);
      if (bs) {
        const r = clamp((0.24 * this.focal) / bs.depth, 1.5, 10) * (1 + b.h * 0.12);
        ctx.fillStyle = "rgba(0,0,0,.28)";
        ctx.beginPath();
        ctx.ellipse(bs.x, bs.y, r, r * 0.36, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    drawPlayers(ctx) {
      const list = this.players
        .map((p) => ({ p, c: this.toCam(p.x, 0.9, p.z) }))
        .filter((o) => o.c.z > NEAR)
        .sort((a, b) => b.c.z - a.c.z);
      for (const { p } of list) this.drawPlayer(ctx, p);
    }

    drawPlayer(ctx, p) {
      const feet = this.project(p.x, 0, p.z);
      const head = this.project(p.x, 1.83, p.z);
      if (!feet || !head) return;
      const hgt = feet.y - head.y;
      if (hgt < 5) {
        ctx.fillStyle = p.kit.shirt;
        ctx.fillRect(feet.x - 2, feet.y - 4, 4, 4);
        return;
      }
      const w = hgt * 0.35;
      const x = feet.x, y = feet.y;
      const active = p === this.active;
      const owner = this.ball.owner === p;
      const run = Math.sin(p.anim);
      const stride = clamp(Math.hypot(p.vx, p.vz) / 7, 0, 1);
      const top = head.y;
      const shoulderY = top + hgt * 0.17;
      const waistY = y - hgt * 0.41;
      const shortsY = y - hgt * 0.27;
      const skin = p.skin;
      const hair = p.hair;
      const kit = p.kit;
      const shirtInk = ink(kit.shirt);

      ctx.save();
      // active ring
      if (active) {
        const pulse = 1 + Math.sin(this.time * 6) * 0.08;
        ctx.strokeStyle = "rgba(200,255,46,.9)";
        ctx.lineWidth = Math.max(1.2, w * 0.1);
        ctx.beginPath();
        ctx.ellipse(x, y, w * 1.25 * pulse, w * 0.38 * pulse, 0, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = "rgba(200,255,46,.22)";
        ctx.beginPath();
        ctx.ellipse(x, y, w * 1.8 * pulse, w * 0.52 * pulse, 0, 0, TAU);
        ctx.stroke();
      }

      // legs
      ctx.lineCap = "round";
      const legTop = y - hgt * 0.29;
      const legSpread = w * 0.2;
      const strideX = run * stride * w * 0.28;
      for (const side of [-1, 1]) {
        const lx = x + side * legSpread;
        ctx.strokeStyle = skin;
        ctx.lineWidth = Math.max(1.4, w * 0.13);
        ctx.beginPath();
        ctx.moveTo(lx, legTop);
        ctx.lineTo(lx + side * strideX * 0.35, shortsY + hgt * 0.02);
        ctx.stroke();
        ctx.strokeStyle = kit.socks;
        ctx.lineWidth = Math.max(1.5, w * 0.15);
        ctx.beginPath();
        ctx.moveTo(lx + side * strideX * 0.35, shortsY + hgt * 0.02);
        ctx.lineTo(lx + side * strideX, y - hgt * 0.02);
        ctx.stroke();
        // boot
        ctx.strokeStyle = "#0a0f16";
        ctx.lineWidth = Math.max(1.4, w * 0.15);
        ctx.beginPath();
        ctx.moveTo(lx + side * strideX, y - hgt * 0.02);
        ctx.lineTo(lx + side * strideX + side * w * 0.1, y);
        ctx.stroke();
      }

      // shorts
      ctx.fillStyle = kit.shorts;
      ctx.beginPath();
      ctx.roundRect(x - w * 0.48, waistY + hgt * 0.02, w * 0.96, hgt * 0.14, w * 0.1);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.35)";
      ctx.lineWidth = Math.max(0.7, w * 0.03);
      ctx.stroke();

      // arms
      const armSwing = run * stride * hgt * 0.06;
      for (const side of [-1, 1]) {
        ctx.strokeStyle = skin;
        ctx.lineWidth = Math.max(1.3, w * 0.12);
        ctx.beginPath();
        ctx.moveTo(x + side * w * 0.52, shoulderY + hgt * 0.04);
        ctx.lineTo(x + side * (w * 0.66 + stride * w * 0.04), shoulderY + hgt * 0.22 + side * armSwing);
        ctx.stroke();
        if (p.isGK) {
          ctx.fillStyle = "#e8ffb0";
          ctx.beginPath();
          ctx.arc(x + side * (w * 0.66 + stride * w * 0.04), shoulderY + hgt * 0.22 + side * armSwing, w * 0.09, 0, TAU);
          ctx.fill();
        }
      }

      // torso
      const grad = ctx.createLinearGradient(0, shoulderY, 0, waistY);
      grad.addColorStop(0, kit.shirt);
      grad.addColorStop(1, kit.shirt2);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x - w * 0.52, shoulderY + hgt * 0.02);
      ctx.quadraticCurveTo(x - w * 0.56, shoulderY + hgt * 0.15, x - w * 0.45, waistY);
      ctx.lineTo(x + w * 0.45, waistY);
      ctx.quadraticCurveTo(x + w * 0.56, shoulderY + hgt * 0.15, x + w * 0.52, shoulderY + hgt * 0.02);
      ctx.quadraticCurveTo(x, shoulderY - hgt * 0.035, x - w * 0.52, shoulderY + hgt * 0.02);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.4)";
      ctx.lineWidth = Math.max(0.7, w * 0.035);
      ctx.stroke();

      // sleeves / trim
      ctx.strokeStyle = kit.shirt2;
      ctx.lineWidth = Math.max(1.2, w * 0.09);
      ctx.beginPath();
      ctx.moveTo(x - w * 0.47, shoulderY + hgt * 0.04);
      ctx.lineTo(x - w * 0.57, shoulderY + hgt * 0.09);
      ctx.moveTo(x + w * 0.47, shoulderY + hgt * 0.04);
      ctx.lineTo(x + w * 0.57, shoulderY + hgt * 0.09);
      ctx.stroke();
      // collar
      ctx.strokeStyle = shirtInk;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = Math.max(0.7, w * 0.04);
      ctx.beginPath();
      ctx.moveTo(x - w * 0.17, shoulderY + hgt * 0.015);
      ctx.lineTo(x, shoulderY + hgt * 0.075);
      ctx.lineTo(x + w * 0.17, shoulderY + hgt * 0.015);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // number
      if (hgt > 30) {
        ctx.fillStyle = shirtInk;
        ctx.globalAlpha = 0.82;
        ctx.font = `800 ${Math.max(6, w * 0.45)}px "Barlow Condensed", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(p.num), x, shoulderY + (waistY - shoulderY) * 0.47);
        ctx.globalAlpha = 1;
      }

      // neck
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.rect(x - w * 0.1, shoulderY - hgt * 0.05, w * 0.2, hgt * 0.09);
      ctx.fill();
      // head
      const hx = x + Math.sin(p.dir) * w * 0.07;
      const hr = hgt * 0.105;
      const hy = top + hgt * 0.095;
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(hx, hy, hr, 0, TAU);
      ctx.fill();
      // hair
      ctx.fillStyle = hair;
      ctx.beginPath();
      if (p.hairStyle === 2) {
        ctx.arc(hx, hy - hr * 0.25, hr * 1.02, Math.PI * 1.02, Math.PI * 1.98);
        ctx.fill();
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.arc(hx + i * hr * 0.55, hy - hr * 0.62, hr * 0.5, 0, TAU);
          ctx.fill();
        }
      } else if (p.hairStyle === 3) {
        ctx.arc(hx, hy, hr * 1.03, Math.PI * 0.94, Math.PI * 2.06);
        ctx.rect(hx - hr * 1.02, hy - hr * 0.2, hr * 0.35, hr * 1.4);
        ctx.rect(hx + hr * 0.67, hy - hr * 0.2, hr * 0.35, hr * 1.4);
        ctx.fill();
      } else {
        ctx.arc(hx, hy - hr * 0.08, hr * 0.99, Math.PI * 0.96, Math.PI * 2.04);
        ctx.fill();
      }
      // face shadow hint
      ctx.fillStyle = "rgba(0,0,0,.12)";
      ctx.beginPath();
      ctx.ellipse(hx + w * 0.03, hy + hr * 0.45, hr * 0.55, hr * 0.3, 0, 0, TAU);
      ctx.fill();

      // nameplate
      if ((active || owner) && hgt > 26) {
        const label = p.name.length > 15 ? p.name.slice(0, 14) + "…" : p.name;
        ctx.font = `700 ${clamp(hgt * 0.13, 8, 13)}px "Barlow", sans-serif`;
        const tw = ctx.measureText(label.toUpperCase()).width;
        const bxx = x - tw / 2 - 6, byy = top - hgt * 0.16;
        ctx.fillStyle = active ? "rgba(10,18,12,.82)" : "rgba(5,10,16,.72)";
        ctx.beginPath();
        ctx.roundRect(bxx, byy - 10, tw + 12, 15, 4);
        ctx.fill();
        ctx.strokeStyle = active ? "rgba(200,255,46,.5)" : "rgba(255,255,255,.18)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.fillStyle = active ? "#c8ff2e" : "#dfe8f4";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label.toUpperCase(), x, byy - 2.4);
      }
      // active arrow
      if (active) {
        const ay = top - hgt * 0.24 - (this.time * 30 % 6);
        ctx.fillStyle = "#c8ff2e";
        ctx.beginPath();
        ctx.moveTo(x, ay + 6);
        ctx.lineTo(x - 5, ay);
        ctx.lineTo(x + 5, ay);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    drawBall(ctx) {
      const b = this.ball;
      const p = this.project(b.x, b.h + 0.12, b.z);
      if (!p) return;
      const speed = Math.hypot(b.vx, b.vz);
      const r = clamp((0.27 * this.focal) / p.depth, 2.2, 13);
      // trail
      if (speed > 18 && !b.owner) {
        const dir = Math.atan2(b.vz, b.vx);
        for (let i = 1; i <= 4; i++) {
          const d = i * 0.35;
          const tx = b.x - Math.cos(dir) * d;
          const tz = b.z - Math.sin(dir) * d;
          const tp = this.project(tx, b.h + 0.12, tz);
          if (!tp) continue;
          ctx.fillStyle = `rgba(240,255,220,${0.22 - i * 0.04})`;
          ctx.beginPath();
          ctx.arc(tp.x, tp.y, r * (1 - i * 0.12), 0, TAU);
          ctx.fill();
        }
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(b.rot);
      const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.7, "#e7edf4");
      g.addColorStop(1, "#9ca9b6");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.35)";
      ctx.lineWidth = Math.max(0.6, r * 0.09);
      ctx.stroke();
      // pentagon pattern
      ctx.fillStyle = "#18212c";
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i / 5) * TAU;
        const px = Math.cos(a) * r * 0.34, py = Math.sin(a) * r * 0.34;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(20,30,42,.55)";
      ctx.lineWidth = Math.max(0.5, r * 0.06);
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i / 5) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.34, Math.sin(a) * r * 0.34);
        ctx.lineTo(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawParticles(ctx) {
      ctx.save();
      for (const p of this.particles) {
        const a = clamp(p.life, 0, 1);
        ctx.globalAlpha = a;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      }
      ctx.restore();
    }
  }

  window.FCN = window.FCN || {};
  window.FCN.Match = Match;
})();
