// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 chuni-judgement contributors
/* UMIGURI static ground-note windows, independently named port of cw().
 * Reference: pingfanH/umiguri-re @ 3aa8ebc53030cd178d5d90201e4ae2036f61c0bd
 * open-umiguri/src/game/logic/0070-ExpressionStatement.js:24-55.
 * Units: seconds; early/late use source convention (note time - input time).
 * This is the static eligibility envelope, NOT a replay/input-state simulator.
 */
(function (root) {
  'use strict';
  const ground = new Set(['TAP', 'CHR', 'HLD_H', 'SLD_H', 'FLK']);
  const longHead = n => n.type === 'HLD_H' || n.type === 'SLD_H';
  const critical = n => n.type === 'CHR' || (longHead(n) && n.critical === true);
  const overlap = (a, b) => a.lane < b.lane + b.width && b.lane < a.lane + a.width;
  const inside = (lane, a, b) => lane >= Math.max(a.lane, b.lane) && lane < Math.min(a.lane + a.width, b.lane + b.width);

  // Legacy C2S and rendered charts can represent a critical long-note head
  // as HLD_H/SLD_H plus separate CHR notes. The union must cover the ENTIRE
  // head at the same timestamp (chartParser's xk/Jg rule), not merely overlap.
  function markCriticalHeads(input) {
    const at = n => Number.isFinite(n.tick) ? `tick:${n.tick}` : `time:${n.time}`;
    const coverage = new Map();
    for (const n of input) if (n.type === 'CHR') {
      const key = at(n);
      if (!coverage.has(key)) coverage.set(key, []);
      coverage.get(key).push([n.lane, n.lane + n.width]);
    }
    for (const ranges of coverage.values()) ranges.sort((a, b) => a[0] - b[0]);
    return input.map(n => {
      if (!longHead(n) || n.critical === true) return {...n};
      let coveredTo = n.lane;
      for (const [left, right] of coverage.get(at(n)) || []) {
        if (left > coveredTo) break;
        coveredTo = Math.max(coveredTo, right);
        if (coveredTo >= n.lane + n.width) return {...n, critical: true};
      }
      return {...n};
    });
  }

  function protect(input, easy = false) {
    const jc = 2 / 60, attack = (easy ? 6 : 5) / 60;
    const notes = markCriticalHeads(input).filter(n => ground.has(n.type)).map(n => ({...n, early: Array(16).fill(Infinity), late: Array(16).fill(-Infinity), miss: 0})).sort((a, b) => a.time - b.time);
    // Pass 1: earlier notes restrict the later note's early edge.
    for (let i = 0; i < notes.length; ++i) {
      const b = notes[i];
      if (i === 0) { b.early.fill(attack); continue; }
      for (const a of notes) {
        if (a.time >= b.time) break;
        if (!overlap(a, b)) continue;
        const half = (b.time - a.time) / 2;
        for (let lane = 0; lane < 16; ++lane) b.early[lane] = Math.min(b.early[lane], inside(lane, a, b) ? half : critical(b) || b.type === 'FLK' ? attack : Math.max(half, jc));
      }
    }
    // Pass 2: propagate the resulting boundary to the earlier late edge.
    for (let i = 0; i < notes.length; ++i) {
      const a = notes[i];
      for (let j = notes.length - 1; j > i; --j) {
        const b = notes[j], delta = b.time - a.time;
        if (delta <= 0) break;
        if (!overlap(a, b)) continue;
        if (critical(a)) {
          for (let lane = 0; lane < 16; ++lane) a.late[lane] = Math.max(a.late[lane], inside(lane, a, b) ? -delta + b.early[lane] : -attack);
        } else {
          const edge = Math.max(a.late[a.lane], -delta + b.early[Math.max(a.lane, b.lane)]);
          for (let lane = 0; lane < 16; ++lane) a.late[lane] = inside(lane, a, b) ? Math.max(edge, -delta + b.early[lane]) : Math.max(a.late[lane], Math.min(edge, -jc));
        }
      }
      for (let lane = a.lane; lane < a.lane + a.width; ++lane) a.miss = Math.min(a.miss, Math.max(a.late[lane], -attack));
    }
    // Pass 3 deliberately assigns the overlapping edge, matching the source.
    for (let i = 0; i < notes.length; ++i) {
      const a = notes[i];
      for (let j = i + 1; j < notes.length; ++j) {
        const b = notes[j], delta = b.time - a.time;
        if (delta <= 0 || !overlap(a, b)) continue;
        if (critical(b)) {
          for (let lane = 0; lane < 16; ++lane) if (inside(lane, a, b)) b.early[lane] = delta + a.late[lane];
        } else {
          let edge = Infinity;
          for (let lane = 0; lane < 16; ++lane) if (inside(lane, a, b)) edge = Math.min(edge, delta + a.late[lane]);
          for (let lane = 0; lane < 16; ++lane) b.early[lane] = inside(lane, a, b) ? edge : Math.min(Math.max(edge, jc), b.early[lane]);
        }
      }
    }
    return notes;
  }

  function bands(note, lane, {easy = false, protection = true} = {}) {
    const attack = (easy ? 6 : 5) / 60;
    // Return input-time offsets: negative = early, positive = late.
    const lo = protection ? -Math.min(attack, note.early[lane]) : -attack;
    const hi = protection ? -Math.max(-attack, note.late[lane], note.miss) : attack;
    // Flick needs touch AND movement history. Never label its touch gate JC/J/A.
    const ranges = note.type === 'FLK' ? [['TOUCH', -5 / 60, 5 / 60]] : critical(note) ? [['JC', -attack, attack]] : [
      ['ATTACK', -attack, -4 / 60], ['JUSTICE', -4 / 60, -2 / 60],
      ['JC', -2 / 60, 2 / 60], ['JUSTICE', 2 / 60, 4 / 60], ['ATTACK', 4 / 60, attack]
    ];
    return ranges.map(([grade, from, to]) => ({grade, from: Math.max(from, lo), to: Math.min(to, hi)})).filter(b => b.to > b.from);
  }

  const api = {protect, bands, ground, markCriticalHeads};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NewchartJudgement = api;
})(globalThis);
