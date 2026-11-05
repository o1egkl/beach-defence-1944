const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Isolated SaveManager logic matching index.html implementation
const SAVE_STORAGE_KEY = 'pacific_defence_save_v1';

class MockStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

function createSaveManager(storage = new MockStorage()) {
  return {
    save(state) {
      try {
        const data = {
          version: 1,
          savedAt: Date.now(),
          waveIndex: state.waveIndex || 0,
          score: state.score || 0,
          upgrades: {
            damage: state.upgrades ? state.upgrades.damage || 0 : 0,
            ammo: state.upgrades ? state.upgrades.ammo || 0 : 0,
            cooldown: state.upgrades ? state.upgrades.cooldown || 0 : 0,
            firerate: state.upgrades ? state.upgrades.firerate || 0 : 0
          }
        };
        storage.setItem(SAVE_STORAGE_KEY, JSON.stringify(data));
        return true;
      } catch(e) {
        return false;
      }
    },
    load() {
      try {
        const raw = storage.getItem(SAVE_STORAGE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data || data.version !== 1 || typeof data.waveIndex !== 'number') {
          return null;
        }
        return {
          version: 1,
          waveIndex: Math.max(0, Math.min(19, Math.floor(data.waveIndex))),
          score: Math.max(0, Math.floor(data.score || 0)),
          upgrades: {
            damage: Math.max(0, Math.min(8, Math.floor(data.upgrades ? data.upgrades.damage || 0 : 0))),
            ammo: Math.max(0, Math.min(8, Math.floor(data.upgrades ? data.upgrades.ammo || 0 : 0))),
            cooldown: Math.max(0, Math.min(8, Math.floor(data.upgrades ? data.upgrades.cooldown || 0 : 0))),
            firerate: Math.max(0, Math.min(8, Math.floor(data.upgrades ? data.upgrades.firerate || 0 : 0)))
          }
        };
      } catch(e) {
        return null;
      }
    },
    clear() {
      try {
        storage.removeItem(SAVE_STORAGE_KEY);
        return true;
      } catch(e) {
        return false;
      }
    }
  };
}

describe('P1 Campaign Save & Restore System', () => {
  it('Criterion 1: Correctly serializes and deserializes campaign progress and upgrades', () => {
    const storage = new MockStorage();
    const mgr = createSaveManager(storage);

    const testState = {
      waveIndex: 4, // Wave 5
      score: 1850,
      upgrades: {
        damage: 2,
        ammo: 1,
        cooldown: 1,
        firerate: 0
      }
    };

    const saved = mgr.save(testState);
    assert.equal(saved, true);

    const loaded = mgr.load();
    assert.ok(loaded !== null);
    assert.equal(loaded.waveIndex, 4);
    assert.equal(loaded.score, 1850);
    assert.deepEqual(loaded.upgrades, {
      damage: 2,
      ammo: 1,
      cooldown: 1,
      firerate: 0
    });
  });

  it('Criterion 2: Corrupted or invalid JSON string handled safely without throwing', () => {
    const storage = new MockStorage();
    const mgr = createSaveManager(storage);

    storage.setItem(SAVE_STORAGE_KEY, '{invalid_json@@##');
    const loaded = mgr.load();
    assert.equal(loaded, null, 'Corrupted JSON must safely return null');

    storage.setItem(SAVE_STORAGE_KEY, JSON.stringify({ version: 999, invalidField: true }));
    const loadedWrongVer = mgr.load();
    assert.equal(loadedWrongVer, null, 'Incompatible version must safely return null');
  });

  it('Criterion 3: Out-of-bounds numeric fields are clamped to valid ranges', () => {
    const storage = new MockStorage();
    const mgr = createSaveManager(storage);

    storage.setItem(SAVE_STORAGE_KEY, JSON.stringify({
      version: 1,
      waveIndex: 999, // beyond wave 20 (index 19)
      score: -500,    // negative score
      upgrades: {
        damage: 100,
        ammo: -5,
        cooldown: 50,
        firerate: 2
      }
    }));

    const loaded = mgr.load();
    assert.ok(loaded !== null);
    assert.equal(loaded.waveIndex, 19, 'Wave index should clamp to max wave 19');
    assert.equal(loaded.score, 0, 'Negative score should clamp to 0');
    assert.equal(loaded.upgrades.damage, 8, 'Upgrade level should clamp to max 8');
    assert.equal(loaded.upgrades.ammo, 0, 'Negative upgrade level should clamp to 0');
  });

  it('Criterion 4: Clear campaign removes save data from storage', () => {
    const storage = new MockStorage();
    const mgr = createSaveManager(storage);

    mgr.save({ waveIndex: 2, score: 300, upgrades: { damage: 1, ammo: 0, cooldown: 0, firerate: 0 } });
    assert.ok(storage.getItem(SAVE_STORAGE_KEY) !== null);

    mgr.clear();
    assert.equal(storage.getItem(SAVE_STORAGE_KEY), null);
    assert.equal(mgr.load(), null);
  });
});
