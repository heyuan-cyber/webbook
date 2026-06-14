import { useCallback, useEffect, useState } from 'react';
import { uid } from './id';

const STORAGE_KEY = 'webbook-guest-persona';

const ADJECTIVES = [
  '快乐的',
  '好奇的',
  '安静的',
  '热情的',
  '神秘的',
  '温柔的',
  '勇敢的',
  '慵懒的',
  '机智的',
  '浪漫的',
];

const ANIMALS = [
  '企鹅',
  '鲸鱼',
  '狐狸',
  '熊猫',
  '海豚',
  '猫头鹰',
  '考拉',
  '小鹿',
  '水獭',
  '云雀',
];

export interface GuestPersona {
  guestId: string;
  displayName: string;
  avatarHue: number;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function randomGuestDisplayName(): string {
  return `${pick(ADJECTIVES)}${pick(ANIMALS)}`;
}

function randomHue(): number {
  return Math.floor(Math.random() * 360);
}

function loadPersona(): GuestPersona {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as GuestPersona;
      if (parsed.guestId && parsed.displayName) {
        return {
          guestId: parsed.guestId,
          displayName: parsed.displayName,
          avatarHue: parsed.avatarHue ?? randomHue(),
        };
      }
    }
  } catch {
    /* ignore */
  }
  const persona: GuestPersona = {
    guestId: uid('guest'),
    displayName: randomGuestDisplayName(),
    avatarHue: randomHue(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persona));
  return persona;
}

function savePersona(persona: GuestPersona) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persona));
}

export function useGuestPersona() {
  const [persona, setPersona] = useState<GuestPersona | null>(null);

  useEffect(() => {
    setPersona(loadPersona());
  }, []);

  const setDisplayName = useCallback((displayName: string) => {
    setPersona((prev) => {
      if (!prev) return prev;
      const next = { ...prev, displayName };
      savePersona(next);
      return next;
    });
  }, []);

  const rerollName = useCallback(() => {
    setPersona((prev) => {
      if (!prev) return prev;
      const next = { ...prev, displayName: randomGuestDisplayName() };
      savePersona(next);
      return next;
    });
  }, []);

  return { persona, setDisplayName, rerollName };
}

export function avatarInitials(name: string): string {
  const t = name.trim();
  if (!t) return '?';
  return t.slice(0, 1).toUpperCase();
}
