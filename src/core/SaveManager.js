/**
 * Pacific Defence - SaveManager (Core Persistence Module)
 * Handles campaign progress serialization, validation, and safe recovery.
 */

const SAVE_STORAGE_KEY = 'pacific_defence_save_v1';

export class SaveManager {
  constructor(storage = (typeof window !== 'undefined' ? window.localStorage : null)) {
    this.storage = storage;
  }

  save(state) {
    if (!this.storage || !state) return false;
    try {
      const data = {
        version: 1,
        savedAt: Date.now(),
        waveIndex: typeof state.waveIndex === 'number' ? state.waveIndex : 0,
        score: typeof state.score === 'number' ? state.score : 0,
        upgrades: {
          damage: (state.upgrades && state.upgrades.damage) || 0,
          ammo: (state.upgrades && state.upgrades.ammo) || 0,
          cooldown: (state.upgrades && state.upgrades.cooldown) || 0,
          firerate: (state.upgrades && state.upgrades.firerate) || 0
        }
      };
      this.storage.setItem(SAVE_STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (err) {
      console.warn('[SaveManager] Save failed:', err);
      return false;
    }
  }

  load() {
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(SAVE_STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== 1 || typeof data.waveIndex !== 'number') return null;
      return {
        version: 1,
        waveIndex: Math.max(0, Math.min(19, Math.floor(data.waveIndex))),
        score: Math.max(0, Math.floor(data.score || 0)),
        upgrades: {
          damage: Math.max(0, Math.min(8, Math.floor((data.upgrades && data.upgrades.damage) || 0))),
          ammo: Math.max(0, Math.min(8, Math.floor((data.upgrades && data.upgrades.ammo) || 0))),
          cooldown: Math.max(0, Math.min(8, Math.floor((data.upgrades && data.upgrades.cooldown) || 0))),
          firerate: Math.max(0, Math.min(8, Math.floor((data.upgrades && data.upgrades.firerate) || 0)))
        }
      };
    } catch (err) {
      console.warn('[SaveManager] Corrupt save handled safely:', err);
      return null;
    }
  }

  clear() {
    if (!this.storage) return false;
    try {
      this.storage.removeItem(SAVE_STORAGE_KEY);
      return true;
    } catch (err) {
      return false;
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SaveManager, SAVE_STORAGE_KEY };
}
