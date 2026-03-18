'use strict';

// ==================== Office Module ====================
// Pixel office panorama with all sub-features
// Dependencies: constants.js, ghost-cells.js (for drawing functions, shared state)

GT.office = GT.office || {};

// ==================== Office State ====================
// officeActive defined in index.html (var, global scope)
let officeAnimId = null;
let officeFrame = 0;
let officeW, officeH, officeDpr;
let officeCanvas, officeCtx;
let floorGridCanvas;

// ==================== Cross-module references ====================
// ghost-cells.js defines these in its IIFE; we need them as bare names here.
// Using var (not let/const) so they can be reassigned after ghost-cells init.
var busyStartTimes = { 1: 0, 2: 0, 3: 0, 4: 0 };
var celebrationState = { 1: null, 2: null, 3: null, 4: null };
var celebrationParticles = [];
var activeIdleInteraction = null;
var ghostEmote = { 0: { type: null, frame: 0, duration: 0 }, 1: { type: null, frame: 0, duration: 0 }, 2: { type: null, frame: 0, duration: 0 }, 3: { type: null, frame: 0, duration: 0 } };

// Sync references from ghost-cells after init
GT._syncOfficeRefs = function() {
  const gc = GT.ghostCells;
  if (!gc) return;
  if (gc.busyStartTimes) busyStartTimes = gc.busyStartTimes;
  if (gc.celebrationState) celebrationState = gc.celebrationState;
  if (gc.celebrationParticles) celebrationParticles = gc.celebrationParticles;
  if (gc.ghostEmote) ghostEmote = gc.ghostEmote;
};

// termStates defined in constants.js

// getColorSlot in constants.js
// function getColorSlot(sessionId) {
    // Clean up dead sessions first
    // Find the lowest unused slot
    let slot = 0;
// prevTermStates defined in constants.js

// ==================== Animation Constants ====================
// ANIM constant defined in constants.js

// ==================== Marble Slingshot Minigame ====================
// MARBLE constant defined in constants.js

const marble = {
  x: 0, y: 0,
  vx: 0, vy: 0,
  active: false,
  dragging: false,
  dragX: 0, dragY: 0,
  trail: [],
  fadeOut: 0,
  respawnTimer: 0,
};

let slingshotX = 0, slingshotY = 0;

// Per-desk states
const monitorDamage = { 0: 0, 1: 0, 2: 0, 3: 0 };
const ghostScared = { 0: 0, 1: 0, 2: 0, 3: 0 };
const ghostRepairing = { 0: 0, 1: 0, 2: 0, 3: 0 };
const shieldFlash = { 0: 0, 1: 0, 2: 0, 3: 0 };
const ghostPushVel = { 0: {vx:0,vy:0}, 1: {vx:0,vy:0}, 2: {vx:0,vy:0}, 3: {vx:0,vy:0} };

// Collision sparks
const marbleSparks = [];

function resetMarbleToSlingshot() {
  slingshotX = officeW / 2;
  slingshotY = officeH - 35;
  marble.x = slingshotX;
  marble.y = slingshotY;
  marble.vx = 0;
  marble.vy = 0;
  marble.active = false;
  marble.dragging = false;
  marble.trail = [];
  marble.fadeOut = 0;
  marble.respawnTimer = 0;
}

function spawnSparks(x, y, count, color) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 2;
    marbleSparks.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: MARBLE.SPARK_LIFE,
      color: color || '#fff',
    });
  }
}

function spawnLaunchParticles(x, y, vx, vy) {
  for (let i = 0; i < 4; i++) {
    const angle = Math.atan2(vy, vx) + Math.PI + (Math.random() - 0.5) * 1.2;
    const speed = 1.5 + Math.random() * 2;
    marbleSparks.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: MARBLE.LAUNCH_PARTICLE_LIFE,
      color: '#fbbf24',
    });
  }
}

function updateMarble(deskPositions, deskW, deskH, monW, monH, charScale) {
  // Update sparks
  for (let i = marbleSparks.length - 1; i >= 0; i--) {
    const s = marbleSparks[i];
    s.x += s.vx; s.y += s.vy;
    s.vy += 0.05;
    s.life--;
    if (s.life <= 0) marbleSparks.splice(i, 1);
  }

  // Decrement state counters
  for (let i = 0; i < 4; i++) {
    if (monitorDamage[i] > 0) monitorDamage[i]--;
    if (ghostScared[i] > 0) ghostScared[i]--;
    if (ghostRepairing[i] > 0) {
      ghostRepairing[i]--;
      if (ghostRepairing[i] === 0) monitorDamage[i] = 0; // repair done
    }
    if (shieldFlash[i] > 0) shieldFlash[i]--;
    // Decay push velocity
    ghostPushVel[i].vx *= 0.9;
    ghostPushVel[i].vy *= 0.9;
  }

  // Handle respawn
  if (marble.fadeOut > 0) {
    marble.fadeOut--;
    if (marble.fadeOut <= 0) {
      marble.respawnTimer = MARBLE.RESPAWN_FRAMES;
    }
    return;
  }
  if (marble.respawnTimer > 0) {
    marble.respawnTimer--;
    if (marble.respawnTimer <= 0) {
      resetMarbleToSlingshot();
    }
    return;
  }

  if (marble.dragging || !marble.active) return;

  // Physics
  marble.vy += MARBLE.GRAVITY;
  marble.vx *= MARBLE.FRICTION;
  marble.vy *= MARBLE.FRICTION;
  marble.x += marble.vx;
  marble.y += marble.vy;

  // Trail
  marble.trail.push({ x: marble.x, y: marble.y });
  if (marble.trail.length > MARBLE.TRAIL_LEN) marble.trail.shift();

  // Wall bounce (left, right, top)
  if (marble.x - MARBLE.RADIUS < 0) {
    marble.x = MARBLE.RADIUS;
    marble.vx = -marble.vx * MARBLE.BOUNCE_DECAY;
    spawnSparks(marble.x, marble.y, 2, '#fff');
  }
  if (marble.x + MARBLE.RADIUS > officeW) {
    marble.x = officeW - MARBLE.RADIUS;
    marble.vx = -marble.vx * MARBLE.BOUNCE_DECAY;
    spawnSparks(marble.x, marble.y, 2, '#fff');
  }
  if (marble.y - MARBLE.RADIUS < 0) {
    marble.y = MARBLE.RADIUS;
    marble.vy = -marble.vy * MARBLE.BOUNCE_DECAY;
    spawnSparks(marble.x, marble.y, 2, '#fff');
  }
  // Bottom boundary
  if (marble.y + MARBLE.RADIUS > officeH) {
    marble.y = officeH - MARBLE.RADIUS;
    marble.vy = -marble.vy * MARBLE.BOUNCE_DECAY;
    spawnSparks(marble.x, marble.y, 2, '#fff');
  }

  // Ghost & monitor collision
  for (let i = 0; i < 4; i++) {
    const hasSession = i < GT.state.sessionList.length && !GT.state.sessionList[i]?.exited;
    if (!hasSession) continue;

    const dp = deskPositions[i];
    const state = termStates[i + 1] || 'idle';
    const gPos = ghostCurrentPos[i];
    if (!gPos.initialized) continue;
    const gx = gPos.x + ghostPushVel[i].vx;
    const gy = gPos.y + ghostPushVel[i].vy;

    const dist = Math.hypot(marble.x - gx, marble.y - gy);

    if (state === 'busy') {
      // Only busy (working) ghost has shield
      if (dist < MARBLE.SHIELD_RADIUS * charScale) {
        // Bounce off shield
        const nx = (marble.x - gx) / dist;
        const ny = (marble.y - gy) / dist;
        const dot = marble.vx * nx + marble.vy * ny;
        marble.vx -= 2 * dot * nx;
        marble.vy -= 2 * dot * ny;
        marble.vx *= MARBLE.BOUNCE_DECAY;
        marble.vy *= MARBLE.BOUNCE_DECAY;
        // Push marble out of shield
        marble.x = gx + nx * (MARBLE.SHIELD_RADIUS * charScale + MARBLE.RADIUS);
        marble.y = gy + ny * (MARBLE.SHIELD_RADIUS * charScale + MARBLE.RADIUS);
        shieldFlash[i] = MARBLE.SHIELD_FLASH_FRAMES;
        spawnSparks(marble.x, marble.y, 3, GHOST_COLORS[GT.getColorSlot(GT.state.sessionList[i]?.id) || i]);
        continue; // Shield protects monitor too
      }
    } else {
      // Idle ghost — can be hit
      if (dist < MARBLE.GHOST_HIT_RADIUS * charScale) {
        // Push ghost away
        const nx = (gx - marble.x) / (dist || 1);
        const ny = (gy - marble.y) / (dist || 1);
        ghostPushVel[i].vx += nx * MARBLE.PUSH_FORCE;
        ghostPushVel[i].vy += ny * MARBLE.PUSH_FORCE;
        ghostScared[i] = MARBLE.SCARED_FRAMES;
        // Feature 6: Achievement tracking for sharpshooter
        if (typeof checkAchievement === 'function') checkAchievement('sharpshooter');
        // Marble slows a bit but continues
        marble.vx *= 0.7;
        marble.vy *= 0.7;
        spawnSparks(marble.x, marble.y, 3, '#fff');
      }
    }

    // Monitor collision (AABB)
    const isRight = (i === 1 || i === 3);
    const monX = isRight ? dp.x + deskW - monW - 3 : dp.x + 3;
    const monY = dp.y - monH - 2;
    // Only check if shield is not protecting (only busy has shield)
    if (state !== 'busy') {
      if (marble.x + MARBLE.RADIUS > monX && marble.x - MARBLE.RADIUS < monX + monW &&
          marble.y + MARBLE.RADIUS > monY && marble.y - MARBLE.RADIUS < monY + monH) {
        // Bounce out
        const cx = monX + monW / 2, cy = monY + monH / 2;
        const dx = marble.x - cx, dy = marble.y - cy;
        if (Math.abs(dx / monW) > Math.abs(dy / monH)) {
          marble.vx = -marble.vx * MARBLE.BOUNCE_DECAY;
          marble.x = dx > 0 ? monX + monW + MARBLE.RADIUS : monX - MARBLE.RADIUS;
        } else {
          marble.vy = -marble.vy * MARBLE.BOUNCE_DECAY;
          marble.y = dy > 0 ? monY + monH + MARBLE.RADIUS : monY - MARBLE.RADIUS;
        }
        if (monitorDamage[i] === 0 && ghostRepairing[i] === 0) {
          monitorDamage[i] = MARBLE.DAMAGE_FRAMES;
          ghostRepairing[i] = MARBLE.REPAIR_FRAMES;
        }
        spawnSparks(marble.x, marble.y, 3, '#ef4444');
      }
    }
  }

  // Speed check → stop
  const speed = Math.hypot(marble.vx, marble.vy);
  if (speed < MARBLE.SPEED_THRESHOLD) {
    marble.active = false;
    marble.fadeOut = MARBLE.FADEOUT_FRAMES;
    // Feature 6: Reset consecutive hits on miss
    if (typeof checkAchievement === 'function') checkAchievement('marble_miss');
  }
}

function drawSlingshot() {
  const c = officeCtx;
  slingshotX = officeW / 2;
  slingshotY = officeH - 35;

  const forkH = 18, forkW = 10;
  const baseX = slingshotX, baseY = slingshotY;

  // Y-shaped stick
  c.strokeStyle = '#8B4513'; c.lineWidth = 3; c.lineCap = 'round';
  // Trunk
  c.beginPath(); c.moveTo(baseX, baseY + 8); c.lineTo(baseX, baseY - forkH + 6); c.stroke();
  // Left fork
  c.beginPath(); c.moveTo(baseX, baseY - forkH + 6); c.lineTo(baseX - forkW, baseY - forkH); c.stroke();
  // Right fork
  c.beginPath(); c.moveTo(baseX, baseY - forkH + 6); c.lineTo(baseX + forkW, baseY - forkH); c.stroke();

  const leftTip = { x: baseX - forkW, y: baseY - forkH };
  const rightTip = { x: baseX + forkW, y: baseY - forkH };

  if (marble.dragging) {
    // Rubber bands stretch to drag point
    c.strokeStyle = '#c0392b'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(leftTip.x, leftTip.y); c.lineTo(marble.dragX, marble.dragY); c.stroke();
    c.beginPath(); c.moveTo(rightTip.x, rightTip.y); c.lineTo(marble.dragX, marble.dragY); c.stroke();

    // Marble at drag position
    drawMarbleBall(marble.dragX, marble.dragY, 1);

    // Aim line (dashed, opposite direction)
    const dx = marble.dragX - slingshotX;
    const dy = marble.dragY - (slingshotY - forkH + 6);
    const aimX = slingshotX - dx * 2;
    const aimY = (slingshotY - forkH + 6) - dy * 2;
    c.strokeStyle = 'rgba(255,255,255,0.3)'; c.lineWidth = 1;
    c.setLineDash([MARBLE.AIM_DASH_LEN, MARBLE.AIM_GAP_LEN]);
    c.beginPath(); c.moveTo(slingshotX, slingshotY - forkH + 6); c.lineTo(aimX, aimY); c.stroke();
    c.setLineDash([]);
  } else {
    // Rubber bands at rest (connect to marble rest position)
    c.strokeStyle = '#c0392b'; c.lineWidth = 2;
    const restY = baseY - forkH + 6;
    c.beginPath(); c.moveTo(leftTip.x, leftTip.y); c.lineTo(slingshotX, restY); c.stroke();
    c.beginPath(); c.moveTo(rightTip.x, rightTip.y); c.lineTo(slingshotX, restY); c.stroke();

    if (!marble.active && marble.fadeOut <= 0 && marble.respawnTimer <= 0) {
      drawMarbleBall(slingshotX, restY, 1);
    }
  }
}

function drawMarbleBall(x, y, alpha) {
  const c = officeCtx;
  c.globalAlpha = alpha;
  // Main ball
  c.fillStyle = '#e2e8f0';
  c.beginPath(); c.arc(x, y, MARBLE.RADIUS, 0, Math.PI * 2); c.fill();
  // Dark edge
  c.strokeStyle = '#94a3b8'; c.lineWidth = 1;
  c.beginPath(); c.arc(x, y, MARBLE.RADIUS, 0, Math.PI * 2); c.stroke();
  // Highlight
  c.fillStyle = '#fff';
  c.beginPath(); c.arc(x - 2, y - 2, MARBLE.RADIUS * 0.35, 0, Math.PI * 2); c.fill();
  c.globalAlpha = 1;
}

function drawMarble() {
  const c = officeCtx;

  if (marble.active) {
    // Trail
    marble.trail.forEach((p, i) => {
      c.globalAlpha = (i + 1) / marble.trail.length * 0.3;
      c.fillStyle = '#e2e8f0';
      const r = MARBLE.RADIUS * (i + 1) / marble.trail.length * 0.7;
      c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2); c.fill();
    });
    c.globalAlpha = 1;
    drawMarbleBall(marble.x, marble.y, 1);
  } else if (marble.fadeOut > 0) {
    drawMarbleBall(marble.x, marble.y, marble.fadeOut / MARBLE.FADEOUT_FRAMES);
  }

  // Sparks
  marbleSparks.forEach(s => {
    c.globalAlpha = s.life / MARBLE.SPARK_LIFE;
    c.fillStyle = s.color;
    c.beginPath(); c.arc(s.x, s.y, 1.5, 0, Math.PI * 2); c.fill();
  });
  c.globalAlpha = 1;
}

function drawShield(cx, cy, charScale, color, flashFrames) {
  const c = officeCtx;
  const r = MARBLE.SHIELD_RADIUS * charScale;
  const alpha = flashFrames > 0 ? 0.35 + Math.sin(flashFrames * 0.5) * 0.15 : 0.12;
  c.globalAlpha = alpha;
  c.fillStyle = color;
  c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
  c.globalAlpha = Math.min(alpha + 0.1, 0.5);
  c.strokeStyle = color; c.lineWidth = 1.5;
  c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
  // Glow
  if (flashFrames > 0) {
    c.globalAlpha = 0.25;
    c.shadowColor = color; c.shadowBlur = 12;
    c.beginPath(); c.arc(cx, cy, r + 2, 0, Math.PI * 2); c.stroke();
    c.shadowBlur = 0;
  }
  c.globalAlpha = 1;
}

function drawDamagedMonitor(x, y, w, h, damageFrame) {
  const c = officeCtx;
  const sx = x + 5, sy = y + 5, sw = w - 10, sh = h - 12;
  const progress = 1 - (damageFrame / MARBLE.DAMAGE_FRAMES); // 0→1 as time passes

  // Dark broken screen background
  c.fillStyle = '#0a0a0a';
  c.fillRect(sx, sy, sw, sh);

  // Crack line down the middle (splits screen in two)
  c.save();
  c.beginPath();
  const crackX = sx + sw * 0.48;
  c.moveTo(crackX, sy);
  // Jagged crack line
  c.lineTo(crackX + 2, sy + sh * 0.15);
  c.lineTo(crackX - 3, sy + sh * 0.3);
  c.lineTo(crackX + 4, sy + sh * 0.45);
  c.lineTo(crackX - 2, sy + sh * 0.6);
  c.lineTo(crackX + 3, sy + sh * 0.75);
  c.lineTo(crackX - 1, sy + sh * 0.9);
  c.lineTo(crackX + 1, sy + sh);
  c.strokeStyle = '#fff'; c.lineWidth = 1.5;
  c.stroke();

  // Crack branches
  c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 0.8;
  c.beginPath(); c.moveTo(crackX + 2, sy + sh * 0.15); c.lineTo(crackX + 8, sy + sh * 0.22); c.stroke();
  c.beginPath(); c.moveTo(crackX - 3, sy + sh * 0.3); c.lineTo(crackX - 9, sy + sh * 0.38); c.stroke();
  c.beginPath(); c.moveTo(crackX + 4, sy + sh * 0.45); c.lineTo(crackX + 10, sy + sh * 0.5); c.stroke();
  c.restore();

  // Left half tinted red, right half tinted blue (split screen effect)
  c.fillStyle = officeFrame % 6 < 3 ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)';
  c.fillRect(sx, sy, sw * 0.48, sh);
  c.fillStyle = officeFrame % 8 < 4 ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.06)';
  c.fillRect(sx + sw * 0.52, sy, sw * 0.48, sh);

  // Glitch offset — left and right halves shift vertically
  const glitchY = Math.sin(officeFrame * 0.5) * 2;
  c.fillStyle = 'rgba(239,68,68,0.2)';
  c.fillRect(sx, sy + glitchY, sw * 0.47, 2);
  c.fillStyle = 'rgba(59,130,246,0.2)';
  c.fillRect(sx + sw * 0.53, sy - glitchY, sw * 0.47, 2);

  // Static noise (sparse)
  for (let i = 0; i < 8; i++) {
    const nx = sx + Math.random() * sw;
    const ny = sy + Math.random() * sh;
    c.fillStyle = `rgba(255,255,255,${0.1 + Math.random() * 0.3})`;
    c.fillRect(nx, ny, Math.random() * 4 + 1, 1);
  }

  // Sparks flying from crack (first 60 frames only)
  if (damageFrame > MARBLE.DAMAGE_FRAMES - 60) {
    for (let i = 0; i < 2; i++) {
      const sparkX = crackX + (Math.random() - 0.5) * 6;
      const sparkY = sy + Math.random() * sh;
      c.fillStyle = '#fef08a';
      c.globalAlpha = 0.5 + Math.random() * 0.5;
      c.beginPath(); c.arc(sparkX, sparkY, 1, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1;
    }
  }
}

