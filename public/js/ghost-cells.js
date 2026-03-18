'use strict';

// ==================== Ghost Cells Module ====================
// Renders mini pixel ghosts in header cells with canvas.
// Depends on: constants.js (GT namespace, GHOST_COLORS, termStates, prevTermStates,
//             ghostCurrentPos, ANIM, idleStartTimes, lastOutputFrames)

GT.ghostCells = (function() {

  // ==================== Local State ====================
  const gcCanvases = [null, null, null, null];
  const gcCtxs = [null, null, null, null];
  let gcAnimId = null;
  let gcFrame = 0;

  // Celebration system
  const celebrationParticles = [];
  const celebrationState = { 1: null, 2: null, 3: null, 4: null };

  // Idle interaction system
  let idleInteractionTimer = 0;
  let activeIdleInteraction = null;

  // Ghost emote system
  const ghostEmote = {
    0: { type: null, frame: 0, duration: 0 },
    1: { type: null, frame: 0, duration: 0 },
    2: { type: null, frame: 0, duration: 0 },
    3: { type: null, frame: 0, duration: 0 },
  };

  // Mood system
  const busyStartTimes = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const moodIdleStartTimes = { 1: 0, 2: 0, 3: 0, 4: 0 };

  // Output detection
  const lastRealOutputTimes = {};
  const outputByteCounts = {};
  // Ghost cell lerp positions (smooth transitions in small cells)
  const gcGhostPos = {};

  // Mini terminal lines (used by office too)
  const termLines = {
    1: ['$ claude --dangerously-skip', '> Waiting for input...'],
    2: ['$ npm start', '> Server running on :3777'],
  };
  const MAX_MINI_LINES = 6;

  // Output pattern matching
  // Match real shell prompts only (not random > in output)
  const promptPattern = /(?:^|\n)\s*(?:PS [A-Z]:\\[^>]*>|[$❯%#]\s*)$/;
  const errorPattern = /error|Error|FAIL|ECONNREFUSED|ENOENT|panic/;

  // ==================== Feature 8: Ghost Wardrobe ====================
  const WARDROBE_ITEMS = {
    0: [
      { id: 'wizard', label: 'Wizard', draw: 'drawWizardHat' },
      { id: 'cowboy', label: 'Cowboy', draw: 'drawCowboyHat' },
      { id: 'crown', label: 'Crown', draw: 'drawCrown' },
    ],
    1: [
      { id: 'hardhat', label: 'Safety', draw: 'drawHardHat' },
      { id: 'chef', label: 'Chef', draw: 'drawChefHat' },
      { id: 'gradcap', label: 'Grad', draw: 'drawGradCap' },
    ],
    2: [
      { id: 'headphones', label: 'Music', draw: 'drawHeadphones' },
      { id: 'sunglasses', label: 'Shades', draw: 'drawSunglasses' },
      { id: 'bunnyears', label: 'Bunny', draw: 'drawBunnyEars' },
    ],
    3: [
      { id: 'scarf', label: 'Scarf', draw: 'drawScarf' },
      { id: 'cape', label: 'Cape', draw: 'drawCape' },
      { id: 'bowtie', label: 'Bow', draw: 'drawBowTie' },
    ],
  };
  let ghostAccessoryChoice = { 0: 0, 1: 0, 2: 0, 3: 0 };
  let wardrobeOpen = false;

  function loadWardrobe() {
    try {
      const saved = localStorage.getItem('ghostterm_wardrobe');
      if (saved) ghostAccessoryChoice = JSON.parse(saved);
    } catch (e) { /* ignore */ }
  }
  function saveWardrobe() {
    try { localStorage.setItem('ghostterm_wardrobe', JSON.stringify(ghostAccessoryChoice)); } catch (e) { /* ignore */ }
  }
  loadWardrobe();

  // ==================== Accessory Drawing Functions ====================

  // Ghost 0 (purple): Wizard hat with star
  function drawWizardHat(ctx, cx, cy, scale, frame) {
    const s = scale;
    const wobble = Math.sin(frame * ANIM.HAT_WOBBLE_SPEED) * ANIM.HAT_WOBBLE_AMP;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(wobble);
    // Hat brim
    ctx.fillStyle = '#4c1d95';
    ctx.beginPath();
    ctx.ellipse(0, 0, 10 * s, 3 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // Hat cone
    ctx.fillStyle = '#5b21b6';
    ctx.beginPath();
    ctx.moveTo(-8 * s, 0);
    ctx.lineTo(2 * s, -18 * s);
    ctx.lineTo(8 * s, 0);
    ctx.closePath();
    ctx.fill();
    // Hat band
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(-8 * s, -2 * s, 16 * s, 2.5 * s);
    // Star on hat tip
    const starX = 2 * s, starY = -18 * s;
    const starSize = 3 * s;
    const starPulse = 1 + Math.sin(frame * 0.1) * 0.2;
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i * 4 * Math.PI / 5) - Math.PI / 2;
      const r = (i % 2 === 0) ? starSize * starPulse : starSize * 0.4 * starPulse;
      ctx.lineTo(starX + Math.cos(a) * r, starY + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Ghost 1 (cyan): Engineer hard hat (yellow)
  function drawHardHat(ctx, cx, cy, scale, frame) {
    const s = scale;
    const wobble = Math.sin(frame * ANIM.HAT_WOBBLE_SPEED + 1) * ANIM.HAT_WOBBLE_AMP * 0.5;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(wobble);
    // Hat dome
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(0, -2 * s, 9 * s, Math.PI, 0);
    ctx.fill();
    // Hat brim
    ctx.fillStyle = '#eab308';
    ctx.fillRect(-11 * s, -2 * s, 22 * s, 3 * s);
    // Hat ridge on top
    ctx.fillStyle = '#fde047';
    ctx.fillRect(-2 * s, -10 * s, 4 * s, 3 * s);
    ctx.restore();
  }

  // Ghost 2 (green): Headphones
  function drawHeadphones(ctx, cx, cy, scale, frame) {
    const s = scale;
    const beatL = Math.sin(frame * 0.12) * 1.5 * s;
    const beatR = Math.sin(frame * 0.12 + 0.5) * 1.5 * s;
    // Headband arc
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 2.5 * s;
    ctx.beginPath();
    ctx.arc(cx, cy - 2 * s, 10 * s, Math.PI + 0.3, -0.3);
    ctx.stroke();
    // Left ear cup
    ctx.fillStyle = '#1f2937';
    ctx.beginPath();
    ctx.ellipse(cx - 10 * s, cy + 1 * s + beatL, 4 * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4b5563';
    ctx.beginPath();
    ctx.ellipse(cx - 10 * s, cy + 1 * s + beatL, 2.5 * s, 3.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // Right ear cup
    ctx.fillStyle = '#1f2937';
    ctx.beginPath();
    ctx.ellipse(cx + 10 * s, cy + 1 * s + beatR, 4 * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4b5563';
    ctx.beginPath();
    ctx.ellipse(cx + 10 * s, cy + 1 * s + beatR, 2.5 * s, 3.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ghost 3 (orange): Scarf
  function drawScarf(ctx, cx, cy, scale, frame, ghostIdx) {
    const s = scale;
    const wave1 = Math.sin(frame * ANIM.SCARF_WAVE_SPEED + ghostIdx) * ANIM.SCARF_WAVE_AMP * s;
    const wave2 = Math.sin(frame * ANIM.SCARF_WAVE_SPEED * 1.3 + ghostIdx + 1) * ANIM.SCARF_WAVE_AMP * s * 0.7;
    // Scarf wrap around neck
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 8 * s, 12 * s, 4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // Dangling end 1
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.moveTo(cx + 6 * s, cy + 10 * s);
    ctx.quadraticCurveTo(cx + 8 * s + wave1, cy + 18 * s, cx + 5 * s + wave1 * 1.2, cy + 24 * s);
    ctx.lineTo(cx + 1 * s + wave1 * 1.2, cy + 23 * s);
    ctx.quadraticCurveTo(cx + 4 * s + wave2, cy + 17 * s, cx + 3 * s, cy + 10 * s);
    ctx.closePath();
    ctx.fill();
    // Dangling end 2 (shorter)
    ctx.fillStyle = '#b91c1c';
    ctx.beginPath();
    ctx.moveTo(cx + 8 * s, cy + 9 * s);
    ctx.quadraticCurveTo(cx + 11 * s + wave2, cy + 15 * s, cx + 9 * s + wave2, cy + 19 * s);
    ctx.lineTo(cx + 6 * s + wave2, cy + 18 * s);
    ctx.quadraticCurveTo(cx + 8 * s + wave1 * 0.5, cy + 14 * s, cx + 6 * s, cy + 9 * s);
    ctx.closePath();
    ctx.fill();
    // Stripes on scarf end
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 0.8 * s;
    ctx.beginPath();
    ctx.moveTo(cx + 3 * s + wave1 * 0.8, cy + 20 * s);
    ctx.lineTo(cx + 5 * s + wave1 * 0.8, cy + 20 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 3.5 * s + wave1 * 1.0, cy + 22 * s);
    ctx.lineTo(cx + 5.5 * s + wave1 * 1.0, cy + 22 * s);
    ctx.stroke();
  }

  // Draw accessory based on ghost index (default)
  function drawGhostAccessory(ctx, cx, cy, scale, frame, ghostIdx) {
    switch (ghostIdx) {
      case 0: drawWizardHat(ctx, cx, cy, scale, frame); break;
      case 1: drawHardHat(ctx, cx, cy, scale, frame); break;
      case 2: drawHeadphones(ctx, cx, cy, scale, frame); break;
      case 3: drawScarf(ctx, cx, cy, scale, frame, ghostIdx); break;
    }
  }

  // Draw small accessory for ghost cell header (simplified, smaller)
  function drawGhostAccessorySmall(ctx, cx, cy, scale, frame, ghostIdx) {
    const s = scale * 0.75;
    switch (ghostIdx) {
      case 0: // Wizard hat tiny
        ctx.fillStyle = '#5b21b6';
        ctx.beginPath();
        ctx.moveTo(cx - 5 * s, cy);
        ctx.lineTo(cx + 1 * s, cy - 10 * s);
        ctx.lineTo(cx + 5 * s, cy);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(cx - 5 * s, cy - 1 * s, 10 * s, 1.5 * s);
        // Tiny star
        ctx.beginPath();
        ctx.arc(cx + 1 * s, cy - 10 * s, 1.5 * s, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 1: // Hard hat tiny
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(cx, cy - 1 * s, 6 * s, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#eab308';
        ctx.fillRect(cx - 7 * s, cy - 1 * s, 14 * s, 2 * s);
        break;
      case 2: // Headphones tiny
        ctx.strokeStyle = '#374151';
        ctx.lineWidth = 1.5 * s;
        ctx.beginPath();
        ctx.arc(cx, cy - 1 * s, 7 * s, Math.PI + 0.3, -0.3);
        ctx.stroke();
        ctx.fillStyle = '#1f2937';
        ctx.beginPath(); ctx.arc(cx - 7 * s, cy + 1 * s, 2.5 * s, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 7 * s, cy + 1 * s, 2.5 * s, 0, Math.PI * 2); ctx.fill();
        break;
      case 3: // Scarf tiny
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.ellipse(cx, cy + 5 * s, 7 * s, 2.5 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        const tw = Math.sin(frame * 0.05) * 1.5 * s;
        ctx.fillRect(cx + 3 * s, cy + 6 * s, 3 * s, 8 * s + tw);
        break;
    }
  }

  // New wardrobe accessory drawing functions
  function drawCowboyHat(ctx, cx, cy, scale, frame) {
    const s = scale;
    const wobble = Math.sin(frame * ANIM.HAT_WOBBLE_SPEED + 0.5) * ANIM.HAT_WOBBLE_AMP;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(wobble);
    ctx.fillStyle = '#92400e';
    ctx.beginPath(); ctx.ellipse(0, 2 * s, 14 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#a3541a';
    ctx.beginPath(); ctx.moveTo(-7 * s, 2 * s); ctx.quadraticCurveTo(0, -14 * s, 7 * s, 2 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7a3b0e'; ctx.fillRect(-7 * s, 0, 14 * s, 2 * s);
    ctx.restore();
  }

  function drawCrown(ctx, cx, cy, scale, frame) {
    const s = scale;
    const pulse = 1 + Math.sin(frame * 0.08) * 0.05;
    ctx.save(); ctx.translate(cx, cy);
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(-8 * s * pulse, 0);
    ctx.lineTo(-8 * s * pulse, -8 * s * pulse);
    ctx.lineTo(-4 * s * pulse, -4 * s * pulse);
    ctx.lineTo(0, -10 * s * pulse);
    ctx.lineTo(4 * s * pulse, -4 * s * pulse);
    ctx.lineTo(8 * s * pulse, -8 * s * pulse);
    ctx.lineTo(8 * s * pulse, 0);
    ctx.closePath(); ctx.fill();
    // Gems
    ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(0, -3 * s, 1.5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3b82f6'; ctx.beginPath(); ctx.arc(-4 * s, -2 * s, 1 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#10b981'; ctx.beginPath(); ctx.arc(4 * s, -2 * s, 1 * s, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawChefHat(ctx, cx, cy, scale, frame) {
    const s = scale;
    const wobble = Math.sin(frame * ANIM.HAT_WOBBLE_SPEED + 2) * ANIM.HAT_WOBBLE_AMP * 0.3;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(wobble);
    ctx.fillStyle = '#f5f5f4';
    ctx.fillRect(-8 * s, -2 * s, 16 * s, 4 * s);
    ctx.beginPath(); ctx.arc(0, -4 * s, 9 * s, Math.PI, 0); ctx.fill();
    ctx.beginPath(); ctx.arc(-3 * s, -10 * s, 5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(3 * s, -9 * s, 5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -12 * s, 4 * s, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawGradCap(ctx, cx, cy, scale, frame) {
    const s = scale;
    const wobble = Math.sin(frame * ANIM.HAT_WOBBLE_SPEED + 3) * ANIM.HAT_WOBBLE_AMP * 0.5;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(wobble);
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(-12 * s, 0); ctx.lineTo(0, -4 * s); ctx.lineTo(12 * s, 0); ctx.lineTo(0, 2 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#334155';
    ctx.fillRect(-6 * s, 0, 12 * s, 4 * s);
    // Tassel
    const tasselSwing = Math.sin(frame * 0.06) * 3 * s;
    ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.5 * s;
    ctx.beginPath(); ctx.moveTo(0, -2 * s); ctx.lineTo(10 * s + tasselSwing, 4 * s); ctx.stroke();
    ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(10 * s + tasselSwing, 5 * s, 2 * s, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawSunglasses(ctx, cx, cy, scale, frame) {
    const s = scale;
    ctx.save(); ctx.translate(cx, cy);
    // Bridge
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1.5 * s;
    ctx.beginPath(); ctx.moveTo(-3 * s, 0); ctx.lineTo(3 * s, 0); ctx.stroke();
    // Lenses
    ctx.fillStyle = '#1e293b';
    ctx.beginPath(); ctx.ellipse(-6 * s, 0, 5 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(6 * s, 0, 5 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill();
    // Shine
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath(); ctx.ellipse(-7 * s, -1 * s, 2 * s, 1.5 * s, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(5 * s, -1 * s, 2 * s, 1.5 * s, -0.3, 0, Math.PI * 2); ctx.fill();
    // Arms
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1 * s;
    ctx.beginPath(); ctx.moveTo(-11 * s, 0); ctx.lineTo(-13 * s, 3 * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(11 * s, 0); ctx.lineTo(13 * s, 3 * s); ctx.stroke();
    ctx.restore();
  }

  function drawBunnyEars(ctx, cx, cy, scale, frame) {
    const s = scale;
    const bounce = Math.sin(frame * 0.06) * 2 * s;
    ctx.save(); ctx.translate(cx, cy);
    // Band
    ctx.fillStyle = '#ec4899'; ctx.fillRect(-8 * s, -1 * s, 16 * s, 2 * s);
    // Left ear
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(-6 * s, -12 * s + bounce, 3 * s, 10 * s, -0.15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fca5a5';
    ctx.beginPath(); ctx.ellipse(-6 * s, -11 * s + bounce, 1.5 * s, 7 * s, -0.15, 0, Math.PI * 2); ctx.fill();
    // Right ear
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(6 * s, -12 * s - bounce, 3 * s, 10 * s, 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fca5a5';
    ctx.beginPath(); ctx.ellipse(6 * s, -11 * s - bounce, 1.5 * s, 7 * s, 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawCape(ctx, cx, cy, scale, frame, ghostIdx) {
    const s = scale;
    const wave = Math.sin(frame * 0.05 + (ghostIdx || 0)) * 3 * s;
    ctx.save(); ctx.translate(cx, cy);
    ctx.fillStyle = '#7c3aed';
    ctx.beginPath();
    ctx.moveTo(-10 * s, 0);
    ctx.quadraticCurveTo(-12 * s + wave, 15 * s, -8 * s + wave * 1.2, 25 * s);
    ctx.lineTo(8 * s + wave * 1.2, 25 * s);
    ctx.quadraticCurveTo(12 * s + wave, 15 * s, 10 * s, 0);
    ctx.closePath(); ctx.fill();
    // Inner lining
    ctx.fillStyle = '#a78bfa';
    ctx.beginPath();
    ctx.moveTo(-8 * s, 2 * s);
    ctx.quadraticCurveTo(-9 * s + wave, 14 * s, -6 * s + wave, 23 * s);
    ctx.lineTo(6 * s + wave, 23 * s);
    ctx.quadraticCurveTo(9 * s + wave, 14 * s, 8 * s, 2 * s);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawBowTie(ctx, cx, cy, scale, frame, ghostIdx) {
    const s = scale;
    const pulse = 1 + Math.sin(frame * 0.1 + (ghostIdx || 0)) * 0.1;
    ctx.save(); ctx.translate(cx, cy + 8 * s);
    ctx.fillStyle = '#ec4899';
    // Left wing
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-8 * s * pulse, -4 * s, -10 * s * pulse, 0);
    ctx.quadraticCurveTo(-8 * s * pulse, 4 * s, 0, 0); ctx.fill();
    // Right wing
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(8 * s * pulse, -4 * s, 10 * s * pulse, 0);
    ctx.quadraticCurveTo(8 * s * pulse, 4 * s, 0, 0); ctx.fill();
    // Center knot
    ctx.fillStyle = '#be185d';
    ctx.beginPath(); ctx.arc(0, 0, 2 * s, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Feature 10: Christmas hat
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

  // Override accessory draw based on wardrobe choice
  function drawGhostAccessoryWardrobe(ctx, cx, cy, scale, frame, ghostIdx) {
    const month = new Date().getMonth();
    // Feature 10: Christmas hat override in December
    if (month === 11) {
      drawChristmasHat(ctx, cx, cy, scale, frame);
      return;
    }
    const choice = ghostAccessoryChoice[ghostIdx] || 0;
    const items = WARDROBE_ITEMS[ghostIdx];
    if (!items || !items[choice]) { drawGhostAccessory(ctx, cx, cy, scale, frame, ghostIdx); return; }
    const item = items[choice];
    switch (item.id) {
      case 'wizard': drawWizardHat(ctx, cx, cy, scale, frame); break;
      case 'cowboy': drawCowboyHat(ctx, cx, cy, scale, frame); break;
      case 'crown': drawCrown(ctx, cx, cy, scale, frame); break;
      case 'hardhat': drawHardHat(ctx, cx, cy, scale, frame); break;
      case 'chef': drawChefHat(ctx, cx, cy, scale, frame); break;
      case 'gradcap': drawGradCap(ctx, cx, cy, scale, frame); break;
      case 'headphones': drawHeadphones(ctx, cx, cy, scale, frame); break;
      case 'sunglasses': drawSunglasses(ctx, cx, cy, scale, frame); break;
      case 'bunnyears': drawBunnyEars(ctx, cx, cy, scale, frame); break;
      case 'scarf': drawScarf(ctx, cx, cy, scale, frame, ghostIdx); break;
      case 'cape': drawCape(ctx, cx, cy, scale, frame, ghostIdx); break;
      case 'bowtie': drawBowTie(ctx, cx, cy, scale, frame, ghostIdx); break;
      default: drawGhostAccessory(ctx, cx, cy, scale, frame, ghostIdx); break;
    }
  }

  function drawGhostAccessorySmallWardrobe(ctx, cx, cy, scale, frame, ghostIdx) {
    const month = new Date().getMonth();
    if (month === 11) {
      // Tiny christmas hat
      ctx.fillStyle = '#dc2626';
      ctx.beginPath(); ctx.moveTo(cx - 5, cy); ctx.lineTo(cx + 1, cy - 8); ctx.lineTo(cx + 5, cy); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx + 1, cy - 8, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(cx - 5, cy - 1, 10, 2);
      return;
    }
    drawGhostAccessorySmall(ctx, cx, cy, scale, frame, ghostIdx);
  }

  // ==================== Keyboard Drawing ====================
  function drawKeyboard(ctx, x, y, w, h, frame, isBusy) {
    // Keyboard base
    ctx.fillStyle = '#374151';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#4b5563';
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    // Keys grid (3 rows x 5 keys)
    const keyW = (w - 4) / 5;
    const keyH = (h - 3) / 3;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 5; col++) {
        const kx = x + 2 + col * keyW;
        const ky = y + 1.5 + row * keyH;
        let pressed = false;
        if (isBusy) {
          const keyIdx = row * 5 + col;
          pressed = Math.sin(frame * ANIM.KEY_PRESS_SPEED + keyIdx * 0.7) > 0.7;
        }
        ctx.fillStyle = pressed ? '#6b7280' : '#9ca3af';
        ctx.fillRect(kx + 0.3, ky + 0.3, keyW - 0.6, keyH - 0.6);
      }
    }
  }

  // ==================== Mood System ====================
  function getMoodState(ghostIdx) {
    const tIdx = ghostIdx + 1;
    const state = termStates[tIdx];
    if (state === 'busy') {
      if (!busyStartTimes[tIdx]) busyStartTimes[tIdx] = (GT.state.officeFrame || gcFrame);
      const elapsed = (GT.state.officeFrame || gcFrame) - busyStartTimes[tIdx];
      if (elapsed > ANIM.MOOD_TIRED_THRESHOLD) return 'exhausted';
      if (elapsed > ANIM.MOOD_SWEAT_THRESHOLD) return 'sweating';
    } else {
      busyStartTimes[tIdx] = 0;
    }
    if (state === 'idle') {
      if (!moodIdleStartTimes[tIdx]) moodIdleStartTimes[tIdx] = (GT.state.officeFrame || gcFrame);
      const elapsed = (GT.state.officeFrame || gcFrame) - moodIdleStartTimes[tIdx];
      if (elapsed > ANIM.MOOD_HAPPY_THRESHOLD) return 'dancing';
    } else {
      moodIdleStartTimes[tIdx] = 0;
    }
    if (state === 'error') return 'angry';
    return 'normal';
  }

  // ==================== Ghost Walking (Lerp) ====================
  function lerpGhostPos(idx, targetX, targetY) {
    const pos = ghostCurrentPos[idx];
    if (!pos.initialized) {
      pos.x = targetX;
      pos.y = targetY;
      pos.initialized = true;
      return { x: targetX, y: targetY, moving: false };
    }
    const dx = targetX - pos.x;
    const dy = targetY - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) {
      pos.x = targetX;
      pos.y = targetY;
      return { x: targetX, y: targetY, moving: false };
    }
    pos.x += dx * ANIM.LERP_SPEED;
    pos.y += dy * ANIM.LERP_SPEED;
    return { x: pos.x, y: pos.y, moving: true, angle: Math.atan2(dx, 0) * 0.3 };
  }

  // ==================== Day/Night Cycle ====================
  function getDayPhase() {
    const h = new Date().getHours();
    if (h >= 6 && h < 12) return 'morning';
    if (h >= 12 && h < 17) return 'day';
    if (h >= 17 && h < 20) return 'evening';
    return 'night';
  }

  function getDayColors() {
    const phase = getDayPhase();
    switch (phase) {
      case 'morning': return { sky: '#87CEEB', wall: '#1a1a3a', floor: '#1e1e38', windowLight: 'rgba(135,206,235,0.3)', starAlpha: 0 };
      case 'day':     return { sky: '#f0f0ff', wall: '#1a1a3a', floor: '#1e1e38', windowLight: 'rgba(255,255,240,0.4)', starAlpha: 0 };
      case 'evening': return { sky: '#ff8c42', wall: '#1a1a30', floor: '#1c1c30', windowLight: 'rgba(255,140,66,0.3)', starAlpha: 0 };
      case 'night':   return { sky: '#0a0a2e', wall: '#0a0a18', floor: '#12122a', windowLight: 'rgba(100,100,200,0.1)', starAlpha: 1 };
    }
  }

  // ==================== Mood Effects Drawing ====================
  function drawMoodEffects(ctx, cx, cy, scale, frame, mood) {
    const s = scale;
    switch (mood) {
      case 'sweating':
        for (let i = 0; i < 2; i++) {
          const dropY = ((frame * 0.8 + i * 20) % 40) * s;
          const dropX = cx + (i === 0 ? -8 : 10) * s;
          ctx.fillStyle = '#60a5fa';
          ctx.globalAlpha = 0.6 - dropY / (40 * s) * 0.6;
          ctx.beginPath();
          ctx.moveTo(dropX, cy - 12 * s + dropY);
          ctx.quadraticCurveTo(dropX + 2 * s, cy - 8 * s + dropY, dropX, cy - 6 * s + dropY);
          ctx.quadraticCurveTo(dropX - 2 * s, cy - 8 * s + dropY, dropX, cy - 12 * s + dropY);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        break;
      case 'exhausted':
        for (let i = 0; i < 3; i++) {
          const dropY = ((frame * 0.8 + i * 15) % 40) * s;
          const dropX = cx + [-10, 0, 10][i] * s;
          ctx.fillStyle = '#60a5fa';
          ctx.globalAlpha = 0.5 - dropY / (40 * s) * 0.5;
          ctx.beginPath();
          ctx.arc(dropX, cy - 14 * s + dropY, 1.5 * s, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        // Steam wisps
        ctx.strokeStyle = 'rgba(148,163,184,0.3)';
        ctx.lineWidth = 1 * s;
        for (let i = 0; i < 2; i++) {
          const sx = cx + (i === 0 ? -5 : 5) * s;
          const steamY = ((frame * 0.5 + i * 30) % 30) * s;
          ctx.beginPath();
          ctx.moveTo(sx, cy - 16 * s - steamY);
          ctx.quadraticCurveTo(sx + Math.sin(frame * 0.1 + i) * 3 * s, cy - 20 * s - steamY, sx, cy - 24 * s - steamY);
          ctx.stroke();
        }
        break;
      case 'angry':
        ctx.globalAlpha = 0.15 + Math.sin(frame * 0.2) * 0.1;
        ctx.fillStyle = '#ef4444';
        ctx.beginPath(); ctx.arc(cx, cy, 20 * s, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        // Smoke puffs
        for (let i = 0; i < 3; i++) {
          const smokeY = ((frame * 0.3 + i * 20) % 40) * s;
          const smokeX = cx + Math.sin(frame * 0.05 + i * 2) * 5 * s;
          ctx.globalAlpha = 0.3 - smokeY / (40 * s) * 0.3;
          ctx.fillStyle = '#6b7280';
          ctx.beginPath(); ctx.arc(smokeX, cy - 18 * s - smokeY, (2 + i) * s, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
        break;
      case 'dancing':
        ctx.fillStyle = '#f59e0b';
        ctx.textAlign = 'center';
        for (let i = 0; i < 3; i++) {
          const noteY = ((frame * 0.4 + i * 25) % 50) * s;
          const noteX = cx + Math.sin(frame * 0.08 + i * 2) * 10 * s;
          ctx.globalAlpha = 0.5 - noteY / (50 * s) * 0.5;
          ctx.font = `${6 * s}px sans-serif`;
          ctx.fillText(['\u266A', '\u266B', '\u2669'][i], noteX, cy - 20 * s - noteY);
          ctx.globalAlpha = 1;
        }
        break;
    }
  }

  // ==================== Celebration System ====================
  function triggerCelebration(ghostIdx) {
    const count = ANIM.CELEBRATE_PARTICLE_COUNT;
    const sessionList = GT.state.sessionList;
    const sid = sessionList[ghostIdx]?.id;
    const color = GHOST_COLORS[sid ? GT.getColorSlot(sid) : ghostIdx] || GHOST_COLORS[ghostIdx];
    for (let i = 0; i < count; i++) {
      celebrationParticles.push({
        ghostIdx: ghostIdx,
        x: 0, y: 0,
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
      p.vy += 0.08;
      p.rot += p.rotSpeed;
      p.life--;
      if (p.life <= 0) celebrationParticles.splice(i, 1);
    }
    for (let idx = 1; idx <= 4; idx++) {
      if (celebrationState[idx]) {
        celebrationState[idx].frame++;
        if (celebrationState[idx].frame > celebrationState[idx].duration) {
          celebrationState[idx] = null;
        }
      }
    }
  }

  // ==================== Idle Interaction System ====================
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

    const sessionList = GT.state.sessionList;
    const idleGhosts = [];
    for (let i = 0; i < 4; i++) {
      if (i < sessionList.length && !sessionList[i]?.exited && termStates[i + 1] === 'idle') {
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

  // ==================== Ghost Emote System ====================
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
        if (e.frame > e.duration) {
          e.type = null;
          e.frame = 0;
        }
      }
    }
  }

  // ==================== Ghost Cell Canvas Init ====================
  function initGhostCanvas(i) {
    const cell = document.getElementById('gcell-' + i);
    if (!cell) return;
    cell.classList.remove('empty');
    // Safe DOM construction for canvas element
    const canvas = document.createElement('canvas');
    canvas.id = 'gc-' + i;
    cell.textContent = '';
    cell.appendChild(canvas);
    const dpr = window.devicePixelRatio || 2;
    const rect = cell.getBoundingClientRect();
    const cw = Math.round(rect.width - 4);
    const ch = Math.round(rect.height - 4);
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    gcCanvases[i] = canvas;
    gcCtxs[i] = ctx;
    canvas._logicW = cw;
    canvas._logicH = ch;
  }

  // ==================== Draw Ghost Cell ====================
  function drawGhostCell(idx) {
    const ctx = gcCtxs[idx];
    if (!ctx || !gcCanvases[idx]) return;
    const w = gcCanvases[idx]._logicW || 52;
    const h = gcCanvases[idx]._logicH || 52;
    const state = termStates[idx + 1] || 'idle';
    const sessionList = GT.state.sessionList;
    const sessionId = sessionList[idx]?.id;
    const slot = sessionId ? GT.getColorSlot(sessionId) : idx;
    const color = GHOST_COLORS[slot];
    const mood = getMoodState(idx);

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#0f0f1a';
    ctx.fillRect(0, 0, w, h);

    // === Pumpkin sofa (top-center) ===
    const sofaY = 11;
    ctx.fillStyle = '#c2410c';
    ctx.beginPath(); ctx.ellipse(w / 2, sofaY, 16, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#9a3412'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(w / 2, sofaY - 6); ctx.lineTo(w / 2, sofaY + 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w / 2 - 6, sofaY - 5); ctx.quadraticCurveTo(w / 2 - 6, sofaY, w / 2 - 6, sofaY + 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w / 2 + 6, sofaY - 5); ctx.quadraticCurveTo(w / 2 + 6, sofaY, w / 2 + 6, sofaY + 5); ctx.stroke();
    ctx.fillStyle = '#65a30d';
    ctx.fillRect(w / 2 - 1, sofaY - 8, 2, 3);
    ctx.beginPath(); ctx.ellipse(w / 2 + 2, sofaY - 7, 2.5, 1.2, 0.3, 0, Math.PI * 2); ctx.fill();

    // === Desk + Monitor (bottom-right) ===
    const deskX = 30, deskY = 44;
    ctx.fillStyle = '#7a5230'; ctx.fillRect(deskX, deskY, 18, 3);
    ctx.fillStyle = '#5c3d1e'; ctx.fillRect(deskX + 2, deskY + 3, 2, 5);
    ctx.fillRect(deskX + 14, deskY + 3, 2, 5);
    if (state === 'busy') {
      drawKeyboard(ctx, deskX + 1, deskY - 2, 10, 3, gcFrame, true);
    }
    const monX = deskX + 3, monY = deskY - 9;
    ctx.fillStyle = '#334155'; ctx.fillRect(monX, monY, 12, 8);
    ctx.fillStyle = state === 'busy' ? '#10b981' : (state === 'error' ? '#ef4444' : '#0a0a15');
    ctx.fillRect(monX + 1, monY + 1, 10, 6);
    ctx.fillStyle = '#475569'; ctx.fillRect(monX + 4, monY + 8, 4, 1);
    if (state === 'busy') {
      ctx.fillStyle = '#10b981';
      ctx.font = '3px monospace';
      ctx.textAlign = 'left';
      const chars = '{}[]<>=;:./|@#';
      for (let row = 0; row < 3; row++) {
        let line = '';
        for (let j = 0; j < 4; j++) line += chars[Math.floor(Math.random() * chars.length)];
        if (gcFrame % 3 === 0) ctx.fillText(line, monX + 2, monY + 3 + row * 2);
      }
      if (Math.sin(gcFrame * 0.15) > 0) {
        ctx.fillRect(monX + 2, monY + 5, 2, 1);
      }
    }

    // === Ghost ===
    const floatOffset = Math.sin(gcFrame * 0.06 + idx) * 1.5;
    const isWorking = state === 'busy' || state === 'error' || state === 'waiting';

    // Celebration jump offset
    let jumpOffset = 0;
    const celeb = celebrationState[idx + 1];
    if (celeb) {
      const progress = celeb.frame / celeb.duration;
      jumpOffset = -Math.sin(progress * Math.PI) * 8;
    }

    // Target position based on state
    let targetGX, targetGY;
    if (state === 'busy') {
      targetGX = 14; targetGY = 42 + floatOffset + jumpOffset;
    } else if (state === 'waiting') {
      targetGX = 18; targetGY = 34 + floatOffset + jumpOffset;
    } else if (state === 'error') {
      targetGX = 14; targetGY = 40 + Math.sin(gcFrame * 0.2) * 2 + jumpOffset;
    } else {
      const danceSway = mood === 'dancing' ? Math.sin(gcFrame * 0.15) * 3 : 0;
      targetGX = w / 2 + danceSway; targetGY = 12 + floatOffset + jumpOffset;
    }

    // Smooth lerp for ghost cell position (avoid teleporting)
    if (!gcGhostPos[idx]) gcGhostPos[idx] = { x: targetGX, y: targetGY };
    gcGhostPos[idx].x += (targetGX - gcGhostPos[idx].x) * 0.08;
    gcGhostPos[idx].y += (targetGY - gcGhostPos[idx].y) * 0.08;
    let ghostX = gcGhostPos[idx].x;
    let ghostY = gcGhostPos[idx].y;

    // Ghost glow when busy
    if (state === 'busy') {
      ctx.globalAlpha = 0.12 + Math.sin(gcFrame * 0.1) * 0.08;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(ghostX, ghostY, 12, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Ghost body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(ghostX, ghostY - 2, 8, Math.PI, 0);
    ctx.lineTo(ghostX + 8, ghostY + 6);
    const wp = gcFrame * 0.1 + idx;
    for (let i = 0; i < 3; i++) {
      const wx = ghostX + 8 - (i + 1) * 5.3;
      const wy = ghostY + 6 + Math.sin(wp + i * 1.5) * 1.5;
      ctx.quadraticCurveTo(wx + 1.3, wy + 1.5, wx - 1.3, wy);
    }
    ctx.lineTo(ghostX - 8, ghostY - 2);
    ctx.closePath();
    ctx.fill();

    // Draw accessory (small version for cell header) - wardrobe-aware
    drawGhostAccessorySmallWardrobe(ctx, ghostX, ghostY - 9, 1, gcFrame, slot);

    // Arms — enhanced typing animation when busy
    if (state === 'busy' || state === 'error') {
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      const leftHandUp = Math.sin(gcFrame * ANIM.TYPING_HAND_SPEED + idx) * ANIM.TYPING_HAND_AMP;
      const rightHandUp = Math.sin(gcFrame * ANIM.TYPING_HAND_SPEED + idx + Math.PI) * ANIM.TYPING_HAND_AMP;
      const armBase = state === 'busy' ? leftHandUp : 0;
      const armBase2 = state === 'busy' ? rightHandUp : 0;
      // Right arm
      ctx.beginPath();
      ctx.moveTo(ghostX + 6, ghostY + 2);
      ctx.quadraticCurveTo(ghostX + 14, ghostY + armBase, monX - 1, monY + 5 + armBase);
      ctx.stroke();
      // Left arm
      ctx.beginPath();
      ctx.moveTo(ghostX + 5, ghostY + 4);
      ctx.quadraticCurveTo(ghostX + 12, ghostY + 6 + armBase2, monX - 1, monY + 8 + armBase2);
      ctx.stroke();
      // Tiny hands
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(monX - 1, monY + 5 + armBase, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(monX - 1, monY + 8 + armBase2, 1.2, 0, Math.PI * 2); ctx.fill();
    }

    // Eyes
    const eyeCx = isWorking ? ghostX + 1 : ghostX;
    if (state === 'idle') {
      const lookingAt = activeIdleInteraction && activeIdleInteraction.type === 'look' && activeIdleInteraction.ghosts.includes(idx);
      if (mood === 'exhausted') {
        ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(eyeCx - 3, ghostY - 0.5, 1.5, 0.2, Math.PI - 0.2); ctx.stroke();
        ctx.beginPath(); ctx.arc(eyeCx + 3, ghostY - 0.5, 1.5, 0.2, Math.PI - 0.2); ctx.stroke();
      } else {
        ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(eyeCx - 3, ghostY - 1, 1.5, 0, Math.PI); ctx.stroke();
        ctx.beginPath(); ctx.arc(eyeCx + 3, ghostY - 1, 1.5, 0, Math.PI); ctx.stroke();
      }
      ctx.fillStyle = '#94a3b8'; ctx.globalAlpha = 0.5 + Math.sin(gcFrame * 0.1) * 0.3;
      ctx.font = 'bold 5px sans-serif'; ctx.textAlign = 'left';
      const zo = Math.sin(gcFrame * 0.08) * 2;
      ctx.fillText('z', ghostX + 8, ghostY - 6 + zo);
      ctx.font = 'bold 7px sans-serif';
      ctx.fillText('Z', ghostX + 11, ghostY - 10 + zo);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(eyeCx - 2, ghostY - 2, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(eyeCx + 3, ghostY - 2, 2.2, 0, Math.PI * 2); ctx.fill();
      const pupOff = isWorking ? 0.8 : 0;
      ctx.fillStyle = '#1e293b';
      ctx.beginPath(); ctx.arc(eyeCx - 2 + pupOff, ghostY - 1.5, 1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(eyeCx + 3 + pupOff, ghostY - 1.5, 1, 0, Math.PI * 2); ctx.fill();
    }

    // State indicators
    if (state === 'error') {
      ctx.fillStyle = '#ef4444'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('!', ghostX, ghostY - 12 + Math.sin(gcFrame * 0.15) * 1);
    }
    if (state === 'waiting') {
      const qBob = Math.sin(gcFrame * 0.08) * 2;
      ctx.save();
      ctx.translate(ghostX + 14, ghostY - 7 + qBob);
      ctx.rotate(Math.PI / 12);
      ctx.fillStyle = '#f59e0b'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('?', 0, 0);
      ctx.restore();
    }

    // Idle interaction indicators
    if (activeIdleInteraction && activeIdleInteraction.ghosts.includes(idx)) {
      const inter = activeIdleInteraction;
      const alpha = Math.min(1, inter.frame / 20) * Math.min(1, (inter.duration - inter.frame) / 20);
      ctx.globalAlpha = alpha;
      if (inter.type === 'chat') {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.ellipse(ghostX - 8, ghostY - 14, 6, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 4px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('...', ghostX - 8, ghostY - 13);
      } else if (inter.type === 'sleep') {
        const syncZo = Math.sin(gcFrame * 0.06) * 2;
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText('z', ghostX + 6, ghostY - 8 + syncZo);
        ctx.font = 'bold 8px sans-serif';
        ctx.fillText('Z', ghostX + 9, ghostY - 12 + syncZo);
      }
      ctx.globalAlpha = 1;
    }

    // Draw celebration particles for this ghost cell
    celebrationParticles.forEach(p => {
      if (p.ghostIdx === idx) {
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(ghostX + p.x, ghostY + p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    });
  }

  // ==================== Update Ghost Cells ====================
  function updateGhostCells() {
    const sessionList = GT.state.sessionList;
    const currentSessionId = GT.state.currentSessionId;
    for (let i = 0; i < 4; i++) {
      const cell = document.getElementById('gcell-' + i);
      if (!cell) continue;
      const hasSession = i < sessionList.length && !sessionList[i].exited;
      if (hasSession) {
        if (!gcCtxs[i]) initGhostCanvas(i);
        if (termStates[i + 1] === 'idle' && !lastRealOutputTimes[i + 1]) {
          termStates[i + 1] = 'waiting';
        }
      } else {
        if (!cell.classList.contains('empty')) {
          cell.classList.add('empty');
          cell.textContent = '+';
          gcCanvases[i] = null;
          gcCtxs[i] = null;
        }
      }
      cell.classList.toggle('active', hasSession && sessionList[i]?.id === currentSessionId);
    }
  }

  // ==================== Ghost Cell Click ====================
  function ghostCellClick(idx) {
    if (typeof vibrate === 'function') vibrate();
    const sessionList = GT.state.sessionList;
    if (idx < sessionList.length && !sessionList[idx].exited) {
      const id = sessionList[idx].id;
      const wasOffice = GT.state.officeActive;
      if (wasOffice && typeof toggleView === 'function') toggleView();
      if (String(id) === String(GT.state.currentSessionId)) {
        // Same session — if we just left office view, that's enough
        if (wasOffice) return;
        return;
      }
      if (typeof saveCurrentSession === 'function') saveCurrentSession();
      GT.state.currentSessionId = id;
      if (GT.terminal && GT.terminal.term) {
        GT.terminal.term.reset();
        if (GT.state.sessionCache[id]) {
          GT.terminal.term.write(GT.state.sessionCache[id]);
        }
      }
      GT.state.autoScroll = true;
      GT.state.socket.emit('attach', id);
    } else if (sessionList.length < 4) {
      if (GT.sessions) GT.sessions.createNewSession();
    }
  }

  // ==================== updateOfficeOutput ====================
  function updateOfficeOutput(data, sessionId) {
    const sessionList = GT.state.sessionList;
    const posIdx = sessionList.findIndex(s => String(s.id) === String(sessionId));
    if (posIdx < 0) return;
    const idx = posIdx + 1;
    if (idx > 4) return;

    const clean = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '').replace(/\r/g, '');
    const visible = clean.replace(/\s/g, '');

    if (visible.length > 0) {
      lastRealOutputTimes[idx] = Date.now();
      outputByteCounts[idx] = (outputByteCounts[idx] || 0) + visible.length;
    }

    if (promptPattern.test(clean)) {
      termStates[idx] = 'waiting';
      outputByteCounts[idx] = 0;
    } else if (errorPattern.test(clean)) {
      termStates[idx] = 'error';
    } else if (visible.length > 0) {
      termStates[idx] = 'busy';
      lastRealOutputTimes[idx] = Date.now();
    } else {
    }

    // Ghost emote triggers
    const gi = idx - 1;
    if (/error|Error|failed|FAIL/i.test(clean)) {
      triggerGhostEmote(gi, 'error_cringe', ANIM.EMOTE_ERROR_DURATION);
    } else if (/success|\u2713|done|passed/i.test(clean)) {
      triggerGhostEmote(gi, 'success_cheer', ANIM.EMOTE_SUCCESS_DURATION);
    } else if (/thinking|\u280B|\u2819|\u2839/.test(clean)) {
      if (!ghostEmote[gi] || ghostEmote[gi].type !== 'thinking') {
        triggerGhostEmote(gi, 'thinking', 99999);
      }
    }
    lastOutputFrames[idx] = (GT.state.officeFrame || gcFrame);

    // Update mini terminal lines
    if (visible.length > 0) {
      const newLines = clean.split('\n').filter(l => l.trim());
      if (newLines.length) {
        if (!termLines[idx]) termLines[idx] = [];
        termLines[idx].push(...newLines);
        if (termLines[idx].length > MAX_MINI_LINES) termLines[idx] = termLines[idx].slice(-MAX_MINI_LINES);
      }
    }
  }

  // ==================== checkIdle ====================
  function checkIdle() {
    const now = Date.now();
    const sessionList = GT.state.sessionList;
    [1, 2, 3, 4].forEach(idx => {
      const elapsed = now - (lastRealOutputTimes[idx] || 0);
      const hasSession = idx <= sessionList.length;
      if (elapsed > 2000) outputByteCounts[idx] = 0;
      if (!hasSession) {
        termStates[idx] = 'idle';
        return;
      }
      if (termStates[idx] === 'busy' && elapsed > 8000) {
        termStates[idx] = 'waiting';
      }
      if (termStates[idx] === 'waiting' && elapsed > 20000) {
        termStates[idx] = 'idle';
      }
      if (termStates[idx] === 'error' && elapsed > 5000) {
        termStates[idx] = 'waiting';
      }
    });
  }

  // ==================== Animation Loop ====================
  function animateGhostCells() {
    gcFrame++;
    if (gcFrame % 30 === 0) checkIdle();

    // Check for state transitions (busy -> idle/waiting = celebration)
    // Cooldown: only celebrate if ghost was busy for at least 5 seconds
    for (let i = 1; i <= 4; i++) {
      if (prevTermStates[i] === 'busy' && (termStates[i] === 'waiting' || termStates[i] === 'idle')) {
        const busyDuration = busyStartTimes[i] ? (gcFrame - busyStartTimes[i]) : 0;
        if (busyDuration > 300) { // ~5 seconds at 60fps
          triggerCelebration(i - 1);
        }
        if (typeof trackBusyEnd === 'function') trackBusyEnd(i - 1);
      }
      prevTermStates[i] = termStates[i];
    }

    updateCelebrationParticles();
    checkIdleInteractions();

    for (let i = 0; i < 4; i++) {
      if (gcCtxs[i]) drawGhostCell(i);
    }
    gcAnimId = requestAnimationFrame(animateGhostCells);
  }

  // Socket events are handled by app.js; ghost-cells just exposes updateGhostCells

  // ==================== Init ====================
  function init() {
    initGhostCanvas(0);
    animateGhostCells();
    // Socket events handled by app.js
  }

  // ==================== Public API ====================
  const api = {
    // Init
    init: init,
    // hookSocketEvents removed — handled by app.js

    // Canvas state
    gcCanvases: gcCanvases,
    gcCtxs: gcCtxs,
    get gcFrame() { return gcFrame; },
    get gcAnimId() { return gcAnimId; },

    // Core functions
    initGhostCanvas: initGhostCanvas,
    drawGhostCell: drawGhostCell,
    updateGhostCells: updateGhostCells,
    ghostCellClick: ghostCellClick,
    animateGhostCells: animateGhostCells,

    // Output analysis
    updateOfficeOutput: updateOfficeOutput,
    checkIdle: checkIdle,

    // Drawing functions (used by office.js too)
    drawWizardHat: drawWizardHat,
    drawHardHat: drawHardHat,
    drawHeadphones: drawHeadphones,
    drawScarf: drawScarf,
    drawGhostAccessory: drawGhostAccessory,
    drawGhostAccessorySmall: drawGhostAccessorySmall,
    drawKeyboard: drawKeyboard,
    drawCowboyHat: drawCowboyHat,
    drawCrown: drawCrown,
    drawChefHat: drawChefHat,
    drawGradCap: drawGradCap,
    drawSunglasses: drawSunglasses,
    drawBunnyEars: drawBunnyEars,
    drawCape: drawCape,
    drawBowTie: drawBowTie,
    drawGhostAccessoryWardrobe: drawGhostAccessoryWardrobe,
    drawGhostAccessorySmallWardrobe: drawGhostAccessorySmallWardrobe,
    drawChristmasHat: drawChristmasHat,
    drawMoodEffects: drawMoodEffects,

    // Mood / day-night / lerp
    getMoodState: getMoodState,
    lerpGhostPos: lerpGhostPos,
    getDayPhase: getDayPhase,
    getDayColors: getDayColors,

    // Wardrobe
    WARDROBE_ITEMS: WARDROBE_ITEMS,
    get ghostAccessoryChoice() { return ghostAccessoryChoice; },
    set ghostAccessoryChoice(v) { ghostAccessoryChoice = v; },
    get wardrobeOpen() { return wardrobeOpen; },
    set wardrobeOpen(v) { wardrobeOpen = v; },
    loadWardrobe: loadWardrobe,
    saveWardrobe: saveWardrobe,

    // Celebration system (for office.js access)
    celebrationParticles: celebrationParticles,
    celebrationState: celebrationState,
    triggerCelebration: triggerCelebration,
    updateCelebrationParticles: updateCelebrationParticles,

    // Idle interaction (for office.js access)
    get activeIdleInteraction() { return activeIdleInteraction; },
    set activeIdleInteraction(v) { activeIdleInteraction = v; },
    checkIdleInteractions: checkIdleInteractions,

    // Emote system (for office.js access)
    ghostEmote: ghostEmote,
    triggerGhostEmote: triggerGhostEmote,
    updateGhostEmotes: updateGhostEmotes,

    // Output tracking (for office.js access)
    lastRealOutputTimes: lastRealOutputTimes,
    outputByteCounts: outputByteCounts,
    termLines: termLines,
    MAX_MINI_LINES: MAX_MINI_LINES,
    lastOutputFrames: lastOutputFrames,
    busyStartTimes: busyStartTimes,
  };

  return api;
})();

// ==================== Window Globals (for office.js and other modules) ====================
window.drawWizardHat = GT.ghostCells.drawWizardHat;
window.drawHardHat = GT.ghostCells.drawHardHat;
window.drawHeadphones = GT.ghostCells.drawHeadphones;
window.drawScarf = GT.ghostCells.drawScarf;
window.drawGhostAccessory = GT.ghostCells.drawGhostAccessory;
window.drawGhostAccessorySmall = GT.ghostCells.drawGhostAccessorySmall;
window.drawKeyboard = GT.ghostCells.drawKeyboard;
window.drawCowboyHat = GT.ghostCells.drawCowboyHat;
window.drawCrown = GT.ghostCells.drawCrown;
window.drawChefHat = GT.ghostCells.drawChefHat;
window.drawGradCap = GT.ghostCells.drawGradCap;
window.drawSunglasses = GT.ghostCells.drawSunglasses;
window.drawBunnyEars = GT.ghostCells.drawBunnyEars;
window.drawCape = GT.ghostCells.drawCape;
window.drawBowTie = GT.ghostCells.drawBowTie;
window.drawGhostAccessoryWardrobe = GT.ghostCells.drawGhostAccessoryWardrobe;
window.drawGhostAccessorySmallWardrobe = GT.ghostCells.drawGhostAccessorySmallWardrobe;
window.drawChristmasHat = GT.ghostCells.drawChristmasHat;
window.lerpGhostPos = GT.ghostCells.lerpGhostPos;
window.getDayPhase = GT.ghostCells.getDayPhase;
window.getDayColors = GT.ghostCells.getDayColors;
window.getMoodState = GT.ghostCells.getMoodState;
window.WARDROBE_ITEMS = GT.ghostCells.WARDROBE_ITEMS;
window.ghostAccessoryChoice = GT.ghostCells.ghostAccessoryChoice;
window.loadWardrobe = GT.ghostCells.loadWardrobe;
window.saveWardrobe = GT.ghostCells.saveWardrobe;
window.wardrobeOpen = GT.ghostCells.wardrobeOpen;
window.drawMoodEffects = GT.ghostCells.drawMoodEffects;
window.busyStartTimes = GT.ghostCells.busyStartTimes;
window.lastRealOutputTimes = GT.ghostCells.lastRealOutputTimes;
window.gcFrame = 0; // shared frame counter for office.js references
window.celebrationState = GT.ghostCells.celebrationState;
window.celebrationParticles = GT.ghostCells.celebrationParticles;
window.activeIdleInteraction = GT.ghostCells.activeIdleInteraction;
window.ghostEmote = GT.ghostCells.ghostEmote;
window.triggerGhostEmote = GT.ghostCells.triggerGhostEmote;
window.triggerCelebration = GT.ghostCells.triggerCelebration;
window.updateCelebrationParticles = GT.ghostCells.updateCelebrationParticles;
window.checkIdleInteractions = GT.ghostCells.checkIdleInteractions;
window.updateGhostEmotes = GT.ghostCells.updateGhostEmotes;
