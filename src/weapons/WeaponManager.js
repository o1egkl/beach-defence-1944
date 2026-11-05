/**
 * Pacific Defence - WeaponManager (Weapons & Ballistics Core)
 * Manages magazines, wave reserves, fire rate intervals, and reload state transitions.
 */

export class WeaponManager {
  static createDefaultWeapons() {
    return {
      1: {
        id: 'mg42',
        slot: 1,
        name: 'HEAVY MACHINE GUN',
        tierName: 'RAPID MG MK I',
        type: 'bullet',
        damage: 34,
        armorPen: 0.15,
        clipSize: 45,
        maxAmmo: 45,
        curAmmo: 45,
        reserveAmmo: Infinity,
        reloadDuration: 2.6,
        reloadTimer: 0,
        isReloading: false,
        cooldownDuration: 2.6,
        cooldownTimer: 0,
        isCooling: false,
        rpm: 520,
        fireInterval: 60 / 520,
        critMult: 2.6,
        lastShotTime: -999
      },
      2: {
        id: 'cannon',
        slot: 2,
        name: '75mm AT CANNON',
        tierName: '75mm CANNON',
        type: 'cannon',
        damage: 540,
        armorPen: 0.90,
        clipSize: 4,
        maxAmmo: 24,
        curAmmo: 4,
        reserveAmmo: 20,
        reloadDuration: 2.2,
        reloadTimer: 0,
        isReloading: false,
        cooldownDuration: 2.2,
        cooldownTimer: 0,
        isCooling: false,
        rpm: 32,
        fireInterval: 60 / 32,
        critMult: 1.8,
        lastShotTime: -999
      },
      3: {
        id: 'rocket',
        slot: 3,
        name: 'HEAVY AT ROCKET',
        tierName: 'AT ROCKET MK I',
        type: 'rocket',
        damage: 480,
        armorPen: 0.75,
        clipSize: 2,
        maxAmmo: 10,
        curAmmo: 2,
        reserveAmmo: 8,
        reloadDuration: 2.8,
        reloadTimer: 0,
        isReloading: false,
        cooldownDuration: 2.8,
        cooldownTimer: 0,
        isCooling: false,
        rpm: 25,
        fireInterval: 60 / 25,
        critMult: 1.5,
        lastShotTime: -999
      }
    };
  }

  static recomputeStats(weapons, upgrades = {}, techMult = 1.0) {
    const dLv = upgrades.damage || 0;
    const aLv = upgrades.ammo || 0;
    const cLv = upgrades.cooldown || 0;
    const fLv = upgrades.firerate || 0;

    const w1 = weapons[1];
    if (w1) {
      w1.damage = Math.round(34 + dLv * 12 * Math.sqrt(techMult));
      w1.armorPen = Math.min(0.92, +(0.15 + dLv * 0.04 * Math.sqrt(techMult)).toFixed(2));
      w1.clipSize = Math.round(45 + aLv * 12 * Math.sqrt(techMult));
      w1.maxAmmo = w1.clipSize;
      w1.reloadDuration = Math.max(0.65, +(2.6 - cLv * 0.16 * Math.sqrt(techMult)).toFixed(2));
      w1.cooldownDuration = w1.reloadDuration;
      w1.rpm = Math.min(1600, Math.round(520 + fLv * 45 * Math.sqrt(techMult)));
      w1.fireInterval = 60 / w1.rpm;
      w1.critMult = +(2.6 + fLv * 0.15).toFixed(2);
      w1.tierName = `RAPID MG MK ${dLv + 1}`;
    }

    const w2 = weapons[2];
    if (w2) {
      w2.damage = Math.round(540 + dLv * 85 * Math.sqrt(techMult));
      w2.reloadDuration = Math.max(1.1, +(2.2 - cLv * 0.12 * Math.sqrt(techMult)).toFixed(2));
      w2.cooldownDuration = w2.reloadDuration;
      w2.clipSize = 4;
      w2.maxAmmo = Math.round(24 + aLv * 4);
      w2.rpm = 32;
      w2.fireInterval = 60 / 32;
    }

    const w3 = weapons[3];
    if (w3) {
      w3.damage = Math.round(480 + dLv * 75 * Math.sqrt(techMult));
      w3.reloadDuration = Math.max(1.4, +(2.8 - cLv * 0.14 * Math.sqrt(techMult)).toFixed(2));
      w3.cooldownDuration = w3.reloadDuration;
      w3.clipSize = 2;
      w3.maxAmmo = Math.round(10 + aLv * 2);
      w3.rpm = 25;
      w3.fireInterval = 60 / 25;
    }
  }

  static startReload(weapon) {
    if (!weapon) return false;
    if (weapon.isReloading) return false;
    if (weapon.curAmmo >= weapon.clipSize) return false;
    if (weapon.slot !== 1 && weapon.reserveAmmo <= 0) return false;

    weapon.isReloading = true;
    weapon.isCooling = true;
    weapon.reloadTimer = weapon.reloadDuration;
    weapon.cooldownTimer = weapon.reloadDuration;
    return true;
  }

  static updateTimers(weapons, dt, onComplete) {
    for (let s = 1; s <= 3; s++) {
      const w = weapons[s];
      if (!w) continue;
      if (w.isReloading || w.reloadTimer > 0) {
        w.reloadTimer -= dt;
        w.cooldownTimer = Math.max(0, w.reloadTimer);
        if (w.reloadTimer <= 0) {
          w.reloadTimer = 0;
          w.cooldownTimer = 0;
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
          if (typeof onComplete === 'function') onComplete(s, w);
        }
      }
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WeaponManager };
}
