"use strict";

/*
 * Lightweight regression tests for the browser-only game.
 *
 * The production code intentionally has no bundler or DOM dependency.  This
 * harness evaluates the same scripts in a VM context with a deliberately small
 * fake DOM so game-state transitions can be checked in Node as well.
 *
 * Run with:
 *   node --test tests/game-regression.test.js
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const GAME_SCRIPTS = ["data.js", "stories.js", "extra-stories.js", "chaos.js", "app.js"];
const SCREEN_IDS = ["intro-screen", "round-screen", "summary-screen", "awards-screen"];
const ELEMENT_IDS = [
  "consent-checkbox", "start-btn", "chat-btn", "test-btn", "hospital-btn", "next-btn", "restart-btn",
  "toast", "warning", "player-gender", "partner-gender", "round-title", "partner-avatar", "partner-name",
  "partner-flirt", "partner-tags", "action-buttons", "dissatisfaction-value", "dissatisfaction-bar",
  "anxiety-value", "anxiety-bar", "score-value", "testkit-value", "summary-title", "summary-heading",
  "summary-body", "summary-extra", "scoreboard", "finale-heading", "finale-body", "finale-image",
  "finale-status", "replay-overview", "replay-list", ...SCREEN_IDS
];

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...names) {
    names.forEach(name => this.values.add(name));
  }

  remove(...names) {
    names.forEach(name => this.values.delete(name));
  }

  toggle(name, force) {
    const enabled = force === undefined ? !this.values.has(name) : Boolean(force);
    if (enabled) this.values.add(name);
    else this.values.delete(name);
    return enabled;
  }

  contains(name) {
    return this.values.has(name);
  }
}

class FakeElement {
  constructor(id) {
    this.id = id;
    this.attributes = new Map();
    this.classList = new FakeClassList();
    this.style = {};
    this.textContent = "";
    this.innerHTML = "";
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.onclick = null;
    this.onchange = null;
    this.parentElement = null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  querySelector() {
    return new FakeElement("heading");
  }

  focus() {}
}

function createHarness({ savedGame = null, randomValues = [] } = {}) {
  const elements = new Map(ELEMENT_IDS.map(id => [id, new FakeElement(id)]));
  const meter = new FakeElement("dissatisfaction-meter");
  const anxietyMeter = new FakeElement("anxiety-meter");
  elements.get("dissatisfaction-bar").parentElement = meter;
  elements.get("anxiety-bar").parentElement = anxietyMeter;
  elements.get("player-gender").value = "female";
  elements.get("partner-gender").value = "male";

  const listeners = new Map();
  const storage = new Map();
  if (savedGame !== null) storage.set("happy-party-solo-v4", savedGame);

  const document = {
    body: new FakeElement("body"),
    addEventListener(type, callback) {
      listeners.set(type, callback);
    },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new FakeElement(id));
      return elements.get(id);
    },
    querySelectorAll(selector) {
      if (selector === ".screen") return SCREEN_IDS.map(id => elements.get(id));
      if (selector === "#round-screen button") {
        return ["chat-btn", "test-btn", "hospital-btn", "action-buttons"].map(id => elements.get(id));
      }
      // The test harness invokes transitions directly, so dynamic action
      // buttons do not need their own fake nodes.
      return [];
    }
  };

  const localStorage = {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    },
    removeItem(key) {
      storage.delete(key);
    }
  };
  const sessionStorage = {
    getItem() {
      return null;
    },
    setItem() {},
    removeItem() {}
  };

  const randomQueue = [...randomValues];
  const math = Object.create(Math);
  math.random = () => randomQueue.length ? randomQueue.shift() : 0.5;

  const context = vm.createContext({
    console,
    document,
    localStorage,
    Math: math,
    setTimeout(callback) {
      callback();
      return 1;
    },
    clearTimeout() {},
    window: {
      localStorage,
      sessionStorage,
      scrollTo() {},
      requestAnimationFrame(callback) {
        callback();
        return 1;
      }
    }
  });

  for (const script of GAME_SCRIPTS) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, script), "utf8"), context, { filename: script });
  }

  vm.runInContext(`
    globalThis.__gameRegression = {
      start,
      chat,
      test,
      hospital,
      resolve,
      next,
      renderRound,
      applyChaos,
      finale,
      normalizeGame,
      renderReplayItem,
      getGame: () => game,
      setGame: value => { game = value; },
      data: { PARTY_PEOPLE, MALE_STORY_TEMPLATES, FEMALE_STORY_TEMPLATES, MALE_INFECTION_SOURCES, FEMALE_INFECTION_SOURCES, AVATAR_SHEETS, CHAOS_EVENTS, GAME_CONFIG }
    };
  `, context, { filename: "game-regression-bridge.js" });

  const ready = listeners.get("DOMContentLoaded");
  assert.ok(ready, "app.js should register its DOMContentLoaded handler");
  ready();

  return {
    api: context.__gameRegression,
    element: id => document.getElementById(id),
    getSavedGame: () => storage.get("happy-party-solo-v4") ?? null,
    setRandomValues: values => {
      randomQueue.splice(0, randomQueue.length, ...values);
    }
  };
}

test("character library retains its 200-person, safe-story invariants", () => {
  const { data } = createHarness().api;
  const people = data.PARTY_PEOPLE;
  const male = people.filter(person => person.gender === "male");
  const female = people.filter(person => person.gender === "female");
  const avatarPaths = new Set(Object.values(data.AVATAR_SHEETS).flat());
  const venues = people.filter(person => person.venueCameo);

  assert.equal(people.length, 200);
  assert.equal(male.length, 100);
  assert.equal(female.length, 100);
  assert.equal(new Set(people.map(person => person.id)).size, 200);
  assert.equal(new Set(people.map(person => `${person.gender}:${person.name}`)).size, 200);
  assert.equal(new Set(people.map(person => person.title)).size, 200);
  assert.equal(new Set(people.map(person => person.story)).size, 200);
  assert.equal(data.MALE_STORY_TEMPLATES.length, 100);
  assert.equal(data.FEMALE_STORY_TEMPLATES.length, 100);
  assert.equal(Object.keys(data.MALE_INFECTION_SOURCES).length, 30);
  assert.equal(Object.keys(data.FEMALE_INFECTION_SOURCES).length, 30);
  assert.equal(people.filter(person => person.infected).length, 60);
  assert.ok(people.every(person => person.infected === Boolean(person.infectionSource)));
  assert.ok(people.every(person => person.story && person.title && person.healthStory));
  assert.ok(people.every(person => avatarPaths.has(person.image) && Number.isInteger(person.x) && person.x >= 0 && person.x <= 4 && Number.isInteger(person.y) && person.y >= 0 && person.y <= 4));
  assert.equal(venues.length, 12);
  assert.equal(new Set(venues.map(person => person.venueCameo)).size, 12);
  assert.ok(venues.every(person => !person.infected && !person.infectionSource));
});

test("a started round persists and restores the same partner", () => {
  const first = createHarness({ randomValues: [0.12, 0.34, 0.56, 0.78] });
  first.api.start();
  const beforeReload = first.api.getGame();
  const saved = first.getSavedGame();

  assert.ok(beforeReload.partner?.profileId, "a new game should have an active partner");
  assert.ok(saved, "starting a game should write a save");

  const restored = createHarness({ savedGame: saved });
  assert.equal(restored.api.getGame().partner?.profileId, beforeReload.partner.profileId);
  assert.equal(restored.api.getGame().partner?.round, 1);

  restored.api.renderRound();
  assert.equal(restored.api.getGame().partner?.profileId, beforeReload.partner.profileId, "resume must not reroll the active partner");
});

test("chat progress is saved and survives a reload", () => {
  const first = createHarness();
  first.api.start();
  const originalPartner = first.api.getGame().partner.profileId;

  first.api.chat();
  const stateAfterChat = first.api.getGame();
  const saved = first.getSavedGame();

  assert.equal(stateAfterChat.heat, 53);
  assert.equal(stateAfterChat.partner.chat, true);
  assert.ok(saved, "chat should immediately persist game state");

  const restored = createHarness({ savedGame: saved });
  const restoredState = restored.api.getGame();
  assert.equal(restoredState.heat, 53);
  assert.equal(restoredState.partner?.chat, true);
  assert.equal(restoredState.partner?.profileId, originalPartner);
});

test("a refreshed final summary always routes back to the replay", () => {
  const savedGame = JSON.stringify({
    schemaVersion: 4,
    phase: "summary",
    round: 10,
    score: 12,
    anxiety: 8,
    heat: 0,
    testkits: 0,
    hospitals: 1,
    infected: false,
    playerGender: "male",
    partnerGender: "female",
    ended: false,
    result: null,
    log: []
  });
  const harness = createHarness({ savedGame });

  assert.equal(harness.api.getGame().phase, "finale");
  assert.equal(harness.element("start-btn").textContent, "查看上一趟復盤");
  assert.equal(harness.element("start-btn").disabled, false);
});

test("chat reaching 100% heat ends the game immediately", () => {
  const harness = createHarness();
  harness.api.start();
  harness.api.getGame().heat = 97;

  harness.api.chat();
  const state = harness.api.getGame();

  assert.equal(state.heat, 100);
  assert.equal(state.ended, true);
  assert.equal(state.result, "urge");
  assert.equal(state.phase, "finale");
  assert.equal(state.log.length, 1);
  assert.match(state.log[0].action, /聊天後壓抑失控/);
});

test("a skip chaos event writes an explicit timeline row", () => {
  const harness = createHarness();
  harness.api.start();
  const state = harness.api.getGame();
  state.round = 1;
  state.log = [];
  const entry = { kind: "encounter", round: 1, event: null, heat: state.heat, anxiety: state.anxiety };

  // applyChaos first rolls against 15%, then picks the 11th of 12 events,
  // which is the skip event ("大樓突然停電").
  harness.setRandomValues([0, 0.84]);
  const event = harness.api.applyChaos(entry);
  const skipped = state.log.at(-1);

  assert.equal(event?.skip, true);
  assert.equal(event?.appliedSkip, true);
  assert.equal(state.round, 2);
  assert.equal(skipped.kind, "skipped");
  assert.equal(skipped.round, 2);
  assert.equal(skipped.action, "今晚被突發事件略過");
  assert.equal(skipped.skipReason?.title, event.title);
  assert.equal(skipped.skipReason?.appliedSkip, true);
});

test("legacy or malicious saves cannot inject replay HTML", () => {
  const payload = "<img src=x onerror=globalThis.pwned=1>";
  const savedGame = JSON.stringify({
    schemaVersion: 1,
    ended: true,
    result: "unfinished",
    round: 2,
    heat: 50,
    anxiety: 0,
    playerGender: "female",
    partnerGender: "male",
    log: [
      {
        round: 1,
        profileId: "male-1",
        name: payload,
        avatar: "javascript:alert(1)",
        action: `<svg onload=globalThis.pwned=2>${payload}</svg>`,
        story: payload,
        healthStory: payload,
        heat: 50,
        anxiety: 0,
        risk: 0
      },
      {
        round: 2,
        name: payload,
        gender: "male",
        avatar: "javascript:alert(1)",
        action: payload,
        heat: 50,
        anxiety: 0,
        risk: 0
      }
    ]
  });
  const harness = createHarness({ savedGame });

  harness.api.finale();
  const replayHTML = harness.element("replay-list").innerHTML;
  const state = harness.api.getGame();

  assert.doesNotMatch(replayHTML, /<\s*(?:img|svg|script)\b/i);
  assert.match(replayHTML, /&lt;img src=x onerror=globalThis\.pwned=1&gt;/);
  assert.equal(state.log[0].name, harness.api.data.PARTY_PEOPLE.find(person => person.id === "male-1").name, "canonical profile must win over stale save fields");
  assert.equal(state.log[0].avatar, harness.api.data.PARTY_PEOPLE.find(person => person.id === "male-1").image);
  assert.equal(state.log[1].avatar, "", "untrusted avatar URLs must be discarded");
});
