/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LeaderboardEntry } from '../types';

export function generateToken(seed: string, score: number, perfect: boolean): string {
  const scoreStr = score.toString().padStart(5, '0');
  const perfChar = perfect ? 'P' : 'R';
  const rawData = `${seed}-${scoreStr}-${perfChar}`;
  
  // Calculate a reliable 16-bit checksum
  let checksumVal = 0;
  for (let i = 0; i < rawData.length; i++) {
    checksumVal = (checksumVal * 33 + rawData.charCodeAt(i)) % 65536;
  }
  const checksum = checksumVal.toString(16).toUpperCase().padStart(4, '0');
  
  return `CV-${seed}-${scoreStr}-${perfChar}-${checksum}`;
}

export function validateToken(token: string): { seed: string; score: number; perfect: boolean } | null {
  try {
    const parts = token.trim().toUpperCase().split('-');
    if (parts.length !== 5 || parts[0] !== 'CV') return null;

    const seed = parts[1].toLowerCase(); // Seeds are lowercase alfanumeric
    const scoreStr = parts[2];
    const perfChar = parts[3];
    const checksum = parts[4];

    const score = parseInt(scoreStr, 10);
    if (isNaN(score)) return null;

    const perfect = perfChar === 'P';
    const rawData = `${seed}-${scoreStr}-${perfChar}`;

    // Recalculate checksum
    let checksumVal = 0;
    for (let i = 0; i < rawData.length; i++) {
      checksumVal = (checksumVal * 33 + rawData.charCodeAt(i)) % 65536;
    }
    const expectedChecksum = checksumVal.toString(16).toUpperCase().padStart(4, '0');

    if (checksum === expectedChecksum) {
      return { seed, score, perfect };
    }
  } catch (e) {
    return null;
  }
  return null;
}

export function getLocalLeaderboard(): LeaderboardEntry[] {
  try {
    const data = localStorage.getItem('circuito_vivo_leaderboard');
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to load leaderboard', e);
  }
  return [];
}

export function saveLeaderboardEntry(entry: LeaderboardEntry) {
  try {
    const scores = getLocalLeaderboard();
    // Add new, sort by score descending, limit to 10
    scores.push(entry);
    scores.sort((a, b) => b.score - a.score);
    const topScores = scores.slice(0, 10);
    localStorage.setItem('circuito_vivo_leaderboard', JSON.stringify(topScores));
  } catch (e) {
    console.error('Failed to save leaderboard entry', e);
  }
}
