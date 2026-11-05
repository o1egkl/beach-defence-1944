const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Import or recreate the weapon mechanics isolated from DOM for pure logic testing
function createWeaponState() {
  return {
    selectedWeapon: 1,
    weapons: {
      1: {
        id: 'mg42',
        slot: 1,
        name: 'HEAVY MACHINE GUN',
        damage: 34,
        clipSize: 45,
        maxAmmo: 45,
        curAmmo: 45,
        reserveAmmo: Infinity,
        rpm: 520,
        fireInterval: 60 / 520,
        lastShotTime: -999,
        reloadDuration: 2.6,
        reloadTimer: 0,
        isReloading: false,
        cooldownDuration: 2.6,
        cooldownTimer: 0,
        isCooling: false
      },
      2: {
        id: 'cannon',
        slot: 2,
        name: '75mm AT CANNON',
        damage: 540,
        clipSize: 4,
        maxAmmo: 24,
        curAmmo: 4,
        reserveAmmo: 20,
        rpm: 32,
        fireInterval: 60 / 32,
        lastShotTime: -999,
        reloadDuration: 2.2,
        reloadTimer: 0,
        isReloading: false,
        cooldownDuration: 2.2,
        cooldownTimer: 0,
        isCooling: false
      },
      3: {
        id: 'rocket',
        slot: 3,
        name: 'HEAVY AT ROCKET',
        damage: 480,
        clipSize: 2,
        maxAmmo: 10,
        curAmmo: 2,
        reserveAmmo: 8,
        rpm: 25,
        fireInterval: 60 / 25,
        lastShotTime: -999,
        reloadDuration: 2.8,
        reloadTimer: 0,
        isReloading: false,
        cooldownDuration: 2.8,
        cooldownTimer: 0,
        isCooling: false
      }
    }
  };
}

function startWeaponReload(state, slot) {
  const w = state.weapons[slot];
  if (!w) return false;
  if (w.isReloading) return false;
  if (w.curAmmo >= w.clipSize) return false;
  if (slot !== 1 && w.reserveAmmo <= 0) return false;

  w.isReloading = true;
  w.isCooling = true;
  w.reloadTimer = w.reloadDuration;
  w.cooldownTimer = w.reloadDuration;
  return true;
}

function updateWeaponTimers(state, dt) {
  for (let s = 1; s <= 3; s++) {
    const w = state.weapons[s];
    if (!w) continue;
    if (w.isReloading || w.reloadTimer > 0) {
      w.reloadTimer = Math.max(0, w.reloadTimer - dt);
      w.cooldownTimer = w.reloadTimer;
      if (w.reloadTimer <= 0) {
        w.isReloading = false;
        w.isCooling = false;
        if (s === 1) {
          w.curAmmo = w.clipSize;
        } else {
          const needed = w.clipSize - w.curAmmo;
          const available = Math.min(needed, w.reserveAmmo);
          w.curAmmo += available;
          w.reserveAmmo -= available;
        }
      }
    }
  }
}

function fireWeapon(state, slot, nowSec) {
  const w = state.weapons[slot];
  if (!w) return { fired: false, reason: 'INVALID_SLOT' };
  if (w.isReloading) return { fired: false, reason: 'RELOADING' };
  if (nowSec - w.lastShotTime < w.fireInterval) return { fired: false, reason: 'FIRE_COOLDOWN' };
  if (w.curAmmo <= 0) {
    if (slot !== 1 && w.reserveAmmo <= 0) {
      return { fired: false, reason: 'NO_AMMO_AND_NO_RESERVE' };
    }
    startWeaponReload(state, slot);
    return { fired: false, reason: 'TRIGGERED_RELOAD' };
  }

  w.lastShotTime = nowSec;
  w.curAmmo--;
  if (w.curAmmo <= 0) {
    if (slot === 1 || w.reserveAmmo > 0) {
      startWeaponReload(state, slot);
    }
  }
  return { fired: true, curAmmo: w.curAmmo, reserveAmmo: w.reserveAmmo };
}