// ==================== Celebration Particle System ====================

function triggerCelebration(ghostIdx) {
  const count = ANIM.CELEBRATE_PARTICLE_COUNT;
  const color = GHOST_COLORS[ghostIdx];
  for (let i = 0; i < count; i++) {
    celebrationParticles.push({
      ghostIdx: ghostIdx,
      x: 0, y: 0, // will be set relative to ghost position
      vx: (Math.random() - 0.5) * 4,
      vy: -Math.random() * 3 - 1,
      life: ANIM.CELEBRATE_PARTICLE_LIFE,
      maxLife: ANIM.CELEBRATE_PARTICLE_LIFE,
      color: Math.random() > 0.4 ? color : '#fbbf24',
      size: Math.random() * 3 + 1,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.2,
    });
  }
  celebrationState[ghostIdx + 1] = { frame: 0, duration: ANIM.CELEBRATE_DURATION };
}

function updateCelebrationParticles() {
  for (let i = celebrationParticles.length - 1; i >= 0; i--) {
    const p = celebrationParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.08; // gravity
    p.rot += p.rotSpeed;
    p.life--;
    if (p.life <= 0) celebrationParticles.splice(i, 1);
  }
  // Update celebration jump states
  for (let idx = 1; idx <= 4; idx++) {
    if (celebrationState[idx]) {
      celebrationState[idx].frame++;
      if (celebrationState[idx].frame > celebrationState[idx].duration) {
        celebrationState[idx] = null;
      }
    }
  }
}

// ==================== Weather System ====================
const weatherTypes = ['clear', 'rain', 'snow'];
let currentWeather = 'clear';
let weatherTimer = 0;
const weatherParticles = [];
const MAX_WEATHER_PARTICLES = 15;

function updateWeather() {
  weatherTimer++;
  if (weatherTimer >= ANIM.WEATHER_CHANGE_INTERVAL) {
    weatherTimer = 0;
    currentWeather = weatherTypes[Math.floor(Math.random() * weatherTypes.length)];
    weatherParticles.length = 0;
  }
}

function spawnWeatherParticle(w, h) {
  if (currentWeather === 'rain' && weatherParticles.length < MAX_WEATHER_PARTICLES) {
    weatherParticles.push({ x: Math.random() * w, y: 0, vy: 2 + Math.random() * 2, size: 2 + Math.random() * 2, type: 'rain' });
  } else if (currentWeather === 'snow' && weatherParticles.length < 8) {
    weatherParticles.push({ x: Math.random() * w, y: 0, vx: (Math.random() - 0.5) * 0.5, vy: 0.3 + Math.random() * 0.5, size: 1.5 + Math.random() * 1.5, type: 'snow' });
  }
}

function updateWeatherParticles(h) {
  for (let i = weatherParticles.length - 1; i >= 0; i--) {
    const p = weatherParticles[i];
    p.y += p.vy;
    if (p.vx) p.x += p.vx;
    if (p.y > h) weatherParticles.splice(i, 1);
  }
}

// ==================== Idle Interaction System ====================
let idleInteractionTimer = 0;

function checkIdleInteractions() {
  idleInteractionTimer++;
  if (activeIdleInteraction) {
    activeIdleInteraction.frame++;
    if (activeIdleInteraction.frame > activeIdleInteraction.duration) {
      activeIdleInteraction = null;
    }
    return;
  }
  if (idleInteractionTimer < ANIM.IDLE_CHECK_INTERVAL) return;
  idleInteractionTimer = 0;

  // Find idle ghosts
  const idleGhosts = [];
  for (let i = 0; i < 4; i++) {
    if (i < GT.state.sessionList.length && !GT.state.sessionList[i]?.exited && termStates[i + 1] === 'idle') {
      idleGhosts.push(i);
    }
  }
  if (idleGhosts.length >= 2 && Math.random() < ANIM.IDLE_CHAT_CHANCE) {
    const types = ['chat', 'sleep', 'look'];
    const type = types[Math.floor(Math.random() * types.length)];
    const g1 = idleGhosts[Math.floor(Math.random() * idleGhosts.length)];
    let g2 = g1;
    while (g2 === g1) g2 = idleGhosts[Math.floor(Math.random() * idleGhosts.length)];
    activeIdleInteraction = { type, ghosts: [g1, g2], frame: 0, duration: 180 };
  }
}

// ==================== Feature 1: Ghost Emote System ====================
// ghostEmote declared as var at top

function triggerGhostEmote(ghostIdx, type, duration) {
  const e = ghostEmote[ghostIdx];
  if (!e) return;
  e.type = type;
  e.frame = 0;
  e.duration = duration;
}

function updateGhostEmotes() {
  for (let i = 0; i < 4; i++) {
    const e = ghostEmote[i];
    if (e.type) {
      e.frame++;
      if (e.frame >= e.duration && e.type !== 'thinking') {
        e.type = null; e.frame = 0; e.duration = 0;
      }
    }
  }
}

// ==================== Feature 2: Coffee System ====================
const coffeeState = { active: false, phase: -1, frame: 0, ghostIdx: -1, rushMode: false, cupVisible: true };
let coffeeCheckTimer = 0;
let lastBusyEndFrame = { 0: 0, 1: 0, 2: 0, 3: 0 };
const COFFEE_TABLE_OFFSET = { x: 0, y: -5 }; // relative to lounge center

function updateCoffeeSystem() {
  if (coffeeState.active) {
    coffeeState.frame++;
    const phaseDuration = coffeeState.rushMode ? 30 : 60;
    const drinkDuration = coffeeState.rushMode ? 30 : 60;
    switch (coffeeState.phase) {
      case ANIM.COFFEE_PHASE_WALK:
        if (coffeeState.frame > 120) { coffeeState.phase = ANIM.COFFEE_PHASE_PICKUP; coffeeState.frame = 0; coffeeState.cupVisible = false; }
        break;
      case ANIM.COFFEE_PHASE_PICKUP:
        if (coffeeState.frame > phaseDuration) { coffeeState.phase = ANIM.COFFEE_PHASE_DRINK; coffeeState.frame = 0; }
        break;
      case ANIM.COFFEE_PHASE_DRINK:
        if (coffeeState.frame > drinkDuration) { coffeeState.phase = ANIM.COFFEE_PHASE_PUTDOWN; coffeeState.frame = 0; }
        break;
      case ANIM.COFFEE_PHASE_PUTDOWN:
        if (coffeeState.frame > 30) { coffeeState.phase = ANIM.COFFEE_PHASE_RETURN; coffeeState.frame = 0; coffeeState.cupVisible = true; }
        break;
      case ANIM.COFFEE_PHASE_RETURN:
        if (coffeeState.frame > 120) { coffeeState.phase = ANIM.COFFEE_PHASE_STARS; coffeeState.frame = 0; }
        break;
      case ANIM.COFFEE_PHASE_STARS:
        if (coffeeState.frame > 120) { coffeeState.active = false; coffeeState.phase = -1; coffeeState.ghostIdx = -1; }
        break;
    }
    return;
  }
  coffeeCheckTimer++;
  if (coffeeCheckTimer < ANIM.COFFEE_CHECK_INTERVAL) return;
  coffeeCheckTimer = 0;
  const frame = officeFrame || gcFrame;
  for (let i = 0; i < 4; i++) {
    if (i >= GT.state.sessionList.length || GT.state.sessionList[i]?.exited) continue;
    if (termStates[i + 1] !== 'idle') continue;
    const idleTime = frame - (idleStartTimes[i + 1] || frame);
    if (idleTime < ANIM.COFFEE_IDLE_THRESHOLD) continue;
    if (Math.random() < ANIM.COFFEE_TRIGGER_CHANCE) {
      coffeeState.active = true;
      coffeeState.phase = ANIM.COFFEE_PHASE_WALK;
      coffeeState.frame = 0;
      coffeeState.ghostIdx = i;
      const busyTime = lastBusyEndFrame[i] ? (frame - lastBusyEndFrame[i]) : 999999;
      coffeeState.rushMode = busyTime < 300; // just finished long busy
      break;
    }
  }
}

// ==================== Feature 3: Paper Ball System ====================
const paperBallState = { active: false, frame: 0, thrower: -1, target: -1, x: 0, y: 0, vx: 0, vy: 0, volleyCount: 0, outcome: '', hitStars: 0, scoreFloat: null };
let paperCheckTimer = 0;

function launchPaperBall(fromIdx, toIdx) {
  const fromPos = ghostCurrentPos[fromIdx];
  const toPos = ghostCurrentPos[toIdx];
  if (!fromPos.initialized || !toPos.initialized) return;
  const dx = toPos.x - fromPos.x;
  const dy = toPos.y - fromPos.y;
  const dist = Math.hypot(dx, dy);
  const t = dist / 3; // time to reach
  paperBallState.x = fromPos.x;
  paperBallState.y = fromPos.y - 10;
  paperBallState.vx = dx / t;
  paperBallState.vy = (dy / t) - (ANIM.PAPER_GRAVITY * t / 2); // account for gravity arc
  paperBallState.frame = 0;
}

function updatePaperBall() {
  if (!paperBallState.active) {
    paperCheckTimer++;
    if (paperCheckTimer < ANIM.PAPER_CHECK_INTERVAL) return;
    paperCheckTimer = 0;
    const idleGhosts = [];
    const frame = officeFrame || gcFrame;
    for (let i = 0; i < 4; i++) {
      if (i >= GT.state.sessionList.length || GT.state.sessionList[i]?.exited) continue;
      if (termStates[i + 1] !== 'idle') continue;
      const idleTime = frame - (idleStartTimes[i + 1] || frame);
      if (idleTime >= ANIM.PAPER_IDLE_THRESHOLD) idleGhosts.push(i);
    }
    if (idleGhosts.length >= 2 && Math.random() < ANIM.PAPER_TRIGGER_CHANCE) {
      const thrower = idleGhosts[Math.floor(Math.random() * idleGhosts.length)];
      let target = thrower;
      while (target === thrower) target = idleGhosts[Math.floor(Math.random() * idleGhosts.length)];
      paperBallState.active = true;
      paperBallState.thrower = thrower;
      paperBallState.target = target;
      paperBallState.volleyCount = 0;
      paperBallState.hitStars = 0;
      paperBallState.scoreFloat = null;
      // Decide outcome
      const r = Math.random();
      if (r < ANIM.PAPER_CATCH_CHANCE) paperBallState.outcome = 'catch';
      else if (r < ANIM.PAPER_CATCH_CHANCE + ANIM.PAPER_HIT_CHANCE) paperBallState.outcome = 'hit';
      else paperBallState.outcome = 'trash';
      launchPaperBall(thrower, target);
    }
    return;
  }
  // Update flying ball
  paperBallState.frame++;
  paperBallState.x += paperBallState.vx;
  paperBallState.y += paperBallState.vy;
  paperBallState.vy += ANIM.PAPER_GRAVITY;
  // Check arrival near target
  const tp = ghostCurrentPos[paperBallState.target];
  if (tp && tp.initialized) {
    const dist = Math.hypot(paperBallState.x - tp.x, paperBallState.y - (tp.y - 10));
    if (dist < 20) {
      if (paperBallState.outcome === 'catch' && paperBallState.volleyCount < ANIM.PAPER_MAX_VOLLEYS) {
        paperBallState.volleyCount++;
        const oldTarget = paperBallState.target;
        paperBallState.target = paperBallState.thrower;
        paperBallState.thrower = oldTarget;
        launchPaperBall(paperBallState.thrower, paperBallState.target);
      } else if (paperBallState.outcome === 'hit') {
        paperBallState.hitStars = 60;
        paperBallState.frame = 0;
        // Keep active for star display then end
      } else {
        paperBallState.scoreFloat = { x: paperBallState.x, y: paperBallState.y, frame: 0 };
        paperBallState.active = false;
      }
      if (paperBallState.outcome !== 'catch' || paperBallState.volleyCount >= ANIM.PAPER_MAX_VOLLEYS) {
        if (paperBallState.outcome === 'catch') { paperBallState.active = false; }
      }
    }
  }
  // Timeout safety
  if (paperBallState.frame > 300) paperBallState.active = false;
  // Hit stars countdown
  if (paperBallState.hitStars > 0) {
    paperBallState.hitStars--;
    if (paperBallState.hitStars <= 0) paperBallState.active = false;
  }
}

// ==================== Feature 4: Office Cat ====================
const officeCat = {
  x: 0, y: 0, targetX: 0, targetY: 0, initialized: false,
  behavior: 'sleep', behaviorTimer: 0, behaviorDuration: 300,
  tailPhase: 0, spinAngle: 0, nearGhost: -1, facingRight: true,
  keyboardJumps: 0, // for achievement tracking
};

function initOfficeCat() {
  if (officeCat.initialized) return;
  officeCat.x = officeW * 0.15;
  officeCat.y = officeH * 0.65;
  officeCat.targetX = officeCat.x;
  officeCat.targetY = officeCat.y;
  officeCat.initialized = true;
}

function updateOfficeCat() {
  if (!officeCat.initialized) initOfficeCat();
  officeCat.behaviorTimer++;
  officeCat.tailPhase += 0.08;
  if (officeCat.behaviorTimer >= officeCat.behaviorDuration) {
    // Pick new behavior
    const behaviors = ['sleep', 'walk', 'chase_tail', 'keyboard'];
    officeCat.behavior = behaviors[Math.floor(Math.random() * behaviors.length)];
    officeCat.behaviorTimer = 0;
    officeCat.behaviorDuration = ANIM.CAT_BEHAVIOR_MIN + Math.floor(Math.random() * (ANIM.CAT_BEHAVIOR_MAX - ANIM.CAT_BEHAVIOR_MIN));
    if (officeCat.behavior === 'walk') {
      officeCat.targetX = 20 + Math.random() * (officeW - 40);
      officeCat.targetY = officeH * 0.62 + Math.random() * (officeH * 0.25);
    } else if (officeCat.behavior === 'keyboard') {
      // Find a busy ghost
      let busyGhost = -1;
      for (let i = 0; i < 4; i++) {
        if (i < GT.state.sessionList.length && !GT.state.sessionList[i]?.exited && termStates[i + 1] === 'busy') { busyGhost = i; break; }
      }
      if (busyGhost >= 0) {
        officeCat.nearGhost = busyGhost;
        officeCat.behaviorDuration = ANIM.CAT_KEYBOARD_DURATION;
      } else {
        officeCat.behavior = 'walk';
        officeCat.targetX = 20 + Math.random() * (officeW - 40);
        officeCat.targetY = officeH * 0.62 + Math.random() * (officeH * 0.25);
      }
    } else if (officeCat.behavior === 'chase_tail') {
      officeCat.spinAngle = 0;
      officeCat.behaviorDuration = 120; // 2s
    } else if (officeCat.behavior === 'sleep') {
      // Find a desk to sleep under
      const deskIdx = Math.floor(Math.random() * 4);
      const deskX = [officeW * 0.04, officeW * 0.78, officeW * 0.04, officeW * 0.78][deskIdx];
      const deskY = [officeH * 0.14, officeH * 0.14, officeH * 0.58, officeH * 0.58][deskIdx];
      officeCat.targetX = deskX + officeW * 0.09;
      officeCat.targetY = deskY + 20;
    }
  }
  // Movement
  if (officeCat.behavior === 'walk' || officeCat.behavior === 'sleep') {
    const dx = officeCat.targetX - officeCat.x;
    const dy = officeCat.targetY - officeCat.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 2) {
      officeCat.x += (dx / dist) * ANIM.CAT_SPEED;
      officeCat.y += (dy / dist) * ANIM.CAT_SPEED;
      officeCat.facingRight = dx > 0;
    }
  } else if (officeCat.behavior === 'keyboard' && officeCat.nearGhost >= 0) {
    const gi = officeCat.nearGhost;
    const deskX = [officeW * 0.04, officeW * 0.78, officeW * 0.04, officeW * 0.78][gi];
    const deskY = [officeH * 0.14, officeH * 0.14, officeH * 0.58, officeH * 0.58][gi];
    const kbX = deskX + officeW * 0.09;
    const kbY = deskY - 2;
    const dx = kbX - officeCat.x;
    const dy = kbY - officeCat.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 3) {
      officeCat.x += (dx / dist) * ANIM.CAT_SPEED;
      officeCat.y += (dy / dist) * ANIM.CAT_SPEED;
    }
    // Count keyboard jumps for achievement
    if (officeCat.behaviorTimer === 1) {
      officeCat.keyboardJumps++;
      if (typeof checkAchievement === 'function') checkAchievement('cat_keyboard');
    }
    // Ghost picks cat up in second half
    if (officeCat.behaviorTimer > officeCat.behaviorDuration * 0.6) {
      officeCat.y += 0.3; // slowly lowered
    }
  } else if (officeCat.behavior === 'chase_tail') {
    officeCat.spinAngle += 0.12;
  }
}

