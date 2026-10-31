/* ============================================================
   FC NOVA — app bootstrap & match session
   ============================================================ */
(function () {
  "use strict";
  const D = window.FCN.data;
  const S = window.FCN.store;
  const UI = window.FCN.ui;
  const Sound = window.FCN.sound;
  const $ = (sel) => document.querySelector(sel);

  let engine = null;
  let lastConfig = null;
  let ending = false;

  function init() {
    Sound.setEnabled(S.getState().settings.sound !== false);
    UI.init();
    UI.render();
    UI.resultHandler.fn = handleResultAction;

    document.addEventListener("pointerdown", () => Sound.resume(), { passive: true, once: false });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && UI.currentScreen === "home") UI.openSetup();
    });
  }

  function startMatch(config) {
    hideMatch();
    lastConfig = config;
    ending = false;
    const st = S.getState();
    const opp = D.TEAMS[config.team] || D.TEAMS.raven;
    const matchRoot = $("#match-root");
    matchRoot.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    UI.hideOverlay();
    $("#sb-home-name").textContent = D.TEAMS.nova.short;
    $("#sb-away-name").textContent = opp.short;
    const hc = $("#sb-home-crest"), ac = $("#sb-away-crest");
    hc.textContent = D.TEAMS.nova.crest;
    ac.textContent = opp.crest;
    hc.style.background = D.TEAMS.nova.color;
    ac.style.background = opp.color;
    hc.style.color = D.TEAMS.nova.text;
    ac.style.color = opp.text;
    $("#sb-home-score").textContent = "0";
    $("#sb-away-score").textContent = "0";
    $("#match-clock").textContent = "00:00";
    $("#match-banner").className = "match-banner";
    $("#commentary").className = "commentary";
    $("#stamina-bar").style.width = "100%";
    const canvas = $("#pitch-canvas");
    engine = new window.FCN.Match(canvas, config, { onEnd: handleMatchEnd });
    engine.start();
    Sound.resume();
  }

  function destroyEngine() {
    if (engine) {
      engine.stop();
      engine = null;
    }
  }

  function hideMatch() {
    const root = $("#match-root");
    root.classList.add("hidden");
    document.body.style.overflow = "";
    UI.hideOverlay();
    destroyEngine();
  }

  function exitMatch() {
    destroyEngine();
    $("#match-root").classList.add("hidden");
    document.body.style.overflow = "";
    UI.hideOverlay();
    UI.navigate("home");
  }

  function handleMatchEnd(result) {
    if (ending) return;
    ending = true;
    const st = S.getState();
    const reward = S.recordMatch({
      goalsFor: result.homeScore,
      goalsAgainst: result.awayScore,
      won: result.won,
      drawn: result.drawn
    });
    let champion = false;
    let nextOpp = null;
    if (result.mode === "cup" && st.cup) {
      if (result.won) {
        if (st.cup.round >= 3) {
          champion = true;
          S.addCoins(5000);
          st.trophies = (st.trophies || 0) + 1;
          st.cup = null;
          reward.coins += 5000;
          Sound.win();
        } else {
          st.cup.round += 1;
          const nxt = D.OPPONENTS[st.cup.round];
          nextOpp = nxt ? D.TEAMS[nxt.team].name : null;
        }
      } else {
        st.cup = null;
      }
      S.changed();
    }
    UI.render();
    UI.showResult({
      mode: result.mode,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      won: result.won && !result.drawn,
      drawn: result.drawn,
      oppName: result.oppName,
      stats: result.stats,
      reward,
      champion,
      nextOpp
    });
  }

  function handleResultAction(action) {
    if (action === "replay") {
      const cfg = lastConfig;
      if (!cfg) { exitMatch(); return; }
      hideMatch();
      setTimeout(() => startMatch({ ...cfg, mode: "quick" }), 80);
      return;
    }
    if (action === "home") {
      exitMatch();
      return;
    }
    if (action === "next") {
      destroyEngine();
      $("#match-root").classList.add("hidden");
      document.body.style.overflow = "";
      UI.hideOverlay();
      UI.openSetup({ mode: "cup" });
      return;
    }
  }

  window.FCN.app = {
    startMatch,
    exitMatch,
    autoPause() { if (engine) engine.autoPause(); },
    get engine() { return engine; }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