describe('P0 Weapon Ammunition & Reload Mechanics', () => {
  it('Criterion 1: Full magazine prevents redundant reload', () => {
    const state = createWeaponState();
    // Cannon starts full (4/4, reserve: 20)
    const reloaded = startWeaponReload(state, 2);
    assert.equal(reloaded, false, 'Full cannon magazine should not trigger reload');
    assert.equal(state.weapons[2].isReloading, false);
  });

  it('Criterion 2: Partial magazine reloads and replenishes correct ammo from reserve', () => {
    const state = createWeaponState();
    // Fire 2 cannon shots
    fireWeapon(state, 2, 1.0);
    fireWeapon(state, 2, 3.5); // after fireInterval
    assert.equal(state.weapons[2].curAmmo, 2);
    assert.equal(state.weapons[2].reserveAmmo, 20);

    const reloaded = startWeaponReload(state, 2);
    assert.equal(reloaded, true, 'Partial magazine should trigger reload');
    assert.equal(state.weapons[2].isReloading, true);

    // Simulate completion of reload timer
    updateWeaponTimers(state, 2.5);
    assert.equal(state.weapons[2].isReloading, false);
    assert.equal(state.weapons[2].curAmmo, 4, 'Cannon magazine should be restored to 4');
    assert.equal(state.weapons[2].reserveAmmo, 18, '2 shells should be deducted from reserve');
  });

  it('Criterion 3: Zero ammo magazine auto-triggers reload when reserve is available', () => {
    const state = createWeaponState();
    // Drain 2 rockets
    fireWeapon(state, 3, 1.0);
    assert.equal(state.weapons[3].curAmmo, 1);
    fireWeapon(state, 3, 4.0);
    assert.equal(state.weapons[3].curAmmo, 0);
    assert.equal(state.weapons[3].isReloading, true, 'Zero ammo should auto-trigger reload if reserve exists');

    updateWeaponTimers(state, 3.0);
    assert.equal(state.weapons[3].isReloading, false);
    assert.equal(state.weapons[3].curAmmo, 2, 'Rockets reloaded to 2');
    assert.equal(state.weapons[3].reserveAmmo, 6, 'Reserve deducted by 2');
  });

  it('Criterion 4: Empty reserve prevents reload and does not produce negative ammo', () => {
    const state = createWeaponState();
    const w2 = state.weapons[2];
    w2.curAmmo = 0;
    w2.reserveAmmo = 0;

    const reloaded = startWeaponReload(state, 2);
    assert.equal(reloaded, false, 'Should not reload with 0 reserve');
    assert.equal(w2.isReloading, false);

    const res = fireWeapon(state, 2, 10.0);
    assert.equal(res.fired, false);
    assert.equal(res.reason, 'NO_AMMO_AND_NO_RESERVE');
    assert.equal(w2.curAmmo, 0, 'Ammo must not be negative');
    assert.equal(w2.reserveAmmo, 0, 'Reserve must not be negative');
  });

  it('Criterion 5: Parallel/repeated R presses do not duplicate or reset active reload', () => {
    const state = createWeaponState();
    state.weapons[2].curAmmo = 1; // partial
    const firstCall = startWeaponReload(state, 2);
    assert.equal(firstCall, true);
    assert.equal(state.weapons[2].reloadTimer, 2.2);

    // Advance halfway
    updateWeaponTimers(state, 1.0);
    assert.ok(Math.abs(state.weapons[2].reloadTimer - 1.2) < 0.001);

    // Press R again while reloading
    const secondCall = startWeaponReload(state, 2);
    assert.equal(secondCall, false, 'Repeated reload call must be rejected');
    assert.ok(Math.abs(state.weapons[2].reloadTimer - 1.2) < 0.001, 'Reload timer must not be reset');
  });

  it('Criterion 6: Weapon switching does not break or desynchronize ammo', () => {
    const state = createWeaponState();
    // Fire rocket, start reload
    fireWeapon(state, 3, 1.0);
    startWeaponReload(state, 3);
    assert.equal(state.weapons[3].isReloading, true);

    // Switch to weapon 1 and fire
    state.selectedWeapon = 1;
    const mgRes = fireWeapon(state, 1, 1.5);
    assert.equal(mgRes.fired, true);

    // While shooting MG, advance time so Rocket finishes reload
    updateWeaponTimers(state, 3.0);
    assert.equal(state.weapons[3].isReloading, false);
    assert.equal(state.weapons[3].curAmmo, 2);
  });
});