function drawOfficeCat() {
  const c = officeCtx;
  const cx = officeCat.x, cy = officeCat.y;
  const w = ANIM.CAT_W, h = ANIM.CAT_H;
  c.save();
  c.translate(cx, cy);
  if (officeCat.behavior === 'chase_tail') c.rotate(officeCat.spinAngle);
  if (!officeCat.facingRight) c.scale(-1, 1);
  // Body
  c.fillStyle = '#f59e0b';
  c.fillRect(-w / 2, -h / 2, w, h);
  // Ears
  c.beginPath(); c.moveTo(-w / 2, -h / 2); c.lineTo(-w / 2 + 1, -h / 2 - 3); c.lineTo(-w / 2 + 3, -h / 2); c.fill();
  c.beginPath(); c.moveTo(w / 2, -h / 2); c.lineTo(w / 2 - 1, -h / 2 - 3); c.lineTo(w / 2 - 3, -h / 2); c.fill();
  // Eyes
  c.fillStyle = '#1e293b';
  if (officeCat.behavior === 'sleep') {
    c.strokeStyle = '#1e293b'; c.lineWidth = 0.5;
    c.beginPath(); c.arc(-1, -1, 1, 0, Math.PI); c.stroke();
    c.beginPath(); c.arc(2, -1, 1, 0, Math.PI); c.stroke();
  } else {
    c.beginPath(); c.arc(-1, -1, 0.8, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(2, -1, 0.8, 0, Math.PI * 2); c.fill();
  }
  // Tail
  const tailWave = Math.sin(officeCat.tailPhase) * 3;
  c.strokeStyle = '#f59e0b'; c.lineWidth = 1.5; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-w / 2 - 1, 0); c.quadraticCurveTo(-w / 2 - 4, -2 + tailWave, -w / 2 - 5, 1 + tailWave); c.stroke();
  c.restore();
  // Sleep zzZ
  if (officeCat.behavior === 'sleep') {
    c.fillStyle = '#94a3b8'; c.globalAlpha = 0.5;
    c.font = '4px sans-serif'; c.textAlign = 'left';
    const zo = Math.sin((officeFrame || gcFrame) * 0.08) * 2;
    c.fillText('z', cx + 5, cy - 5 + zo);
    c.font = '5px sans-serif';
    c.fillText('Z', cx + 7, cy - 8 + zo);
    c.globalAlpha = 1;
  }
}

// ==================== Chibi Office View ====================
// Mini terminal lines — will be fed from real output buffer
const termLines = {
  1: ['$ claude --dangerously-skip', '> Waiting for input...'],
  2: ['$ npm start', '> Server running on :3777'],
};
const MAX_MINI_LINES = 6;

function toggleView() {
  try { _toggleViewInner(); } catch(e) { GT.ui.showToast('[office error] ' + e.message); console.error(e); }
}
function _toggleViewInner() {
  officeActive = !officeActive;
  GT.state.officeActive = officeActive;
  const termEl = document.getElementById('terminal-container');
  const officeEl = document.getElementById('pixel-view');
  const btn = document.getElementById('viewToggleBtn');
  if (!termEl || !officeEl) return;

  if (officeActive) {
    termEl.style.display = 'none';
    officeEl.style.display = 'block';
    if (btn) btn.classList.add('active');
    initOffice();
    startOfficeLoop();
  } else {
    termEl.style.display = '';
    officeEl.style.display = 'none';
    if (btn) btn.classList.remove('active');
    if (officeAnimId) cancelAnimationFrame(officeAnimId);
    // Scroll to bottom — multiple delays to catch history that arrives late
    setTimeout(() => GT.terminal.term.scrollToBottom(), 50);
    setTimeout(() => GT.terminal.term.scrollToBottom(), 300);
    setTimeout(() => GT.terminal.term.scrollToBottom(), 800);
  }
}

function initOffice() {
  officeCanvas = document.getElementById('office-canvas');
  officeCtx = officeCanvas.getContext('2d');
  officeDpr = window.devicePixelRatio || 1;
  const rect = officeCanvas.parentElement.getBoundingClientRect();
  officeW = rect.width;
  officeH = rect.height;
  officeCanvas.width = officeW * officeDpr;
  officeCanvas.height = officeH * officeDpr;
  officeCanvas.style.width = officeW + 'px';
  officeCanvas.style.height = officeH + 'px';
  officeCtx.setTransform(officeDpr, 0, 0, officeDpr, 0, 0);

  // Pre-render floor grid to offscreen canvas
  floorGridCanvas = document.createElement('canvas');
  floorGridCanvas.width = officeW * officeDpr;
  floorGridCanvas.height = officeH * 0.4 * officeDpr;
  const fgCtx = floorGridCanvas.getContext('2d');
  fgCtx.setTransform(officeDpr, 0, 0, officeDpr, 0, 0);
  fgCtx.strokeStyle = 'rgba(139,92,246,0.05)';
  fgCtx.lineWidth = 0.5;
  const floorH = officeH * 0.4;
  for (let i = 0; i < officeW; i += 30) { fgCtx.beginPath(); fgCtx.moveTo(i, 0); fgCtx.lineTo(i, floorH); fgCtx.stroke(); }
  for (let i = 0; i < floorH; i += 20) { fgCtx.beginPath(); fgCtx.moveTo(0, i); fgCtx.lineTo(officeW, i); fgCtx.stroke(); }
}

// ---- Drawing Helpers ----
function oRoundRect(x, y, w, h, r) {
  officeCtx.beginPath();
  officeCtx.moveTo(x + r, y);
  officeCtx.lineTo(x + w - r, y);
  officeCtx.quadraticCurveTo(x + w, y, x + w, y + r);
  officeCtx.lineTo(x + w, y + h - r);
  officeCtx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  officeCtx.lineTo(x + r, y + h);
  officeCtx.quadraticCurveTo(x, y + h, x, y + h - r);
  officeCtx.lineTo(x, y + r);
  officeCtx.quadraticCurveTo(x, y, x + r, y);
  officeCtx.closePath();
}
function oFillRR(x, y, w, h, r, c) { officeCtx.fillStyle = c; oRoundRect(x, y, w, h, r); officeCtx.fill(); }
function oCircle(cx, cy, r, c) { officeCtx.fillStyle = c; officeCtx.beginPath(); officeCtx.arc(cx, cy, r, 0, Math.PI * 2); officeCtx.fill(); }

// ---- Office Background ----
function drawOfficeBg() {
  const c = officeCtx;
  const dayColors = getDayColors();
  const phase = getDayPhase();

  // Room walls — tinted by time of day
  c.fillStyle = dayColors.wall; c.fillRect(0, 0, officeW, officeH);

  // === Windows on back wall (Feature 5) ===
  const windowW = officeW * 0.12, windowH = officeH * 0.18;
  const window1X = officeW * 0.28, window2X = officeW * 0.60;
  const windowY = officeH * 0.02;

  // Window frames
  [window1X, window2X].forEach(wx => {
    // Window opening (sky visible)
    c.fillStyle = dayColors.sky;
    c.fillRect(wx, windowY, windowW, windowH);
    // Window frame border
    c.strokeStyle = '#4b5563'; c.lineWidth = 2;
    c.strokeRect(wx, windowY, windowW, windowH);
    // Window cross
    c.beginPath(); c.moveTo(wx + windowW / 2, windowY); c.lineTo(wx + windowW / 2, windowY + windowH); c.stroke();
    c.beginPath(); c.moveTo(wx, windowY + windowH / 2); c.lineTo(wx + windowW, windowY + windowH / 2); c.stroke();

    // Light beam from window
    c.fillStyle = dayColors.windowLight;
    c.beginPath();
    c.moveTo(wx, windowY + windowH);
    c.lineTo(wx + windowW, windowY + windowH);
    c.lineTo(wx + windowW + 15, officeH * 0.55);
    c.lineTo(wx - 15, officeH * 0.55);
    c.closePath();
    c.fill();

    // Night: stars visible through window
    if (dayColors.starAlpha > 0) {
      c.fillStyle = '#fff';
      c.globalAlpha = dayColors.starAlpha;
      for (let s = 0; s < 5; s++) {
        const sx = wx + 4 + (s * 7) % (windowW - 8);
        const sy = windowY + 3 + (s * 11) % (windowH - 6);
        const twinkle = 0.4 + Math.sin(officeFrame * 0.08 + s * 2) * 0.4;
        c.globalAlpha = twinkle * dayColors.starAlpha;
        c.beginPath(); c.arc(sx, sy, 1, 0, Math.PI * 2); c.fill();
      }
      // Moon in first window
      c.globalAlpha = 0.9;
      c.fillStyle = '#fef3c7';
      c.beginPath(); c.arc(window1X + windowW * 0.7, windowY + windowH * 0.3, 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = dayColors.sky;
      c.beginPath(); c.arc(window1X + windowW * 0.7 + 3, windowY + windowH * 0.3 - 1, 5, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1;
    }

    // Sunlight beams (clear weather, daytime) — Feature 6
    if (currentWeather === 'clear' && (phase === 'day' || phase === 'morning')) {
      c.strokeStyle = 'rgba(255,255,200,0.08)'; c.lineWidth = 3;
      for (let b = 0; b < 3; b++) {
        c.beginPath();
        c.moveTo(wx + windowW * 0.3 * b + 5, windowY + windowH);
        c.lineTo(wx + windowW * 0.3 * b + 15, officeH * 0.50);
        c.stroke();
      }
    }

    // Rain on windows — Feature 6
    if (currentWeather === 'rain') {
      c.fillStyle = 'rgba(96,165,250,0.5)';
      weatherParticles.forEach(p => {
        if (p.type === 'rain' && p.x > wx && p.x < wx + windowW) {
          c.fillRect(p.x, windowY + (p.y % windowH), 1, p.size);
        }
      });
    }

    // Snow through windows — Feature 6
    if (currentWeather === 'snow') {
      c.fillStyle = 'rgba(255,255,255,0.7)';
      weatherParticles.forEach(p => {
        if (p.type === 'snow' && p.x > wx && p.x < wx + windowW) {
          c.beginPath(); c.arc(p.x, windowY + (p.y % windowH), p.size * 0.5, 0, Math.PI * 2); c.fill();
        }
      });
    }

    // Feature 7: Window scene dynamic extras (birds, clouds, plane, UFO)
    drawWindowSceneExtras(wx, windowY, windowW, windowH);
  });

  // Shooting stars (night only) — Feature 7 enhanced: multiple
  shootingStars.forEach(ss => {
    c.strokeStyle = '#fff';
    c.lineWidth = 1.5;
    c.globalAlpha = ss.life / 30;
    c.beginPath();
    c.moveTo(ss.x, ss.y);
    c.lineTo(ss.x - ss.vx * 3, ss.y - ss.vy * 3);
    c.stroke();
    c.globalAlpha = 1;
  });

  // Floor — tinted by time
  c.fillStyle = dayColors.floor; c.fillRect(0, officeH * 0.6, officeW, officeH * 0.4);
  c.strokeStyle = '#2d2d50'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(0, officeH * 0.6); c.lineTo(officeW, officeH * 0.6); c.stroke();
  // Floor grid (pre-rendered offscreen canvas)
  if (floorGridCanvas) {
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(floorGridCanvas, 0, officeH * 0.6 * officeDpr);
    c.restore();
  }

  // Bunting flags across the top (wall decoration) — seasonal colors (Feature 10)
  const seasonalFlags = getSeasonalFlagColors();
  const flagColors = seasonalFlags || ['#ef4444', '#f59e0b', '#8b5cf6', '#06b6d4', '#10b981', '#ec4899', '#f97316'];
  const flagY = officeH * 0.02;
  const flagCount = 12;
  c.strokeStyle = '#94a3b8'; c.lineWidth = 1;
  // String
  c.beginPath();
  c.moveTo(0, flagY + 2);
  for (let f = 0; f <= flagCount; f++) {
    const fx = (f / flagCount) * officeW;
    const sag = Math.sin(f / flagCount * Math.PI) * 8;
    c.lineTo(fx, flagY + sag + 2);
  }
  c.stroke();
  // Flags
  for (let f = 0; f < flagCount; f++) {
    const fx = ((f + 0.5) / flagCount) * officeW;
    const sag = Math.sin((f + 0.5) / flagCount * Math.PI) * 8;
    const fy = flagY + sag + 2;
    const swing = Math.sin(officeFrame * 0.03 + f) * 1.5;
    c.fillStyle = flagColors[f % flagColors.length];
    c.beginPath();
    c.moveTo(fx - 6, fy);
    c.lineTo(fx + 6, fy);
    c.lineTo(fx + swing, fy + 12);
    c.closePath();
    c.fill();
  }

  // Spider webs — both top corners
  c.strokeStyle = 'rgba(148,163,184,0.15)';
  c.lineWidth = 0.5;
  // Top-left
  for (let r = 0; r < 4; r++) {
    c.beginPath(); c.arc(0, 0, 12 + r * 10, 0, Math.PI * 0.5); c.stroke();
  }
  for (let a = 0; a < 4; a++) {
    const angle = (a / 3) * Math.PI * 0.5;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(angle) * 48, Math.sin(angle) * 48); c.stroke();
  }
  // Top-right
  for (let r = 0; r < 3; r++) {
    c.beginPath(); c.arc(officeW, 0, 10 + r * 10, Math.PI * 0.5, Math.PI); c.stroke();
  }
  for (let a = 0; a < 3; a++) {
    const angle = Math.PI * 0.5 + (a / 2) * Math.PI * 0.5;
    c.beginPath(); c.moveTo(officeW, 0); c.lineTo(officeW + Math.cos(angle) * 35, Math.sin(angle) * 35); c.stroke();
  }
  // Tiny spider hanging from top-right web
  const spiderY = 32 + Math.sin(officeFrame * 0.05) * 3;
  c.strokeStyle = 'rgba(148,163,184,0.2)'; c.lineWidth = 0.5;
  c.beginPath(); c.moveTo(officeW - 15, 0); c.lineTo(officeW - 15, spiderY); c.stroke();
  oCircle(officeW - 15, spiderY, 2.5, '#334155');
  oCircle(officeW - 15, spiderY - 2, 1.8, '#334155');
  // Spider legs
  c.strokeStyle = '#334155'; c.lineWidth = 0.6;
  for (let leg = 0; leg < 4; leg++) {
    const lx = (leg < 2 ? -1 : 1) * (3 + (leg % 2) * 2);
    const ly = (leg % 2 === 0 ? -1 : 1) * 2;
    c.beginPath(); c.moveTo(officeW - 15, spiderY); c.lineTo(officeW - 15 + lx, spiderY + ly + 3); c.stroke();
  }

  // Bat cutouts on the wall (flat, decorative)
  const batWallPos = [
    { x: officeW * 0.38, y: officeH * 0.04 },
    { x: officeW * 0.55, y: officeH * 0.06 },
    { x: officeW * 0.7, y: officeH * 0.03 },
  ];
  batWallPos.forEach((bp, bi) => {
    const bs = 0.8;
    c.fillStyle = '#1e1b4b';
    c.beginPath();
    c.ellipse(bp.x, bp.y, 3 * bs, 2 * bs, 0, 0, Math.PI * 2); c.fill();
    c.beginPath();
    c.moveTo(bp.x - 2 * bs, bp.y);
    c.quadraticCurveTo(bp.x - 8 * bs, bp.y - 5 * bs, bp.x - 11 * bs, bp.y - 1 * bs);
    c.quadraticCurveTo(bp.x - 7 * bs, bp.y + 1 * bs, bp.x - 2 * bs, bp.y);
    c.fill();
    c.beginPath();
    c.moveTo(bp.x + 2 * bs, bp.y);
    c.quadraticCurveTo(bp.x + 8 * bs, bp.y - 5 * bs, bp.x + 11 * bs, bp.y - 1 * bs);
    c.quadraticCurveTo(bp.x + 7 * bs, bp.y + 1 * bs, bp.x + 2 * bs, bp.y);
    c.fill();
  });

  // Candles on the floor (flickering) — between desks and around the room
  const candlePos = [
    { x: officeW * 0.48, y: officeH * 0.55 },
    { x: officeW * 0.52, y: officeH * 0.56 },
    // Between top-left and top-right desks
    { x: officeW * 0.35, y: officeH * 0.10 },
    { x: officeW * 0.65, y: officeH * 0.11 },
    // Between top and bottom desks (left side)
    { x: officeW * 0.08, y: officeH * 0.38 },
    // Between top and bottom desks (right side)
    { x: officeW * 0.92, y: officeH * 0.37 },
    // Between bottom-left and bottom-right desks
    { x: officeW * 0.38, y: officeH * 0.62 },
    { x: officeW * 0.62, y: officeH * 0.63 },
  ];
  candlePos.forEach((cp, ci) => {
    // Candle body
    c.fillStyle = '#fef3c7';
    c.fillRect(cp.x - 2, cp.y - 8, 4, 10);
    // Flame
    const flicker = Math.sin(officeFrame * 0.2 + ci * 3) * 1.5;
    c.globalAlpha = 0.15;
    oCircle(cp.x, cp.y - 12 + flicker, 8, '#f59e0b');
    c.globalAlpha = 1;
    c.fillStyle = '#fbbf24';
    c.beginPath();
    c.moveTo(cp.x - 2, cp.y - 8);
    c.quadraticCurveTo(cp.x + flicker * 0.5, cp.y - 16 + flicker, cp.x + 2, cp.y - 8);
    c.fill();
    c.fillStyle = '#fef3c7';
    c.beginPath();
    c.moveTo(cp.x - 1, cp.y - 8);
    c.quadraticCurveTo(cp.x + flicker * 0.3, cp.y - 13 + flicker, cp.x + 1, cp.y - 8);
    c.fill();
  });

  // Candy scattered on the floor
  const candyPositions = [
    { x: officeW * 0.25, y: officeH * 0.67 }, { x: officeW * 0.42, y: officeH * 0.72 },
    { x: officeW * 0.58, y: officeH * 0.68 }, { x: officeW * 0.72, y: officeH * 0.74 },
    { x: officeW * 0.33, y: officeH * 0.78 }, { x: officeW * 0.65, y: officeH * 0.76 },
  ];
  const candyColors = ['#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981'];
  candyPositions.forEach((cp, ci) => {
    const cc = candyColors[ci];
    const rot = ci * 0.5;
    c.save();
    c.translate(cp.x, cp.y);
    c.rotate(rot);
    c.fillStyle = cc;
    c.beginPath(); c.ellipse(0, 0, 5, 3, 0, 0, Math.PI * 2); c.fill();
    // Stripes
    c.globalAlpha = 0.3;
    c.fillStyle = '#fff';
    c.fillRect(-1, -3, 2, 6);
    c.globalAlpha = 1;
    // Wrapper tails
    c.fillStyle = cc;
    c.beginPath(); c.moveTo(-5, -1); c.lineTo(-9, -3); c.lineTo(-8, 1); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(5, -1); c.lineTo(9, 3); c.lineTo(8, -1); c.closePath(); c.fill();
    c.restore();
  });

  // Decorative big pumpkin in bottom-right corner
  const pX = officeW * 0.9, pY = officeH * 0.73;
  c.fillStyle = '#ea580c';
  c.beginPath(); c.ellipse(pX, pY, 14, 10, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#c2410c';
  c.beginPath(); c.ellipse(pX - 6, pY, 5, 10, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(pX + 6, pY, 5, 10, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#ea580c';
  c.beginPath(); c.ellipse(pX, pY, 6, 10, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#65a30d';
  c.fillRect(pX - 1.5, pY - 12, 3, 4);
  // Face
  c.fillStyle = '#fbbf24';
  c.beginPath(); c.moveTo(pX - 5, pY - 3); c.lineTo(pX - 2, pY - 3); c.lineTo(pX - 3.5, pY); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(pX + 2, pY - 3); c.lineTo(pX + 5, pY - 3); c.lineTo(pX + 3.5, pY); c.closePath(); c.fill();
  c.beginPath();
  c.moveTo(pX - 5, pY + 2); c.lineTo(pX - 3, pY + 4); c.lineTo(pX, pY + 2); c.lineTo(pX + 3, pY + 4); c.lineTo(pX + 5, pY + 2);
  c.fill();

  // === Office Upgrade Decorations (Feature 8) ===
  const numSessions = GT.state.sessionList.length;
  // 2+ sessions: potted plants on desks
  if (numSessions >= 2) {
    const plantPos = [
      { x: officeW * 0.20, y: officeH * 0.12 },
      { x: officeW * 0.95, y: officeH * 0.12 },
    ];
    plantPos.forEach(pp => {
      // Pot
      c.fillStyle = '#92400e';
      c.fillRect(pp.x - 4, pp.y, 8, 6);
      c.fillRect(pp.x - 5, pp.y, 10, 2);
      // Plant
      c.fillStyle = '#22c55e';
      c.beginPath(); c.arc(pp.x, pp.y - 3, 5, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#16a34a';
      c.beginPath(); c.arc(pp.x - 2, pp.y - 5, 3, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(pp.x + 3, pp.y - 4, 3, 0, Math.PI * 2); c.fill();
    });
  }
  // 3+ sessions: wall posters
  if (numSessions >= 3) {
    const posterPos = [
      { x: officeW * 0.45, y: officeH * 0.04 },
      { x: officeW * 0.50, y: officeH * 0.04 },
    ];
    // Poster 1
    c.fillStyle = '#7c3aed';
    c.fillRect(posterPos[0].x, posterPos[0].y, 12, 16);
    c.fillStyle = '#a78bfa';
    c.fillRect(posterPos[0].x + 2, posterPos[0].y + 2, 8, 4);
    c.fillRect(posterPos[0].x + 2, posterPos[0].y + 8, 8, 2);
    c.fillRect(posterPos[0].x + 2, posterPos[0].y + 12, 8, 2);
    // Poster 2
    c.fillStyle = '#0891b2';
    c.fillRect(posterPos[1].x + 16, posterPos[1].y, 12, 16);
    c.fillStyle = '#22d3ee';
    c.fillRect(posterPos[1].x + 18, posterPos[1].y + 3, 8, 10);
  }
  // 4 sessions: water cooler + carpet
  if (numSessions >= 4) {
    // Carpet (floor accent)
    c.fillStyle = 'rgba(139,92,246,0.08)';
    c.fillRect(officeW * 0.3, officeH * 0.62, officeW * 0.4, officeH * 0.15);
    c.strokeStyle = 'rgba(139,92,246,0.15)'; c.lineWidth = 1;
    c.strokeRect(officeW * 0.3, officeH * 0.62, officeW * 0.4, officeH * 0.15);
    // Water cooler (bottom center)
    const wcX = officeW * 0.50, wcY = officeH * 0.82;
    c.fillStyle = '#e2e8f0'; c.fillRect(wcX - 5, wcY, 10, 14);
    c.fillStyle = '#3b82f6'; c.beginPath(); c.arc(wcX, wcY - 3, 5, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#60a5fa'; c.beginPath(); c.arc(wcX, wcY - 3, 3, 0, Math.PI * 2); c.fill();
    // Legs
    c.fillStyle = '#94a3b8';
    c.fillRect(wcX - 4, wcY + 14, 2, 4);
    c.fillRect(wcX + 2, wcY + 14, 2, 4);
  }

  // === Lounge Area (bottom center) — always visible ===
  const loungeY = officeH * 0.78;
  const loungeCX = officeW * 0.5;

  // Coffee table (center)
  const tableW = 30, tableH = 6;
  c.fillStyle = '#92400e';
  c.fillRect(loungeCX - tableW / 2, loungeY, tableW, tableH);
  c.fillStyle = '#a3541a';
  c.fillRect(loungeCX - tableW / 2, loungeY, tableW, 2);
  // Table legs
  c.fillStyle = '#7a3b0e';
  c.fillRect(loungeCX - tableW / 2 + 2, loungeY + tableH, 2, 5);
  c.fillRect(loungeCX + tableW / 2 - 4, loungeY + tableH, 2, 5);

  // Coffee cup on table (hidden when ghost is carrying it — Feature 2)
  if (coffeeState.cupVisible !== false) {
    c.fillStyle = '#f5f5f4';
    c.fillRect(loungeCX - 3, loungeY - 5, 6, 5);
    c.fillStyle = '#92400e';
    c.fillRect(loungeCX - 2, loungeY - 4, 4, 3);
    // Steam from coffee (animated)
    c.globalAlpha = 0.3 + Math.sin(officeFrame * 0.08) * 0.2;
    c.strokeStyle = '#94a3b8'; c.lineWidth = 1;
    for (let s = 0; s < 2; s++) {
      const sx = loungeCX - 1 + s * 3;
      const sway = Math.sin(officeFrame * 0.05 + s) * 2;
      c.beginPath();
      c.moveTo(sx, loungeY - 6);
      c.quadraticCurveTo(sx + sway, loungeY - 10, sx - sway * 0.5, loungeY - 14);
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  // Cookie / donut on table
  c.fillStyle = '#f59e0b';
  c.beginPath(); c.arc(loungeCX + 10, loungeY - 2, 3, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#92400e';
  c.beginPath(); c.arc(loungeCX + 10, loungeY - 2, 1, 0, Math.PI * 2); c.fill();

  // Small sofa left (rounded with backrest, cushions, gradient)
  // Seat base with rounded corners
  c.beginPath(); c.moveTo(loungeCX - 50 + 3, loungeY - 2); c.arcTo(loungeCX - 50 + 16, loungeY - 2, loungeCX - 50 + 16, loungeY + 8, 3);
  c.arcTo(loungeCX - 50 + 16, loungeY + 8, loungeCX - 50, loungeY + 8, 3); c.arcTo(loungeCX - 50, loungeY + 8, loungeCX - 50, loungeY - 2, 3);
  c.arcTo(loungeCX - 50, loungeY - 2, loungeCX - 50 + 16, loungeY - 2, 3); c.closePath();
  const lsGrad = c.createLinearGradient(loungeCX - 50, loungeY - 2, loungeCX - 50, loungeY + 8);
  lsGrad.addColorStop(0, '#7c3aed'); lsGrad.addColorStop(1, '#5b21b6');
  c.fillStyle = lsGrad; c.fill();
  // Backrest (small rect on top with rounded corners)
  c.beginPath(); c.moveTo(loungeCX - 50 + 2, loungeY - 6); c.arcTo(loungeCX - 50 + 16, loungeY - 6, loungeCX - 50 + 16, loungeY - 2, 2);
  c.lineTo(loungeCX - 50 + 16, loungeY - 2); c.lineTo(loungeCX - 50, loungeY - 2);
  c.arcTo(loungeCX - 50, loungeY - 6, loungeCX - 50 + 16, loungeY - 6, 2); c.closePath();
  const lbGrad = c.createLinearGradient(loungeCX - 50, loungeY - 6, loungeCX - 50, loungeY - 2);
  lbGrad.addColorStop(0, '#8b5cf6'); lbGrad.addColorStop(1, '#7c3aed');
  c.fillStyle = lbGrad; c.fill();
  // Cushion divider lines
  c.strokeStyle = 'rgba(167,139,250,0.5)'; c.lineWidth = 0.5;
  c.beginPath(); c.moveTo(loungeCX - 42, loungeY - 1); c.lineTo(loungeCX - 42, loungeY + 5); c.stroke();
  c.beginPath(); c.moveTo(loungeCX - 47, loungeY + 1); c.lineTo(loungeCX - 37, loungeY + 1); c.stroke();
  c.beginPath(); c.moveTo(loungeCX - 47, loungeY + 4); c.lineTo(loungeCX - 37, loungeY + 4); c.stroke();

  // Small sofa right (rounded with backrest, cushions, gradient)
  c.beginPath(); c.moveTo(loungeCX + 34 + 3, loungeY - 2); c.arcTo(loungeCX + 50, loungeY - 2, loungeCX + 50, loungeY + 8, 3);
  c.arcTo(loungeCX + 50, loungeY + 8, loungeCX + 34, loungeY + 8, 3); c.arcTo(loungeCX + 34, loungeY + 8, loungeCX + 34, loungeY - 2, 3);
  c.arcTo(loungeCX + 34, loungeY - 2, loungeCX + 50, loungeY - 2, 3); c.closePath();
  const rsGrad = c.createLinearGradient(loungeCX + 34, loungeY - 2, loungeCX + 34, loungeY + 8);
  rsGrad.addColorStop(0, '#0891b2'); rsGrad.addColorStop(1, '#0e7490');
  c.fillStyle = rsGrad; c.fill();
  // Backrest
  c.beginPath(); c.moveTo(loungeCX + 34 + 2, loungeY - 6); c.arcTo(loungeCX + 50, loungeY - 6, loungeCX + 50, loungeY - 2, 2);
  c.lineTo(loungeCX + 50, loungeY - 2); c.lineTo(loungeCX + 34, loungeY - 2);
  c.arcTo(loungeCX + 34, loungeY - 6, loungeCX + 50, loungeY - 6, 2); c.closePath();
  const rbGrad = c.createLinearGradient(loungeCX + 34, loungeY - 6, loungeCX + 34, loungeY - 2);
  rbGrad.addColorStop(0, '#06b6d4'); rbGrad.addColorStop(1, '#0891b2');
  c.fillStyle = rbGrad; c.fill();
  // Cushion divider lines
  c.strokeStyle = 'rgba(103,232,249,0.4)'; c.lineWidth = 0.5;
  c.beginPath(); c.moveTo(loungeCX + 42, loungeY - 1); c.lineTo(loungeCX + 42, loungeY + 5); c.stroke();
  c.beginPath(); c.moveTo(loungeCX + 37, loungeY + 1); c.lineTo(loungeCX + 47, loungeY + 1); c.stroke();
  c.beginPath(); c.moveTo(loungeCX + 37, loungeY + 4); c.lineTo(loungeCX + 47, loungeY + 4); c.stroke();

  // Rug under lounge area
  c.fillStyle = 'rgba(139,92,246,0.06)';
  c.beginPath();
  c.ellipse(loungeCX, loungeY + 5, 45, 12, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(139,92,246,0.12)'; c.lineWidth = 0.5;
  c.beginPath();
  c.ellipse(loungeCX, loungeY + 5, 45, 12, 0, 0, Math.PI * 2);
  c.stroke();

  // Bookshelf on right wall
  const bsX = officeW * 0.92, bsY = officeH * 0.72;
  c.fillStyle = '#5c3d1e';
  c.fillRect(bsX, bsY, 20, 30);
  // Shelves
  c.fillStyle = '#7a5230';
  for (let sh = 0; sh < 3; sh++) {
    c.fillRect(bsX, bsY + sh * 10, 20, 2);
  }
  // Books (colorful)
  const bookColors = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899'];
  for (let sh = 0; sh < 3; sh++) {
    for (let b = 0; b < 4; b++) {
      c.fillStyle = bookColors[(sh * 4 + b) % bookColors.length];
      c.fillRect(bsX + 2 + b * 4, bsY + sh * 10 + 3, 3, 6);
    }
  }

  // Clock on wall
  const clockX = officeW * 0.08, clockY = officeH * 0.68;
  c.fillStyle = '#f5f5f4';
  c.beginPath(); c.arc(clockX, clockY, 8, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#334155'; c.lineWidth = 1.5;
  c.beginPath(); c.arc(clockX, clockY, 8, 0, Math.PI * 2); c.stroke();
  // Clock hands (real time!)
  const now = new Date();
  const hourAngle = ((now.getHours() % 12) + now.getMinutes() / 60) * Math.PI / 6 - Math.PI / 2;
  const minAngle = now.getMinutes() * Math.PI / 30 - Math.PI / 2;
  c.strokeStyle = '#1e293b'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(clockX, clockY); c.lineTo(clockX + Math.cos(hourAngle) * 4, clockY + Math.sin(hourAngle) * 4); c.stroke();
  c.lineWidth = 1;
  c.beginPath(); c.moveTo(clockX, clockY); c.lineTo(clockX + Math.cos(minAngle) * 6, clockY + Math.sin(minAngle) * 6); c.stroke();
  c.fillStyle = '#ef4444'; c.beginPath(); c.arc(clockX, clockY, 1, 0, Math.PI * 2); c.fill();
}

// ---- Desk & Monitor ----
function drawDesk(x, y, w, h, state) {
  officeCtx.fillStyle = 'rgba(0,0,0,0.15)'; officeCtx.fillRect(x + 3, y + h - 2, w, 6);
  oFillRR(x, y, w, h, 3, '#5c3d1e'); oFillRR(x, y, w, h * 0.3, 3, '#7a5230');
  officeCtx.fillStyle = '#5c3d1e'; officeCtx.fillRect(x + 4, y + h, 4, 12); officeCtx.fillRect(x + w - 8, y + h, 4, 12);
  // Keyboard on desk — Feature 2
  const kbW = w * 0.5, kbH = 5;
  const kbX = x + w * 0.3, kbY = y - kbH - 1;
  drawKeyboard(officeCtx, kbX, kbY, kbW, kbH, officeFrame, state === 'busy');
}

function drawMonitor(x, y, w, h, state, lines) {
  const c = officeCtx;
  oFillRR(x, y, w, h, 4, '#334155'); oFillRR(x + 3, y + 3, w - 6, h - 8, 2, '#0a0a15');
  c.fillStyle = '#475569'; c.fillRect(x + w/2 - 4, y + h, 8, 6); c.fillRect(x + w/2 - 8, y + h + 5, 16, 3);

  const sx = x + 5, sy = y + 5, sw = w - 10, sh = h - 12;
  c.save(); c.beginPath(); c.rect(sx, sy, sw, sh); c.clip();
  if (state === 'error') { c.fillStyle = 'rgba(239,68,68,0.1)'; c.fillRect(sx, sy, sw, sh); }
  const lineH = 7, maxL = Math.floor(sh / lineH), vis = lines.slice(-maxL);
  c.font = '5px monospace'; c.textAlign = 'left';
  vis.forEach((l, i) => { c.fillStyle = state === 'error' ? '#ef4444' : '#10b981'; c.fillText(l.replace(/[^\x20-\x7E]/g, ''), sx + 2, sy + 6 + i * lineH); });
  if (state === 'waiting' && Math.sin(officeFrame * 0.15) > 0) { c.fillStyle = '#10b981'; c.fillRect(sx + 2, sy + 6 + vis.length * lineH - 4, 4, 6); }
  if (state === 'busy' && officeFrame % 4 === 0) {
    c.fillStyle = '#10b981'; const chars = '{}[]<>=;:./\\|@#$%&*+-_~^'; let rl = '';
    for (let j = 0; j < 12; j++) rl += chars[Math.floor(Math.random() * chars.length)];
    const sl = sy + 6 + vis.length * lineH; if (sl < sy + sh) c.fillText(rl, sx + 2, sl);
  }
  c.restore();
}

// ---- Ghost Character ----
function drawGhost(cx, cy, s, state, color, label, ghostIdx, deskCenter) {
  const c = officeCtx;
  const mood = getMoodState(ghostIdx);

  // Float animation
  const float = state === 'busy'
    ? Math.sin(officeFrame * 0.2 + ghostIdx) * 4
    : Math.sin(officeFrame * 0.05 + ghostIdx * 2) * 3;

  // Celebration jump offset — Feature 3
  let jumpOffset = 0;
  const celeb = celebrationState[ghostIdx + 1];
  if (celeb) {
    const progress = celeb.frame / celeb.duration;
    jumpOffset = -Math.sin(progress * Math.PI) * ANIM.CELEBRATE_JUMP_HEIGHT * s;
  }

  // Dancing body sway — Feature 9
  let danceSway = 0;
  if (mood === 'dancing' && state === 'idle') {
    danceSway = Math.sin(officeFrame * 0.15 + ghostIdx) * 5 * s;
  }

  // Sofa lean-back check — if idle and near sofa area center
  const sofaCX = officeW * 0.5, sofaCY = officeH * 0.36;
  const nearSofaArea = state === 'idle' && Math.abs(cx - sofaCX) < 70 && Math.abs(cy - sofaCY) < 40;
  // Yawn cycle: every 5 seconds (300 frames@60fps), lasts 1 second (60 frames)
  const yawnCycle = (officeFrame + ghostIdx * 97) % 300;
  const isYawning = nearSofaArea && yawnCycle < 60;
  const yawnOpen = isYawning ? Math.sin(yawnCycle / 60 * Math.PI) : 0;

  const gy = cy + float + jumpOffset;
  const drawCx = cx + danceSway;

  // Shadow
  c.globalAlpha = 0.2;
  c.fillStyle = '#000';
  c.beginPath();
  c.ellipse(cx, cy + 28 * s, 16 * s, 5 * s, 0, 0, Math.PI * 2);
  c.fill();
  c.globalAlpha = 1;

  // Glow when busy
  if (state === 'busy') {
    c.globalAlpha = 0.15 + Math.sin(officeFrame * 0.1) * 0.1;
    oCircle(drawCx, gy, 28 * s, color);
    c.globalAlpha = 1;
  }

  // Walk tilt — Feature 7
  const walkInfo = ghostCurrentPos[ghostIdx];
  const isTilting = walkInfo && walkInfo.initialized;
  c.save();
  if (nearSofaArea) {
    // Lean back on sofa
    c.translate(drawCx, gy);
    c.rotate(-0.12); // slight backward lean
    c.translate(-drawCx, -gy);
  } else if (isTilting) {
    const targetDx = (cx - walkInfo.x);
    if (Math.abs(targetDx) > 2) {
      const tiltAngle = Math.sign(targetDx) * ANIM.WALK_TILT_DEG * Math.PI / 180;
      c.translate(drawCx, gy);
      c.rotate(tiltAngle);
      c.translate(-drawCx, -gy);
    }
  }

  // Ghost body — rounded top, wavy bottom
  c.fillStyle = color;
  c.beginPath();
  c.arc(drawCx, gy - 4 * s, 18 * s, Math.PI, 0);
  c.lineTo(drawCx + 18 * s, gy + 16 * s);
  const waveAmp = 4 * s;
  const waveW = 12 * s;
  const wavePhase = officeFrame * 0.08 + ghostIdx;
  for (let i = 0; i < 3; i++) {
    const wx = drawCx + 18 * s - (i + 1) * waveW;
    const wy = gy + 16 * s + Math.sin(wavePhase + i * 1.5) * waveAmp;
    c.quadraticCurveTo(wx + waveW * 0.25, wy + waveAmp, wx - waveW * 0.25, wy);
  }
  c.lineTo(drawCx - 18 * s, gy - 4 * s);
  c.closePath();
  c.fill();

  // Inner highlight
  c.globalAlpha = 0.15;
  c.fillStyle = '#fff';
  c.beginPath();
  c.arc(drawCx - 4 * s, gy - 10 * s, 10 * s, 0, Math.PI * 2);
  c.fill();
  c.globalAlpha = 1;

  // Draw accessory — Feature 1 (wardrobe-aware)
  drawGhostAccessoryWardrobe(c, drawCx, gy - 20 * s, s, officeFrame, ghostIdx);

  // Eyes — with idle interaction look direction (Feature 4/10)
  let lookDir = 0; // -1 left, 0 center, 1 right
  if (activeIdleInteraction && activeIdleInteraction.ghosts.includes(ghostIdx) && activeIdleInteraction.type === 'look') {
    const otherGhost = activeIdleInteraction.ghosts.find(g => g !== ghostIdx);
    if (otherGhost !== undefined) {
      lookDir = otherGhost > ghostIdx ? 1 : -1;
    }
  }

  if (state === 'idle') {
    const idleCycle = Math.floor((officeFrame + ghostIdx * 120) / 240) % 2;
    // Exhausted eyes — half closed (Feature 9)
    if (mood === 'exhausted') {
      c.strokeStyle = '#1e293b'; c.lineWidth = 2 * s;
      c.beginPath(); c.arc(drawCx - 6 * s, gy - 3 * s, 3 * s, 0.3, Math.PI - 0.3); c.stroke();
      c.beginPath(); c.arc(drawCx + 6 * s, gy - 3 * s, 3 * s, 0.3, Math.PI - 0.3); c.stroke();
    } else if (idleCycle === 0 || (activeIdleInteraction && activeIdleInteraction.type === 'sleep' && activeIdleInteraction.ghosts.includes(ghostIdx))) {
      // Sleeping — closed eyes + Zzz
      c.strokeStyle = '#1e293b'; c.lineWidth = 2 * s;
      c.beginPath(); c.arc(drawCx - 6 * s, gy - 4 * s, 3 * s, 0, Math.PI); c.stroke();
      c.beginPath(); c.arc(drawCx + 6 * s, gy - 4 * s, 3 * s, 0, Math.PI); c.stroke();
      c.fillStyle = '#94a3b8'; c.textAlign = 'left';
      const zo = Math.sin(officeFrame * 0.08) * 3;
      c.globalAlpha = 0.5 + Math.sin(officeFrame * 0.1) * 0.3;
      c.font = `bold ${8 * s}px sans-serif`; c.fillText('z', drawCx + 18 * s, gy - 16 * s + zo);
      c.font = `bold ${11 * s}px sans-serif`; c.fillText('Z', drawCx + 24 * s, gy - 24 * s + zo);
      c.globalAlpha = 1;
    } else {
      // Happy eyes — ^_^ style + music notes
      c.strokeStyle = '#1e293b'; c.lineWidth = 2 * s;
      c.beginPath(); c.arc(drawCx - 6 * s, gy - 4 * s, 3.5 * s, Math.PI + 0.3, -0.3); c.stroke();
      c.beginPath(); c.arc(drawCx + 6 * s, gy - 4 * s, 3.5 * s, Math.PI + 0.3, -0.3); c.stroke();
      c.fillStyle = '#f59e0b'; c.textAlign = 'center';
      const notePhase = officeFrame * 0.06 + ghostIdx;
      for (let n = 0; n < 2; n++) {
        const nx = drawCx + (n === 0 ? -14 : 18) * s + Math.sin(notePhase + n * 2) * 4;
        const ny = gy - 22 * s - ((officeFrame * 0.3 + n * 15 + ghostIdx * 10) % 30);
        c.globalAlpha = 0.4 + Math.sin(notePhase + n) * 0.3;
        c.font = `${8 * s}px sans-serif`;
        c.fillText(n === 0 ? '\u266A' : '\u266B', nx, ny);
      }
      c.globalAlpha = 1;
    }
  } else {
    // Open eyes — big white circles with pupils
    const eyeR = state === 'waiting' ? 5 * s : 4.5 * s;
    oCircle(drawCx - 6 * s, gy - 5 * s, eyeR, '#fff');
    oCircle(drawCx + 6 * s, gy - 5 * s, eyeR, '#fff');
    // Pupils — look direction for interaction or busy scanning
    let pupilOff = state === 'busy' ? Math.sin(officeFrame * 0.1) * 1.5 * s : 0;
    if (lookDir !== 0) pupilOff = lookDir * 2 * s;
    oCircle(drawCx - 6 * s + pupilOff, gy - 4 * s, 2.2 * s, '#1e293b');
    oCircle(drawCx + 6 * s + pupilOff, gy - 4 * s, 2.2 * s, '#1e293b');
    // Eye shine
    oCircle(drawCx - 5 * s, gy - 6 * s, 1 * s, '#fff');
    oCircle(drawCx + 7 * s, gy - 6 * s, 1 * s, '#fff');
  }

  // Arms — super thin typing animation (matching ghost cell style)
  if ((state === 'busy' || state === 'error') && deskCenter) {
    const leftHand = Math.sin(officeFrame * ANIM.TYPING_HAND_SPEED + ghostIdx) * ANIM.TYPING_HAND_AMP;
    const rightHand = Math.sin(officeFrame * ANIM.TYPING_HAND_SPEED + ghostIdx + Math.PI) * ANIM.TYPING_HAND_AMP;
    const armW1 = state === 'busy' ? leftHand : 0;
    const armW2 = state === 'busy' ? rightHand : 0;
    const kbY = deskCenter.y + 8;
    c.strokeStyle = color; c.lineWidth = 1.5; c.lineCap = 'round';
    // Left arm — thin line from body side to keyboard
    c.beginPath();
    c.moveTo(drawCx - 10 * s, gy + 2 * s);
    c.quadraticCurveTo(drawCx - 16 * s, gy - 8 * s + armW1, deskCenter.x - 6, kbY + armW1);
    c.stroke();
    // Right arm
    c.beginPath();
    c.moveTo(drawCx + 10 * s, gy + 2 * s);
    c.quadraticCurveTo(drawCx + 16 * s, gy - 8 * s + armW2, deskCenter.x + 6, kbY + armW2);
    c.stroke();
    // Tiny hands
    oCircle(deskCenter.x - 6, kbY + armW1, 1.2, color);
    oCircle(deskCenter.x + 6, kbY + armW2, 1.2, color);
  }

  // Mouth
  if (state === 'busy') {
    c.strokeStyle = '#1e293b'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(drawCx - 3 * s, gy + 2 * s); c.lineTo(drawCx + 3 * s, gy + 2 * s); c.stroke();
  } else if (state === 'error') {
    c.strokeStyle = '#1e293b'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(drawCx - 4 * s, gy + 3 * s);
    c.quadraticCurveTo(drawCx - 2 * s, gy + 1 * s, drawCx, gy + 3 * s);
    c.quadraticCurveTo(drawCx + 2 * s, gy + 5 * s, drawCx + 4 * s, gy + 3 * s);
    c.stroke();
  } else if (state === 'waiting') {
    oCircle(drawCx, gy + 2 * s, 2.5 * s, '#1e293b');
    oCircle(drawCx, gy + 2 * s, 1.5 * s, color);
  } else if (isYawning) {
    // Yawn mouth — open wide then close
    const yawnR = 2.5 * s + yawnOpen * 3.5 * s;
    c.fillStyle = '#1e293b';
    c.beginPath(); c.ellipse(drawCx, gy + 1 * s, yawnR * 0.8, yawnR, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#374151';
    c.beginPath(); c.ellipse(drawCx, gy + 1 * s, yawnR * 0.4, yawnR * 0.5, 0, 0, Math.PI * 2); c.fill();
  } else {
    c.strokeStyle = '#1e293b'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(drawCx, gy + 1 * s, 3 * s, 0.1, Math.PI - 0.1); c.stroke();
  }

  // Blush
  c.globalAlpha = 0.3;
  oCircle(drawCx - 12 * s, gy, 3 * s, '#fca5a5');
  oCircle(drawCx + 12 * s, gy, 3 * s, '#fca5a5');
  c.globalAlpha = 1;

  // Scarf/cape/bowtie drawn after body (so it overlays properly) — Feature 1
  if (ghostIdx === 3) {
    const choice3 = ghostAccessoryChoice[3] || 0;
    const items3 = WARDROBE_ITEMS[3];
    if (items3 && items3[choice3]) {
      const itemId = items3[choice3].id;
      if (itemId === 'cape') drawCape(c, drawCx, gy - 8 * s, s, officeFrame, ghostIdx);
      else if (itemId === 'bowtie') drawBowTie(c, drawCx, gy - 8 * s, s, officeFrame, ghostIdx);
      else drawScarf(c, drawCx, gy - 8 * s, s, officeFrame, ghostIdx);
    } else {
      drawScarf(c, drawCx, gy - 8 * s, s, officeFrame, ghostIdx);
    }
  }

  // Mood effects — Feature 9
  drawMoodEffects(c, drawCx, gy, s, officeFrame, mood);

  // Feature 1: Ghost Emote overlay
  const emote = ghostEmote[ghostIdx];
  if (emote && emote.type) {
    const ef = emote.frame;
    if (emote.type === 'error_cringe') {
      // Cringe: y offset down, hands on head
      const crouchY = Math.min(ef * 0.5, 6) * s;
      c.strokeStyle = color; c.lineWidth = 2 * s; c.lineCap = 'round';
      c.beginPath(); c.moveTo(drawCx - 10 * s, gy - 8 * s + crouchY); c.quadraticCurveTo(drawCx - 5 * s, gy - 20 * s, drawCx - 2 * s, gy - 16 * s); c.stroke();
      c.beginPath(); c.moveTo(drawCx + 10 * s, gy - 8 * s + crouchY); c.quadraticCurveTo(drawCx + 5 * s, gy - 20 * s, drawCx + 2 * s, gy - 16 * s); c.stroke();
    } else if (emote.type === 'success_cheer') {
      // Cheer: hands up
      const jumpH = Math.sin(ef * 0.15) * 4 * s;
      c.strokeStyle = color; c.lineWidth = 2 * s; c.lineCap = 'round';
      c.beginPath(); c.moveTo(drawCx - 10 * s, gy - 5 * s - jumpH); c.lineTo(drawCx - 14 * s, gy - 24 * s - jumpH); c.stroke();
      c.beginPath(); c.moveTo(drawCx + 10 * s, gy - 5 * s - jumpH); c.lineTo(drawCx + 14 * s, gy - 24 * s - jumpH); c.stroke();
      // Hands
      oCircle(drawCx - 14 * s, gy - 25 * s - jumpH, 2 * s, color);
      oCircle(drawCx + 14 * s, gy - 25 * s - jumpH, 2 * s, color);
    } else if (emote.type === 'thinking') {
      // Gear above head
      const gearAngle = ef * ANIM.EMOTE_THINKING_GEAR_SPEED;
      const gearX = drawCx, gearY = gy - 30 * s;
      const gearR = 5 * s;
      c.save(); c.translate(gearX, gearY); c.rotate(gearAngle);
      c.strokeStyle = '#94a3b8'; c.lineWidth = 1.5 * s;
      c.beginPath(); c.arc(0, 0, gearR, 0, Math.PI * 2); c.stroke();
      for (let t = 0; t < 6; t++) {
        const ta = t * Math.PI / 3;
        c.beginPath(); c.moveTo(Math.cos(ta) * gearR, Math.sin(ta) * gearR);
        c.lineTo(Math.cos(ta) * (gearR + 2 * s), Math.sin(ta) * (gearR + 2 * s)); c.stroke();
      }
      c.restore();
    } else if (emote.type === 'watch_wait') {
      // Look at wrist + sigh bubble
      c.strokeStyle = color; c.lineWidth = 1.5 * s;
      c.beginPath(); c.moveTo(drawCx + 10 * s, gy + 2 * s); c.quadraticCurveTo(drawCx + 18 * s, gy - 6 * s, drawCx + 15 * s, gy - 12 * s); c.stroke();
      c.fillStyle = '#f5f5f4'; c.beginPath(); c.arc(drawCx + 15 * s, gy - 13 * s, 2 * s, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#1e293b'; c.lineWidth = 0.5 * s; c.beginPath(); c.arc(drawCx + 15 * s, gy - 13 * s, 2 * s, 0, Math.PI * 2); c.stroke();
      // Sigh bubbles
      c.fillStyle = '#94a3b8'; c.globalAlpha = 0.5;
      const bubble1Y = gy - 32 * s - (ef % 60) * 0.3;
      c.beginPath(); c.arc(drawCx + 18 * s, bubble1Y, 1.5 * s, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(drawCx + 20 * s, bubble1Y - 4 * s, 2 * s, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(drawCx + 22 * s, bubble1Y - 9 * s, 3 * s, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1;
      c.fillStyle = '#1e293b'; c.font = (6 * s) + 'px sans-serif'; c.textAlign = 'center';
      c.fillText('...', drawCx + 22 * s, bubble1Y - 7 * s);
    }
  }

  // State indicators
  if (state === 'error') {
    c.fillStyle = '#ef4444'; c.font = `bold ${14 * s}px sans-serif`; c.textAlign = 'center';
    c.fillText('!', drawCx, gy - 26 * s + Math.sin(officeFrame * 0.15) * 2);
  }
  if (state === 'waiting') {
    c.fillStyle = '#f59e0b'; c.font = `bold ${14 * s}px sans-serif`; c.textAlign = 'center';
    c.fillText('?', drawCx, gy - 26 * s + Math.sin(officeFrame * 0.08) * 3);
  }
  if (state === 'busy') {
    const sp = officeFrame * 0.12 + ghostIdx;
    c.fillStyle = '#7dd3fc';
    for (let i = 0; i < 3; i++) {
      const angle = sp + i * 2.1;
      const dist = (14 + Math.sin(sp + i) * 4) * s;
      const spx = drawCx + Math.cos(angle) * dist;
      const spy = gy - 10 * s + Math.sin(angle) * dist * 0.6;
      const spSize = (1.5 + Math.sin(officeFrame * 0.2 + i) * 0.8) * s;
      c.beginPath();
      c.moveTo(spx, spy - spSize); c.lineTo(spx + spSize * 0.3, spy);
      c.lineTo(spx, spy + spSize); c.lineTo(spx - spSize * 0.3, spy);
      c.closePath(); c.fill();
    }
  }

  // Idle interaction chat bubble — Feature 4/10
  if (activeIdleInteraction && activeIdleInteraction.ghosts.includes(ghostIdx)) {
    const inter = activeIdleInteraction;
    const alpha = Math.min(1, inter.frame / 20) * Math.min(1, (inter.duration - inter.frame) / 20);
    c.globalAlpha = alpha;
    if (inter.type === 'chat') {
      // Chat bubble
      c.fillStyle = '#fff';
      c.beginPath();
      c.ellipse(drawCx + 20 * s, gy - 28 * s, 12 * s, 8 * s, 0, 0, Math.PI * 2);
      c.fill();
      // Bubble tail
      c.beginPath();
      c.moveTo(drawCx + 14 * s, gy - 22 * s);
      c.lineTo(drawCx + 10 * s, gy - 16 * s);
      c.lineTo(drawCx + 18 * s, gy - 22 * s);
      c.closePath();
      c.fill();
      c.fillStyle = '#1e293b';
      c.font = `bold ${8 * s}px sans-serif`; c.textAlign = 'center';
      c.fillText('...', drawCx + 20 * s, gy - 26 * s);
    }
    c.globalAlpha = 1;
  }

  c.restore(); // restore from walk tilt

  // Draw celebration particles at ghost position — Feature 3
  celebrationParticles.forEach(p => {
    if (p.ghostIdx === ghostIdx) {
      c.globalAlpha = p.life / p.maxLife;
      c.fillStyle = p.color;
      c.save();
      c.translate(drawCx + p.x, gy + p.y);
      c.rotate(p.rot);
      c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      c.restore();
      c.globalAlpha = 1;
    }
  });

  // Label
  c.fillStyle = '#94a3b8'; c.font = `${9 * s}px sans-serif`; c.textAlign = 'center';
  c.fillText(label, cx, cy + 34 * s);
}

// ---- Detect terminal state from output (multi-session) ----
// State management (updateOfficeOutput + checkIdle) is in ghost-cells.js IIFE
// office.js only reads termStates and window.lastRealOutputTimes

// ---- Main Loop ----
function startOfficeLoop() {
  function loop() {
    if (!officeActive) return;
    try {
    officeFrame++;
    // checkIdle is in ghost-cells.js animation loop

    // Update weather system — Feature 6
    updateWeather();
    if (officeFrame % 10 === 0) spawnWeatherParticle(officeW, officeH * 0.6);
    updateWeatherParticles(officeH * 0.6);
    // maybeSpawnShootingStar removed (handled by updateWindowScene)

    // Update celebration particles — Feature 3
    updateCelebrationParticles();
    checkIdleInteractions();

    // Feature 1: Update ghost emotes
    updateGhostEmotes();
    // Feature 1: Check idle watch emote (>15s no output while waiting)
    for (let ei = 0; ei < 4; ei++) {
      const eIdx = ei + 1;
      if (termStates[eIdx] === 'waiting') {
        const lastOut = lastOutputFrames[eIdx] || 0;
        if (lastOut > 0 && (officeFrame - lastOut) > ANIM.EMOTE_IDLE_WATCH_THRESHOLD) {
          if (!ghostEmote[ei] || ghostEmote[ei].type !== 'watch_wait') {
            triggerGhostEmote(ei, 'watch_wait', 300);
          }
        }
      }
      // Clear thinking emote when output stops being spinners
      if (ghostEmote[ei] && ghostEmote[ei].type === 'thinking') {
        const lastOut = lastOutputFrames[eIdx] || 0;
        if (lastOut > 0 && (officeFrame - lastOut) > 60) {
          ghostEmote[ei].type = null; ghostEmote[ei].frame = 0;
        }
      }
    }

    // Feature 2: Coffee system
    updateCoffeeSystem();
    // Feature 3: Paper ball
    updatePaperBall();
    // Feature 4: Office cat
    updateOfficeCat();
    // Feature 6: Achievements
    checkAchievement('four_open');
    checkAchievement('workhorse');
    // Feature 9: Race
    updateRace();

    // Feature 7: Window scene update
    const _windowW = officeW * 0.12, _windowH = officeH * 0.18;
    const _window1X = officeW * 0.28, _window2X = officeW * 0.60;
    const _windowY = officeH * 0.02;
    updateWindowScene(_windowW, _windowH, _window1X, _window2X, _windowY);

    // Initialize marble position if needed
    if (marble.x === 0 && marble.y === 0) resetMarbleToSlingshot();

    // Check state transitions for celebration + track busy end for coffee rush
    for (let i = 1; i <= 4; i++) {
      if (prevTermStates[i] === 'busy' && (termStates[i] === 'waiting' || termStates[i] === 'idle')) {
        triggerCelebration(i - 1);
        trackBusyEnd(i - 1);
      }
      prevTermStates[i] = termStates[i];
    }

    officeCtx.clearRect(0, 0, officeW, officeH);
    drawOfficeBg();

    const charScale = Math.min(officeW / 400, officeH / 500) * 1.1;

    // 4 Desks in 4 corners
    const deskW = officeW * 0.18, deskH = 10;
    const monW = officeW * 0.13, monH = officeH * 0.08;
    const deskPositions = [
      { x: officeW * 0.04, y: officeH * 0.14 },  // top-left
      { x: officeW * 0.78, y: officeH * 0.14 },  // top-right
      { x: officeW * 0.04, y: officeH * 0.58 },  // bottom-left
      { x: officeW * 0.78, y: officeH * 0.58 },  // bottom-right
    ];

    // Sofa area (center) — 4 spots clustered together
    const sofaCenterX = officeW * 0.5, sofaCenterY = officeH * 0.36;
    const sofaPositions = [
      { x: sofaCenterX - 35, y: sofaCenterY - 15 },
      { x: sofaCenterX + 35, y: sofaCenterY - 15 },
      { x: sofaCenterX - 35, y: sofaCenterY + 20 },
      { x: sofaCenterX + 35, y: sofaCenterY + 20 },
    ];

    // Draw jack-o-lantern sofas in center
    for (let i = 0; i < 4; i++) {
      const sp = sofaPositions[i];
      const c = officeCtx;
      c.fillStyle = '#ea580c';
      c.beginPath(); c.ellipse(sp.x, sp.y, 24, 12, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#c2410c';
      c.beginPath(); c.ellipse(sp.x - 10, sp.y, 8, 12, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(sp.x + 10, sp.y, 8, 12, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ea580c';
      c.beginPath(); c.ellipse(sp.x, sp.y, 10, 12, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#65a30d';
      c.fillRect(sp.x - 2, sp.y - 14, 4, 5);
      c.beginPath(); c.ellipse(sp.x + 4, sp.y - 13, 4, 2, 0.3, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fbbf24';
      c.beginPath();
      c.moveTo(sp.x - 7, sp.y - 4); c.lineTo(sp.x - 3, sp.y - 4); c.lineTo(sp.x - 5, sp.y - 1);
      c.closePath(); c.fill();
      c.beginPath();
      c.moveTo(sp.x + 3, sp.y - 4); c.lineTo(sp.x + 7, sp.y - 4); c.lineTo(sp.x + 5, sp.y - 1);
      c.closePath(); c.fill();
      c.beginPath();
      c.moveTo(sp.x - 8, sp.y + 2);
      c.lineTo(sp.x - 5, sp.y + 5); c.lineTo(sp.x - 2, sp.y + 2);
      c.lineTo(sp.x + 1, sp.y + 5); c.lineTo(sp.x + 4, sp.y + 2);
      c.lineTo(sp.x + 7, sp.y + 5); c.lineTo(sp.x + 8, sp.y + 2);
      c.stroke();
      c.fillStyle = '#fbbf24';
      c.fill();
      c.globalAlpha = 0.06 + Math.sin(officeFrame * 0.08 + i) * 0.03;
      oCircle(sp.x, sp.y, 30, '#f59e0b');
      c.globalAlpha = 1;
    }

    const ghostColors = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'];

    // Draw desks (always) + ghosts (only if session exists)
    for (let i = 0; i < 4; i++) {
      const dp = deskPositions[i];
      const tIdx = i + 1;
      const hasSession = i < GT.state.sessionList.length && !GT.state.sessionList[i]?.exited;
      // Use lastRealOutputTimes directly for reliable state
      const _lrt = window.lastRealOutputTimes || {};
      const _elapsed = Date.now() - (_lrt[tIdx] || 0);
      let state;
      if (hasSession && _lrt[tIdx] && _elapsed < 5000) {
        state = 'busy';
      } else if (hasSession && _lrt[tIdx] && _elapsed < 20000) {
        state = 'waiting';
      } else {
        state = termStates[tIdx] || 'idle';
      }

      // Always draw desk + monitor (pass state for keyboard animation)
      drawDesk(dp.x, dp.y, deskW, deskH, state);
      // Left desks (0,2): monitor on left side; Right desks (1,3): monitor on right side
      const isRight = (i === 1 || i === 3);
      const monX = isRight ? dp.x + deskW - monW - 3 : dp.x + 3;
      drawMonitor(monX, dp.y - monH - 2, monW, monH, state, termLines[tIdx] || []);
      // Monitor damage overlay (marble minigame)
      if (monitorDamage[i] > 0) drawDamagedMonitor(monX, dp.y - monH - 2, monW, monH, monitorDamage[i]);

      // Only draw ghost if session exists
      if (!hasSession) continue;

      // Ghost target position depends on state
      const sp = sofaPositions[i];
      let targetX, targetY;
      const floatY = Math.sin(officeFrame * 0.05 + i * 1.5) * 3;

      const workOffsets = [
        { dx: deskW / 2, dy: deskH + 30 },
        { dx: deskW / 2, dy: deskH + 30 },
        { dx: deskW / 2, dy: deskH + 30 },
        { dx: deskW / 2, dy: deskH + 30 },
      ];

      // Ghost repairing overrides normal state positioning
      if (ghostRepairing[i] > 0 && state === 'idle') {
        // Move to monitor to repair
        targetX = isRight ? dp.x + deskW : dp.x;
        targetY = dp.y - monH / 2;
      } else if (state === 'busy') {
        targetX = dp.x + workOffsets[i].dx;
        targetY = dp.y + workOffsets[i].dy + Math.sin(officeFrame * 0.2 + i) * 2;
      } else if (state === 'error') {
        targetX = dp.x + workOffsets[i].dx;
        targetY = dp.y + workOffsets[i].dy + Math.sin(officeFrame * 0.3) * 3;
      } else if (state === 'waiting') {
        targetX = dp.x + workOffsets[i].dx;
        targetY = dp.y + workOffsets[i].dy + floatY;
      } else {
        const idleCycle = Math.floor((officeFrame + i * 120) / 240) % 2;
        // Feature 10: idle ghost may wander to window
        if (activeIdleInteraction && activeIdleInteraction.ghosts.includes(i) && activeIdleInteraction.type === 'look') {
          // One ghost looks toward window
          const isFirst = activeIdleInteraction.ghosts[0] === i;
          if (isFirst) {
            targetX = officeW * 0.30; // near window
            targetY = officeH * 0.25;
          } else {
            targetX = sp.x;
            targetY = sp.y - 8 + floatY * 0.3;
          }
        } else if (idleCycle === 0) {
          targetX = sp.x;
          targetY = sp.y - 8 + floatY * 0.3;
        } else {
          const wanderRadius = 30;
          const wanderSpeed = 0.015;
          targetX = sp.x + Math.sin(officeFrame * wanderSpeed + i * 2.5) * wanderRadius;
          targetY = sp.y - 8 + Math.cos(officeFrame * wanderSpeed * 0.7 + i * 3.1) * wanderRadius * 0.6 + floatY;
        }
      }

      // Lerp ghost position for smooth walking — Feature 7
      const lerpResult = lerpGhostPos(i, targetX, targetY);
      let gx = lerpResult.x + ghostPushVel[i].vx;
      let gy = lerpResult.y + ghostPushVel[i].vy;

      const label = 'Terminal ' + tIdx;
      const deskCenter = { x: dp.x + deskW / 2, y: dp.y - monH / 2 };
      const sid = GT.state.sessionList[i]?.id;
      const cSlot = sid ? GT.getColorSlot(sid) : i;

      // Draw shield only for busy (working) ghosts
      if (state === 'busy') {
        drawShield(gx, gy, charScale, GHOST_COLORS[cSlot], shieldFlash[i]);
      }

      drawGhost(gx, gy, charScale, state, GHOST_COLORS[cSlot], label, cSlot, deskCenter);

      // debug removed

      // Draw scared expression overlay (covers normal eyes/mouth)
      if (ghostScared[i] > 0 && state === 'idle') {
        const c = officeCtx;
        const s = charScale;
        const float = Math.sin(officeFrame * 0.05 + i * 2) * 3;
        const scaredGy = gy + float;
        // Cover old eyes with body color, then draw scared eyes
        c.fillStyle = GHOST_COLORS[cSlot];
        c.fillRect(gx - 14 * s, scaredGy - 12 * s, 28 * s, 12 * s);
        // Big white eyes
        const eyeR = 6 * s;
        oCircle(gx - 6 * s, scaredGy - 5 * s, eyeR, '#fff');
        oCircle(gx + 6 * s, scaredGy - 5 * s, eyeR, '#fff');
        // Tiny pupils (shock)
        oCircle(gx - 6 * s, scaredGy - 5 * s, 1.5 * s, '#1e293b');
        oCircle(gx + 6 * s, scaredGy - 5 * s, 1.5 * s, '#1e293b');
        // Open mouth "O" (cover old mouth first)
        c.fillStyle = GHOST_COLORS[cSlot];
        c.fillRect(gx - 8 * s, scaredGy - 1 * s, 16 * s, 8 * s);
        c.strokeStyle = '#1e293b'; c.lineWidth = 1.5;
        c.beginPath(); c.arc(gx, scaredGy + 2 * s, 3 * s, 0, Math.PI * 2); c.stroke();
        // Exclamation mark
        c.fillStyle = '#ef4444'; c.font = `bold ${16 * s}px sans-serif`; c.textAlign = 'center';
        c.fillText('!', gx, scaredGy - 30 * s + Math.sin(officeFrame * 0.3) * 2);
      }

      // Draw repair animation
      if (ghostRepairing[i] > 0 && state === 'idle') {
        const c = officeCtx;
        const s = charScale;
        const repairProgress = 1 - (ghostRepairing[i] / MARBLE.REPAIR_FRAMES);

        // Wrench swinging (alternating angle)
        const swingAngle = Math.sin(officeFrame * 0.4) * 0.7;
        const hx = gx + 14 * s, hy = gy - 8 * s;

        c.save(); c.translate(hx, hy); c.rotate(swingAngle);
        // Wrench handle
        c.fillStyle = '#92400e'; c.fillRect(-1.5 * s, 0, 3 * s, 8 * s);
        // Wrench head (open-end)
        c.fillStyle = '#94a3b8';
        c.fillRect(-4 * s, -3 * s, 8 * s, 3 * s);
        c.fillStyle = '#1a1a2e'; // notch
        c.fillRect(-1 * s, -3 * s, 2 * s, 2 * s);
        c.restore();

        // Sparks when hitting (every other swing)
        if (Math.sin(officeFrame * 0.4) > 0.5) {
          c.fillStyle = '#fef08a';
          for (let sp = 0; sp < 3; sp++) {
            const sparkAngle = Math.random() * Math.PI * 2;
            const sparkDist = 3 + Math.random() * 5;
            const spx = hx + Math.cos(sparkAngle) * sparkDist * s;
            const spy = hy + Math.sin(sparkAngle) * sparkDist * s;
            c.globalAlpha = 0.5 + Math.random() * 0.5;
            c.beginPath(); c.arc(spx, spy, 1, 0, Math.PI * 2); c.fill();
          }
          c.globalAlpha = 1;
        }

        // Progress bar above ghost
        const barW = 20 * s, barH = 3 * s;
        const barX = gx - barW / 2, barY = gy - 22 * s;
        c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(barX, barY, barW, barH);
        c.fillStyle = '#10b981'; c.fillRect(barX, barY, barW * repairProgress, barH);
        c.strokeStyle = 'rgba(255,255,255,0.3)'; c.lineWidth = 0.5;
        c.strokeRect(barX, barY, barW, barH);
      }
    }

    // Update & draw marble slingshot minigame
    updateMarble(deskPositions, deskW, deskH, monW, monH, charScale);
    drawSlingshot();
    drawMarble();

    // Feature 4: Draw office cat
    drawOfficeCat();

    // Feature 3: Draw paper ball
    if (paperBallState.active) {
      const pc = officeCtx;
      pc.fillStyle = '#e2e8f0';
      pc.save(); pc.translate(paperBallState.x, paperBallState.y);
      pc.rotate((officeFrame || 0) * 0.2);
      pc.fillRect(-ANIM.PAPER_SIZE / 2, -ANIM.PAPER_SIZE / 2, ANIM.PAPER_SIZE, ANIM.PAPER_SIZE);
      pc.restore();
      // Hit stars on target
      if (paperBallState.hitStars > 0 && paperBallState.outcome === 'hit') {
        const tp = ghostCurrentPos[paperBallState.target];
        if (tp && tp.initialized) {
          pc.fillStyle = '#fbbf24'; pc.font = 'bold 10px sans-serif'; pc.textAlign = 'center';
          pc.fillText('\u2605', tp.x, tp.y - 25);
          pc.fillText('\u2605', tp.x - 8, tp.y - 20);
          pc.fillText('\u2605', tp.x + 8, tp.y - 20);
        }
      }
    }
    // Score float
    if (paperBallState.scoreFloat) {
      const sf = paperBallState.scoreFloat;
      sf.frame++;
      const pc = officeCtx;
      pc.globalAlpha = Math.max(0, 1 - sf.frame / 60);
      pc.fillStyle = '#10b981'; pc.font = 'bold 8px sans-serif'; pc.textAlign = 'center';
      pc.fillText('+1', sf.x, sf.y - sf.frame * 0.5);
      pc.globalAlpha = 1;
      if (sf.frame > 60) paperBallState.scoreFloat = null;
    }

    // Feature 2: Draw coffee animation
    if (coffeeState.active && coffeeState.ghostIdx >= 0) {
      const ci = coffeeState.ghostIdx;
      const gp = ghostCurrentPos[ci];
      if (gp && gp.initialized) {
        const cc = officeCtx;
        if (coffeeState.phase >= ANIM.COFFEE_PHASE_PICKUP && coffeeState.phase <= ANIM.COFFEE_PHASE_DRINK) {
          // Draw cup near ghost hand
          const cupX = gp.x + 12, cupY = gp.y - 5;
          const liftY = coffeeState.phase === ANIM.COFFEE_PHASE_DRINK ? (coffeeState.rushMode ? -15 : -8) : 0;
          cc.fillStyle = '#f5f5f4'; cc.fillRect(cupX - 3, cupY - 5 + liftY, 6, 5);
          cc.fillStyle = '#92400e'; cc.fillRect(cupX - 2, cupY - 4 + liftY, 4, 3);
        }
        if (coffeeState.phase === ANIM.COFFEE_PHASE_STARS) {
          // Star eyes
          cc.fillStyle = '#fbbf24'; cc.font = 'bold 8px sans-serif'; cc.textAlign = 'center';
          cc.fillText('\u2605', gp.x - 4, gp.y - 3);
          cc.fillText('\u2605', gp.x + 6, gp.y - 3);
        }
      }
    }

    // Feature 10: Seasonal decorations
    drawSeasonalDecorations();

    // Feature 6: Badge wall
    drawBadgeWall();

    // Feature 8: Wardrobe button (bottom-left)
    const wbX = officeW * 0.02, wbY = officeH * 0.88;
    const wbW = 22, wbH = 28;
    officeCtx.fillStyle = '#5c3d1e'; officeCtx.fillRect(wbX, wbY, wbW, wbH);
    officeCtx.fillStyle = '#7a5230'; officeCtx.fillRect(wbX + 2, wbY + 2, wbW - 4, wbH - 4);
    officeCtx.strokeStyle = '#92400e'; officeCtx.lineWidth = 0.5;
    officeCtx.beginPath(); officeCtx.moveTo(wbX + wbW / 2, wbY + 2); officeCtx.lineTo(wbX + wbW / 2, wbY + wbH - 2); officeCtx.stroke();
    // Hanger icon
    officeCtx.strokeStyle = '#a3541a'; officeCtx.lineWidth = 1.5;
    officeCtx.beginPath(); officeCtx.arc(wbX + wbW / 2, wbY + 8, 3, Math.PI, 0); officeCtx.stroke();
    officeCtx.beginPath(); officeCtx.moveTo(wbX + wbW / 2 - 6, wbY + 14); officeCtx.lineTo(wbX + wbW / 2, wbY + 8);
    officeCtx.lineTo(wbX + wbW / 2 + 6, wbY + 14); officeCtx.stroke();
    // Knob
    officeCtx.fillStyle = '#fbbf24'; officeCtx.beginPath(); officeCtx.arc(wbX + wbW * 0.7, wbY + wbH / 2, 1.5, 0, Math.PI * 2); officeCtx.fill();

    // Feature 9: Race flag button (bottom-right)
    const rfX = officeW * 0.94, rfY = officeH * 0.88;
    officeCtx.font = 'bold 14px sans-serif'; officeCtx.textAlign = 'center';
    officeCtx.fillStyle = raceState.active ? '#ef4444' : '#94a3b8';
    officeCtx.fillText('\uD83C\uDFC1', rfX, rfY + 14);

    // Draw weather particles on screen (rain/snow over the whole office) — Feature 6
    const wc = officeCtx;
    weatherParticles.forEach(p => {
      if (p.type === 'rain') {
        wc.strokeStyle = 'rgba(96,165,250,0.3)';
        wc.lineWidth = 1;
        wc.beginPath();
        wc.moveTo(p.x, p.y);
        wc.lineTo(p.x - 1, p.y + p.size * 2);
        wc.stroke();
      } else if (p.type === 'snow') {
        wc.fillStyle = 'rgba(255,255,255,0.5)';
        wc.beginPath();
        wc.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        wc.fill();
      }
    });

    // Feature 7: Lightning flash overlay
    drawLightningFlash();

    // Feature 9: Race overlay (on top of everything)
    drawRace();

    } catch(e) { GT.ui.showToast('[loop error] ' + e.message); console.error(e); return; }
    officeAnimId = requestAnimationFrame(loop);
  }
  loop();
}

// Tap character to switch terminal / create new session
const _pixelView = document.getElementById('pixel-view');
if (_pixelView) _pixelView.addEventListener('click', (e) => {
  if (!officeActive) return;
  const rect = officeCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;

  // Feature 8: Wardrobe click detection
  const wbX = officeW * 0.02, wbY = officeH * 0.88;
  const wbW = 22, wbH = 28;
  if (x >= wbX && x <= wbX + wbW && y >= wbY && y <= wbY + wbH) {
    openWardrobePanel();
    GT.controls.vibrate();
    return;
  }

  // Feature 9: Race flag button click detection
  const rfX = officeW * 0.94, rfY = officeH * 0.88;
  if (Math.hypot(x - rfX, y - (rfY + 7)) < 20) {
    startRace();
    GT.controls.vibrate();
    return;
  }

  // Check tap on desk corners (always clickable) or ghost positions
  const deskCenters = [
    { x: officeW * 0.04 + officeW * 0.09, y: officeH * 0.14 },
    { x: officeW * 0.78 + officeW * 0.09, y: officeH * 0.14 },
    { x: officeW * 0.04 + officeW * 0.09, y: officeH * 0.58 },
    { x: officeW * 0.78 + officeW * 0.09, y: officeH * 0.58 },
  ];
  const sofaCenterX = officeW * 0.5, sofaCenterY = officeH * 0.36;
  const sofas = [
    { x: sofaCenterX - 35, y: sofaCenterY - 15 },
    { x: sofaCenterX + 35, y: sofaCenterY - 15 },
    { x: sofaCenterX - 35, y: sofaCenterY + 20 },
    { x: sofaCenterX + 35, y: sofaCenterY + 20 },
  ];

  for (let i = 0; i < 4; i++) {
    // Check if tap is near desk or sofa for this slot
    const nearDesk = Math.hypot(x - deskCenters[i].x, y - deskCenters[i].y) < 60;
    const nearSofa = Math.hypot(x - sofas[i].x, y - sofas[i].y) < 50;
    if (nearDesk || nearSofa) {
      if (i < GT.state.sessionList.length && !GT.state.sessionList[i].exited) {
        GT.sessions.switchSession(GT.state.sessionList[i].id);
        GT.ui.showToast('Terminal ' + (i + 1));
      } else if (GT.state.sessionList.length < 4) {
        GT.sessions.createNewSession();
        GT.ui.showToast('Creating Terminal ' + (GT.state.sessionList.length + 1) + '...');
        setTimeout(() => toggleView(), 300);
      }
      GT.controls.vibrate();
      break;
    }
  }
});

// ==================== Marble Slingshot Touch Handlers ====================
let marbleTouchId = null;

function getSlingshotRestY() {
  return (officeH - 20) - 18 + 6; // baseY - forkH + 6
}

function isInSlingshotArea(tx, ty) {
  const sx = officeW / 2;
  const sy = getSlingshotRestY();
  return Math.hypot(tx - sx, ty - sy) < MARBLE.SLINGSHOT_TOUCH_R;
}

(_pixelView || document.getElementById('pixel-view'))?.addEventListener('touchstart', (e) => {
  if (!officeActive) return;
  // Tap slingshot while marble is flying → recall it instantly
  if (marble.active || marble.fadeOut > 0 || marble.respawnTimer > 0) {
    const rect = officeCanvas.getBoundingClientRect();
    for (const touch of e.changedTouches) {
      const tx = touch.clientX - rect.left;
      const ty = touch.clientY - rect.top;
      if (isInSlingshotArea(tx, ty)) {
        marble.active = false;
        marble.fadeOut = 0;
        marble.respawnTimer = 0;
        marble.x = officeW / 2;
        marble.y = getSlingshotRestY();
        marble.vx = 0;
        marble.vy = 0;
        marble.trail = [];
        return;
      }
    }
    return;
  }
  if (marbleTouchId !== null) return;
  const rect = officeCanvas.getBoundingClientRect();
  for (const touch of e.changedTouches) {
    const tx = touch.clientX - rect.left;
    const ty = touch.clientY - rect.top;
    if (isInSlingshotArea(tx, ty)) {
      marbleTouchId = touch.identifier;
      marble.dragging = true;
      marble.dragX = tx;
      marble.dragY = ty;
      e.preventDefault();
      return;
    }
  }
}, { passive: false });

(_pixelView || document.getElementById('pixel-view'))?.addEventListener('touchmove', (e) => {
  if (marbleTouchId === null || !marble.dragging) return;
  const rect = officeCanvas.getBoundingClientRect();
  for (const touch of e.changedTouches) {
    if (touch.identifier === marbleTouchId) {
      let tx = touch.clientX - rect.left;
      let ty = touch.clientY - rect.top;
      // Clamp pull distance
      const dx = tx - slingshotX;
      const dy = ty - getSlingshotRestY();
      const dist = Math.hypot(dx, dy);
      if (dist > MARBLE.MAX_PULL) {
        tx = slingshotX + dx / dist * MARBLE.MAX_PULL;
        ty = getSlingshotRestY() + dy / dist * MARBLE.MAX_PULL;
      }
      marble.dragX = tx;
      marble.dragY = ty;
      e.preventDefault();
      return;
    }
  }
}, { passive: false });

(_pixelView || document.getElementById('pixel-view'))?.addEventListener('touchend', (e) => {
  if (marbleTouchId === null || !marble.dragging) return;
  for (const touch of e.changedTouches) {
    if (touch.identifier === marbleTouchId) {
      // Launch marble
      const restY = getSlingshotRestY();
      const dx = marble.dragX - slingshotX;
      const dy = marble.dragY - restY;
      const dist = Math.hypot(dx, dy);
      if (dist > 5) { // minimum pull distance
        marble.x = slingshotX;
        marble.y = restY;
        marble.vx = -dx * MARBLE.LAUNCH_MULT;
        marble.vy = -dy * MARBLE.LAUNCH_MULT;
        marble.active = true;
        marble.trail = [];
        spawnLaunchParticles(marble.x, marble.y, marble.vx, marble.vy);
      }
      marble.dragging = false;
      marbleTouchId = null;
      e.preventDefault();
      return;
    }
  }
}, { passive: false });

(_pixelView || document.getElementById('pixel-view'))?.addEventListener('touchcancel', (e) => {
  if (marbleTouchId !== null) {
    marble.dragging = false;
    marbleTouchId = null;
  }
});

// Also support mouse for desktop testing
let marbleMouseDown = false;
(_pixelView || document.getElementById('pixel-view'))?.addEventListener('mousedown', (e) => {
  if (!officeActive || marble.active || marble.fadeOut > 0 || marble.respawnTimer > 0) return;
  const rect = officeCanvas.getBoundingClientRect();
  const tx = e.clientX - rect.left;
  const ty = e.clientY - rect.top;
  if (isInSlingshotArea(tx, ty)) {
    marbleMouseDown = true;
    marble.dragging = true;
    marble.dragX = tx;
    marble.dragY = ty;
  }
});

(_pixelView || document.getElementById('pixel-view'))?.addEventListener('mousemove', (e) => {
  if (!marbleMouseDown || !marble.dragging) return;
  const rect = officeCanvas.getBoundingClientRect();
  let tx = e.clientX - rect.left;
  let ty = e.clientY - rect.top;
  const dx = tx - slingshotX;
  const dy = ty - getSlingshotRestY();
  const dist = Math.hypot(dx, dy);
  if (dist > MARBLE.MAX_PULL) {
    tx = slingshotX + dx / dist * MARBLE.MAX_PULL;
    ty = getSlingshotRestY() + dy / dist * MARBLE.MAX_PULL;
  }
  marble.dragX = tx;
  marble.dragY = ty;
});

(_pixelView || document.getElementById('pixel-view'))?.addEventListener('mouseup', (e) => {
  if (!marbleMouseDown || !marble.dragging) return;
  const restY = getSlingshotRestY();
  const dx = marble.dragX - slingshotX;
  const dy = marble.dragY - restY;
  const dist = Math.hypot(dx, dy);
  if (dist > 5) {
    marble.x = slingshotX;
    marble.y = restY;
    marble.vx = -dx * MARBLE.LAUNCH_MULT;
    marble.vy = -dy * MARBLE.LAUNCH_MULT;
    marble.active = true;
    marble.trail = [];
    spawnLaunchParticles(marble.x, marble.y, marble.vx, marble.vy);
  }
  marble.dragging = false;
  marbleMouseDown = false;
});

// ==================== Feature 8: Wardrobe Panel ====================
function openWardrobePanel() {
  if (wardrobeOpen) { closeWardrobePanel(); return; }
  wardrobeOpen = true;
  let panel = document.getElementById('wardrobe-panel');
  if (panel) { panel.style.display = 'flex'; return; }
  panel = document.createElement('div');
  panel.id = 'wardrobe-panel';
  panel.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1a1a2e;border:2px solid #8b5cf6;border-radius:12px;padding:12px;z-index:10000;display:flex;flex-direction:column;gap:8px;min-width:240px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.7);';
  // Title
  const title = document.createElement('div');
  title.style.cssText = 'color:#e2e8f0;font-weight:700;font-size:14px;text-align:center;margin-bottom:4px;';
  title.textContent = 'Wardrobe';
  panel.appendChild(title);
  // Rows
  for (let g = 0; g < 4; g++) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;';
    // Ghost color dot
    const dot = document.createElement('span');
    dot.style.cssText = 'width:12px;height:12px;border-radius:50%;flex-shrink:0;background:' + GHOST_COLORS[g] + ';';
    row.appendChild(dot);
    // Name
    const name = document.createElement('span');
    name.style.cssText = 'color:#94a3b8;font-size:11px;width:18px;flex-shrink:0;';
    name.textContent = 'T' + (g + 1);
    row.appendChild(name);
    // Buttons
    const items = WARDROBE_ITEMS[g];
    items.forEach((item, idx) => {
      const btn = document.createElement('button');
      btn.style.cssText = 'background:' + (ghostAccessoryChoice[g] === idx ? '#8b5cf6' : '#252545') + ';color:#e2e8f0;border:1px solid #2d2d50;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;flex:1;';
      btn.textContent = item.label;
      btn.onclick = () => {
        ghostAccessoryChoice[g] = idx;
        saveWardrobe();
        // Update button styles
        row.querySelectorAll('button').forEach((b, bi) => {
          b.style.background = bi === idx ? '#8b5cf6' : '#252545';
        });
      };
      row.appendChild(btn);
    });
    panel.appendChild(row);
  }
  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'background:#ef4444;color:#fff;border:none;border-radius:6px;padding:6px;font-size:12px;cursor:pointer;margin-top:4px;';
  closeBtn.textContent = 'Close';
  closeBtn.onclick = closeWardrobePanel;
  panel.appendChild(closeBtn);
  document.body.appendChild(panel);
}

function closeWardrobePanel() {
  wardrobeOpen = false;
  const panel = document.getElementById('wardrobe-panel');
  if (panel) panel.style.display = 'none';
}

// ==================== Feature 2: Coffee table cup visibility ====================
// Override the coffee cup drawing in drawOfficeBg based on coffeeState
// We handle this by checking coffeeState.cupVisible when drawing the lounge coffee cup

// ==================== Track busy end for rush coffee ====================
// Hook into state transitions to track when busy ends
function trackBusyEnd(ghostIdx) {
  lastBusyEndFrame[ghostIdx] = officeFrame || gcFrame || 0;
}

// ==================== PWA Cleanup ====================
// Remove old service worker that was caching stale files
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.unregister());
  });
}


// ==================== Achievement Badges ====================
// ==================== Feature 6: Achievement Badges ====================
const ACHIEVEMENTS = {
  four_open: { id: 'four_open', label: 'Four Open', color: '#fbbf24', icon: 'trophy' },
  workhorse: { id: 'workhorse', label: 'Workhorse', color: '#3b82f6', icon: 'star' },
  sharpshooter: { id: 'sharpshooter', label: 'Sharpshooter', color: '#ef4444', icon: 'target' },
  cat_keyboard: { id: 'cat_keyboard', label: 'Cat Servant', color: '#f59e0b', icon: 'heart' },
};
let unlockedBadges = [];
let badgeFallAnim = null; // { id, y, targetY, flash }
let badgeToast = null; // { text, frame }
const BADGE_BUSY_THRESHOLD = 36000; // 10min at 60fps for workhorse
let marbleConsecutiveHits = 0;

function loadBadges() {
  try {
    const saved = localStorage.getItem('ghostterm_badges');
    if (saved) unlockedBadges = JSON.parse(saved);
  } catch (e) { /* ignore */ }
}
function saveBadges() {
  try { localStorage.setItem('ghostterm_badges', JSON.stringify(unlockedBadges)); } catch (e) { /* ignore */ }
}
loadBadges();

function unlockBadge(id) {
  if (unlockedBadges.includes(id)) return;
  unlockedBadges.push(id);
  saveBadges();
  badgeFallAnim = { id, y: -20, targetY: ANIM.BADGE_AREA_Y_RATIO * (officeH || 300) + 8, flash: ANIM.BADGE_FLASH_DURATION };
  const ach = ACHIEVEMENTS[id];
  if (ach) badgeToast = { text: 'Unlocked: ' + ach.label + '!', frame: 0 };
}

function checkAchievement(type) {
  switch (type) {
    case 'four_open':
      if (GT.state.sessionList.filter(s => !s.exited).length >= 4) unlockBadge('four_open');
      break;
    case 'workhorse':
      for (let i = 1; i <= 4; i++) {
        if (busyStartTimes[i] && ((officeFrame || gcFrame) - busyStartTimes[i]) > BADGE_BUSY_THRESHOLD) {
          unlockBadge('workhorse'); break;
        }
      }
      break;
    case 'sharpshooter':
      marbleConsecutiveHits++;
      if (marbleConsecutiveHits >= 2) unlockBadge('sharpshooter');
      break;
    case 'marble_miss':
      marbleConsecutiveHits = 0;
      break;
    case 'cat_keyboard':
      if (officeCat.keyboardJumps >= 5) unlockBadge('cat_keyboard');
      break;
  }
}

function drawBadgeWall() {
  if (!officeCtx) return;
  const c = officeCtx;
  const bx = officeW * ANIM.BADGE_AREA_X_RATIO;
  const by = officeH * ANIM.BADGE_AREA_Y_RATIO;
  const bw = ANIM.BADGE_AREA_W;
  const bh = ANIM.BADGE_AREA_H;
  // Background panel
  c.fillStyle = 'rgba(15,15,26,0.7)';
  oRoundRect(bx, by, bw, bh, 4); c.fill();
  c.strokeStyle = 'rgba(139,92,246,0.3)'; c.lineWidth = 0.5;
  oRoundRect(bx, by, bw, bh, 4); c.stroke();
  // Draw badges
  const badgeR = 5;
  for (let i = 0; i < ANIM.BADGE_MAX_DISPLAY; i++) {
    const badgeX = bx + 7 + i * 13;
    const badgeY = by + bh / 2;
    if (i < unlockedBadges.length) {
      const ach = ACHIEVEMENTS[unlockedBadges[i]];
      if (!ach) continue;
      c.fillStyle = ach.color;
      c.beginPath(); c.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2); c.fill();
      // Icon
      c.fillStyle = '#fff'; c.font = 'bold 5px sans-serif'; c.textAlign = 'center';
      const icons = { trophy: '\u2606', star: '\u2605', target: '\u25CE', heart: '\u2665' };
      c.fillText(icons[ach.icon] || '*', badgeX, badgeY + 2);
    } else {
      c.strokeStyle = 'rgba(148,163,184,0.2)'; c.lineWidth = 0.5;
      c.beginPath(); c.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2); c.stroke();
    }
  }
  // Fall animation
  if (badgeFallAnim) {
    const ba = badgeFallAnim;
    ba.y += ANIM.BADGE_FALL_SPEED;
    if (ba.y >= ba.targetY) { ba.y = ba.targetY; ba.flash--; }
    if (ba.flash <= 0) { badgeFallAnim = null; return; }
    const ach = ACHIEVEMENTS[ba.id];
    if (ach) {
      c.fillStyle = ach.color;
      c.globalAlpha = 0.5 + Math.sin(ba.flash * 0.3) * 0.5;
      c.beginPath(); c.arc(bx + 7 + (unlockedBadges.indexOf(ba.id)) * 13, ba.y, badgeR + 2, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1;
    }
  }
  // Toast
  if (badgeToast) {
    badgeToast.frame++;
    const alpha = badgeToast.frame < 30 ? badgeToast.frame / 30 : Math.max(0, 1 - (badgeToast.frame - 120) / 30);
    if (alpha > 0) {
      c.globalAlpha = alpha;
      c.fillStyle = '#fbbf24'; c.font = 'bold 8px sans-serif'; c.textAlign = 'center';
      c.fillText(badgeToast.text, officeW / 2, officeH * 0.15);
      c.globalAlpha = 1;
    }
    if (badgeToast.frame > 150) badgeToast = null;
  }
}

// ==================== Window Scene Dynamics ====================
// ==================== Feature 7: Window Scene Dynamics ====================
const windowBirds = [];
const windowClouds = [
  { x: 0, y: 0.3, w: 12 },
  { x: 0.5, y: 0.5, w: 10 },
];
let windowPlane = null;
let windowUfo = null;
const shootingStars = []; // enhanced: multiple
let lightningState = { active: false, frame: 0, phase: 0 };

function updateWindowScene(windowW, windowH, window1X, window2X, windowY) {
  const phase = getDayPhase();
  const frame = officeFrame || 0;
  // Birds (daytime)
  if ((phase === 'day' || phase === 'morning') && windowBirds.length < 3 && Math.random() < 0.005) {
    windowBirds.push({ x: -5, y: windowY + Math.random() * windowH * 0.5, speed: ANIM.BIRD_SPEED + Math.random() * 0.3 });
  }
  for (let i = windowBirds.length - 1; i >= 0; i--) {
    windowBirds[i].x += windowBirds[i].speed;
    if (windowBirds[i].x > officeW) windowBirds.splice(i, 1);
  }
  // Clouds
  windowClouds.forEach(cl => {
    cl.x += ANIM.CLOUD_SPEED / officeW;
    if (cl.x > 1.2) cl.x = -0.3;
  });
  // Plane (evening)
  if (phase === 'evening' && !windowPlane && Math.random() < 0.002) {
    windowPlane = { x: 0, y: windowY + 5, frame: 0 };
  }
  if (windowPlane) {
    windowPlane.x += 1.2;
    windowPlane.y += 0.4;
    windowPlane.frame++;
    if (windowPlane.x > officeW) windowPlane = null;
  }
  // UFO (night)
  if (phase === 'night' && !windowUfo && Math.random() < ANIM.UFO_CHANCE) {
    windowUfo = { x: -10, y: windowY + windowH * 0.3, frame: 0 };
  }
  if (windowUfo) {
    windowUfo.x += officeW / ANIM.UFO_DURATION;
    windowUfo.frame++;
    if (windowUfo.frame > ANIM.UFO_DURATION) windowUfo = null;
  }
  // Enhanced shooting stars (night, 3-5 simultaneous)
  if (phase === 'night' && shootingStars.length < 5 && Math.random() < 0.003) {
    shootingStars.push({
      x: Math.random() * officeW * 0.5,
      y: windowY + Math.random() * windowH * 0.4,
      vx: 4 + Math.random() * 3,
      vy: 1.5 + Math.random(),
      life: 30,
    });
  }
  for (let i = shootingStars.length - 1; i >= 0; i--) {
    const s = shootingStars[i];
    s.x += s.vx; s.y += s.vy; s.life--;
    if (s.life <= 0) shootingStars.splice(i, 1);
  }
  // Lightning (rain)
  if (currentWeather === 'rain' && !lightningState.active && Math.random() < ANIM.LIGHTNING_CHANCE) {
    lightningState.active = true;
    lightningState.frame = 0;
    lightningState.phase = 1;
  }
  if (lightningState.active) {
    lightningState.frame++;
    if (lightningState.phase === 1 && lightningState.frame > ANIM.LIGHTNING_FLASH1) {
      lightningState.phase = 2; lightningState.frame = 0;
    } else if (lightningState.phase === 2 && lightningState.frame > ANIM.LIGHTNING_FLASH2_DELAY) {
      lightningState.phase = 3; lightningState.frame = 0;
    } else if (lightningState.phase === 3 && lightningState.frame > ANIM.LIGHTNING_FLASH2) {
      lightningState.active = false; lightningState.phase = 0;
    }
  }
}

function drawWindowSceneExtras(wx, windowY, windowW, windowH) {
  const c = officeCtx;
  // Birds
  windowBirds.forEach(b => {
    if (b.x > wx && b.x < wx + windowW) {
      c.strokeStyle = '#1e293b'; c.lineWidth = 1;
      c.beginPath();
      c.moveTo(b.x - 3, b.y); c.lineTo(b.x, b.y - 2); c.lineTo(b.x + 3, b.y);
      c.stroke();
    }
  });
  // Clouds
  windowClouds.forEach(cl => {
    const cx = wx + cl.x * windowW;
    const cy = windowY + cl.y * windowH;
    if (cx > wx - cl.w && cx < wx + windowW + cl.w) {
      c.fillStyle = 'rgba(255,255,255,0.6)';
      c.beginPath(); c.ellipse(cx, cy, cl.w, cl.w * 0.4, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(cx + cl.w * 0.5, cy + 1, cl.w * 0.7, cl.w * 0.3, 0, 0, Math.PI * 2); c.fill();
    }
  });
  // Plane
  if (windowPlane && windowPlane.x > wx && windowPlane.x < wx + windowW) {
    c.strokeStyle = '#94a3b8'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(windowPlane.x - 4, windowPlane.y); c.lineTo(windowPlane.x + 4, windowPlane.y); c.stroke();
    c.beginPath(); c.moveTo(windowPlane.x, windowPlane.y - 2); c.lineTo(windowPlane.x, windowPlane.y + 2); c.stroke();
    // Trail
    c.strokeStyle = 'rgba(148,163,184,0.3)'; c.lineWidth = 0.5;
    c.beginPath(); c.moveTo(windowPlane.x - 4, windowPlane.y); c.lineTo(windowPlane.x - 20, windowPlane.y - 6); c.stroke();
  }
  // UFO
  if (windowUfo && windowUfo.x > wx && windowUfo.x < wx + windowW) {
    c.fillStyle = '#94a3b8';
    c.beginPath(); c.ellipse(windowUfo.x, windowUfo.y, 6, 2.5, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#6366f1';
    c.beginPath(); c.ellipse(windowUfo.x, windowUfo.y - 2, 3, 2, 0, 0, Math.PI); c.fill();
    // Light beam
    c.fillStyle = 'rgba(99,102,241,0.15)';
    c.beginPath(); c.moveTo(windowUfo.x - 3, windowUfo.y + 2); c.lineTo(windowUfo.x + 3, windowUfo.y + 2);
    c.lineTo(windowUfo.x + 8, windowUfo.y + 15); c.lineTo(windowUfo.x - 8, windowUfo.y + 15); c.closePath(); c.fill();
  }
  // Shooting stars (enhanced)
  shootingStars.forEach(s => {
    if (s.x > wx && s.x < wx + windowW) {
      c.strokeStyle = '#fff'; c.lineWidth = 1.5;
      c.globalAlpha = s.life / 30;
      c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x - s.vx * 3, s.y - s.vy * 3); c.stroke();
      c.globalAlpha = 1;
    }
  });
}

function drawLightningFlash() {
  if (!lightningState.active) return;
  if (lightningState.phase === 1 || lightningState.phase === 3) {
    officeCtx.fillStyle = 'rgba(255,255,255,0.2)';
    officeCtx.fillRect(0, 0, officeW, officeH);
  }
}

// ==================== Ghost Race ====================
// ==================== Feature 9: Ghost Race ====================
const raceState = {
  active: false, countdown: -1, countdownFrame: 0,
  ghosts: [{ x: 0, speed: 0, finished: false }, { x: 0, speed: 0, finished: false }, { x: 0, speed: 0, finished: false }, { x: 0, speed: 0, finished: false }],
  winner: -1, crownTimer: 0, finishX: 0,
};

function startRace() {
  if (raceState.active) return;
  raceState.active = true;
  raceState.countdown = 3;
  raceState.countdownFrame = 0;
  raceState.winner = -1;
  raceState.crownTimer = 0;
  raceState.finishX = officeW * 0.85;
  const startX = officeW * 0.1;
  for (let i = 0; i < 4; i++) {
    raceState.ghosts[i].x = startX;
    raceState.ghosts[i].speed = ANIM.RACE_BASE_SPEED + Math.random() * ANIM.RACE_SPEED_VARIANCE;
    raceState.ghosts[i].finished = false;
  }
}

function updateRace() {
  if (!raceState.active) {
    if (raceState.crownTimer > 0) raceState.crownTimer--;
    return;
  }
  raceState.countdownFrame++;
  if (raceState.countdown > 0) {
    if (raceState.countdownFrame >= ANIM.RACE_COUNTDOWN_FRAMES) {
      raceState.countdown--;
      raceState.countdownFrame = 0;
    }
    return;
  }
  // Racing
  let allFinished = true;
  for (let i = 0; i < 4; i++) {
    if (raceState.ghosts[i].finished) continue;
    allFinished = false;
    raceState.ghosts[i].x += raceState.ghosts[i].speed + (Math.random() - 0.5) * 0.3;
    if (raceState.ghosts[i].x >= raceState.finishX) {
      raceState.ghosts[i].finished = true;
      raceState.ghosts[i].x = raceState.finishX;
      if (raceState.winner < 0) {
        raceState.winner = i;
        raceState.crownTimer = ANIM.RACE_CROWN_DURATION;
      }
    }
  }
  if (allFinished) {
    raceState.active = false;
  }
}

function drawRace() {
  if (!raceState.active && raceState.crownTimer <= 0) return;
  const c = officeCtx;
  if (raceState.active) {
    // Semi-transparent overlay
    c.fillStyle = 'rgba(15,15,26,0.5)';
    c.fillRect(0, 0, officeW, officeH);
    // Countdown
    if (raceState.countdown > 0) {
      c.fillStyle = '#fbbf24'; c.font = 'bold 40px sans-serif'; c.textAlign = 'center';
      c.fillText('' + raceState.countdown, officeW / 2, officeH / 2);
      return;
    }
    if (raceState.countdown === 0 && raceState.countdownFrame < 30) {
      c.fillStyle = '#10b981'; c.font = 'bold 30px sans-serif'; c.textAlign = 'center';
      c.fillText('GO!', officeW / 2, officeH / 2);
    }
    // Racing ghosts
    const laneH = officeH / 6;
    for (let i = 0; i < 4; i++) {
      const lane = laneH * (i + 1);
      const gx = raceState.ghosts[i].x;
      const sid = GT.state.sessionList[i]?.id;
      const cSlot = sid ? GT.getColorSlot(sid) : i;
      const color = GHOST_COLORS[cSlot];
      // Lane line
      c.strokeStyle = 'rgba(148,163,184,0.2)'; c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(officeW * 0.08, lane); c.lineTo(raceState.finishX + 10, lane); c.stroke();
      // Ghost mini
      c.fillStyle = color;
      c.beginPath(); c.arc(gx, lane - 8, 10, Math.PI, 0);
      c.lineTo(gx + 10, lane + 4);
      for (let j = 0; j < 3; j++) {
        const wx = gx + 10 - (j + 1) * 6.7;
        const wy = lane + 4 + Math.sin((officeFrame || 0) * 0.15 + j) * 2;
        c.quadraticCurveTo(wx + 1.7, wy + 2, wx - 1.7, wy);
      }
      c.lineTo(gx - 10, lane - 8);
      c.closePath(); c.fill();
      // Eyes
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(gx - 3, lane - 9, 3, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(gx + 3, lane - 9, 3, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#1e293b';
      c.beginPath(); c.arc(gx - 2, lane - 9, 1.2, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(gx + 4, lane - 9, 1.2, 0, Math.PI * 2); c.fill();
      // Winner crown
      if (raceState.ghosts[i].finished && raceState.winner === i) {
        drawCrown(c, gx, lane - 22, 0.6, officeFrame || 0);
        c.fillStyle = '#fbbf24'; c.font = 'bold 10px sans-serif'; c.textAlign = 'center';
        c.fillText('1st!', gx, lane - 28);
      }
    }
    // Finish line
    c.strokeStyle = '#ef4444'; c.lineWidth = 2; c.setLineDash([4, 4]);
    c.beginPath(); c.moveTo(raceState.finishX, laneH * 0.5); c.lineTo(raceState.finishX, laneH * 5); c.stroke();
    c.setLineDash([]);
  }
}

// ==================== Seasonal Decorations ====================
// ==================== Feature 10: Seasonal Decorations ====================
function getSeasonTheme() {
  const month = new Date().getMonth(); // 0-indexed
  if (month === 9) return 'halloween'; // October
  if (month === 11) return 'christmas'; // December
  if (month === 0 || month === 1) return 'lunar_new_year'; // Jan-Feb
  return 'default'; // fallback to halloween aesthetic
}

function drawChristmasHat(ctx, cx, cy, scale, frame) {
  const s = scale;
  ctx.save(); ctx.translate(cx, cy);
  ctx.fillStyle = '#dc2626';
  ctx.beginPath(); ctx.moveTo(-9 * s, 0); ctx.lineTo(3 * s, -16 * s); ctx.lineTo(9 * s, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(-9 * s, -1 * s, 18 * s, 3 * s);
  ctx.beginPath(); ctx.arc(3 * s, -16 * s, 3 * s, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawSeasonalDecorations() {
  const theme = getSeasonTheme();
  const c = officeCtx;
  if (theme === 'christmas') {
    // Christmas tree in bottom-right corner (replace pumpkin position)
    const treeX = officeW * 0.9, treeY = officeH * 0.73;
    // Tree layers
    c.fillStyle = '#166534';
    c.beginPath(); c.moveTo(treeX, treeY - 25); c.lineTo(treeX - 12, treeY - 8); c.lineTo(treeX + 12, treeY - 8); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(treeX, treeY - 18); c.lineTo(treeX - 14, treeY); c.lineTo(treeX + 14, treeY); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(treeX, treeY - 10); c.lineTo(treeX - 16, treeY + 8); c.lineTo(treeX + 16, treeY + 8); c.closePath(); c.fill();
    // Trunk
    c.fillStyle = '#92400e'; c.fillRect(treeX - 3, treeY + 8, 6, 6);
    // Star on top
    c.fillStyle = '#fbbf24';
    const starPulse = 1 + Math.sin((officeFrame || 0) * 0.1) * 0.2;
    c.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i * 4 * Math.PI / 5) - Math.PI / 2;
      const r = (i % 2 === 0) ? 4 * starPulse : 1.5 * starPulse;
      c.lineTo(treeX + Math.cos(a) * r, treeY - 25 + Math.sin(a) * r);
    }
    c.closePath(); c.fill();
    // Ornaments (blinking)
    const ornColors = ['#ef4444', '#3b82f6', '#fbbf24', '#10b981', '#ec4899'];
    const ornPos = [
      { x: treeX - 5, y: treeY - 12 }, { x: treeX + 6, y: treeY - 10 },
      { x: treeX - 8, y: treeY - 2 }, { x: treeX + 3, y: treeY + 2 },
      { x: treeX + 10, y: treeY }, { x: treeX - 3, y: treeY + 5 },
    ];
    ornPos.forEach((o, oi) => {
      const blink = 0.6 + Math.sin((officeFrame || 0) * 0.08 + oi * 2) * 0.4;
      c.globalAlpha = blink;
      c.fillStyle = ornColors[oi % ornColors.length];
      c.beginPath(); c.arc(o.x, o.y, 2, 0, Math.PI * 2); c.fill();
    });
    c.globalAlpha = 1;
  } else if (theme === 'lunar_new_year') {
    // Red lanterns near windows
    const lanternPos = [
      { x: officeW * 0.25, y: officeH * 0.06 },
      { x: officeW * 0.73, y: officeH * 0.06 },
    ];
    lanternPos.forEach(lp => {
      // String
      c.strokeStyle = '#fbbf24'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(lp.x, 0); c.lineTo(lp.x, lp.y - 6); c.stroke();
      // Lantern body
      c.fillStyle = '#dc2626';
      c.beginPath(); c.ellipse(lp.x, lp.y, 8, 10, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ef4444';
      c.beginPath(); c.ellipse(lp.x, lp.y, 5, 8, 0, 0, Math.PI * 2); c.fill();
      // Top/bottom caps
      c.fillStyle = '#fbbf24';
      c.fillRect(lp.x - 4, lp.y - 10, 8, 2);
      c.fillRect(lp.x - 4, lp.y + 8, 8, 2);
      // Tassel
      c.strokeStyle = '#fbbf24'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(lp.x, lp.y + 10); c.lineTo(lp.x, lp.y + 16); c.stroke();
      c.beginPath(); c.moveTo(lp.x - 2, lp.y + 16); c.lineTo(lp.x + 2, lp.y + 16); c.stroke();
      // Character (simplified)
      c.fillStyle = '#fbbf24'; c.font = 'bold 6px sans-serif'; c.textAlign = 'center';
      c.fillText('\u798F', lp.x, lp.y + 2);
    });
    // Spring couplet at door area
    const coupletX = officeW * 0.5;
    const coupletY = officeH * 0.92;
    c.fillStyle = '#dc2626';
    c.fillRect(coupletX - 6, coupletY - 14, 12, 18);
    c.fillStyle = '#fbbf24'; c.font = 'bold 5px sans-serif'; c.textAlign = 'center';
    c.fillText('\u6625', coupletX, coupletY - 4);
  }
}

function getSeasonalFlagColors() {
  const theme = getSeasonTheme();
  if (theme === 'christmas') return ['#dc2626', '#166534', '#dc2626', '#166534', '#fbbf24', '#dc2626', '#166534', '#fbbf24', '#dc2626', '#166534', '#dc2626', '#166534'];
  if (theme === 'lunar_new_year') return ['#dc2626', '#fbbf24', '#dc2626', '#fbbf24', '#dc2626', '#fbbf24', '#dc2626', '#fbbf24', '#dc2626', '#fbbf24', '#dc2626', '#fbbf24'];
  return null; // use default
}

// ==================== Module Exports ====================
GT.office.toggleView = toggleView;
GT.office.init = function() {
  // Office initializes lazily when toggleView is first called
};

// ==================== Global Aliases ====================
window.toggleView = toggleView;
window.startRace = startRace;
window.ghostCellClick = function(idx) { if (GT.ghostCells) GT.ghostCells.ghostCellClick(idx); };
