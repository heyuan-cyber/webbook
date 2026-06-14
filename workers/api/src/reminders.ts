import type { Env } from './env';
import { getFile, putFile } from './github';
import type { RemindersIndex, Reminder, Note } from '@webbook/shared';
import { USER_REMINDERS_PATH } from '@webbook/shared';
import { extractTodos } from './ai';

const LEGACY_REMINDERS_PATH = 'data/meta/reminders.json';

export async function loadUserReminders(env: Env, userId: string): Promise<RemindersIndex> {
  const raw = await getFile(env, USER_REMINDERS_PATH(userId));
  if (raw) {
    const data = JSON.parse(raw) as RemindersIndex;
    return { schemaVersion: 1, reminders: Array.isArray(data.reminders) ? data.reminders : [] };
  }
  return { schemaVersion: 1, reminders: [] };
}

export async function saveUserReminders(
  env: Env,
  userId: string,
  index: RemindersIndex,
): Promise<void> {
  await putFile(
    env,
    USER_REMINDERS_PATH(userId),
    JSON.stringify(index, null, 2),
    'reminders: update',
  );
}

export async function mergeTodosFromNote(env: Env, userId: string, note: Note): Promise<void> {
  const todos = await extractTodos(env, note);
  const index = await loadUserReminders(env, userId);
  const filtered = index.reminders.filter((r) => r.noteId !== note.id);
  const now = new Date().toISOString();
  for (const text of todos) {
    filtered.push({
      id: `${note.id}:${text}`,
      noteId: note.id,
      text,
      createdAt: now,
      done: false,
    });
  }
  await saveUserReminders(env, userId, { ...index, reminders: filtered });
}

export async function addQuickReminder(
  env: Env,
  userId: string,
  text: string,
): Promise<Reminder> {
  const index = await loadUserReminders(env, userId);
  const reminder: Reminder = {
    id: crypto.randomUUID(),
    noteId: '__quick__',
    text: text.trim(),
    createdAt: new Date().toISOString(),
    done: false,
  };
  await saveUserReminders(env, userId, {
    ...index,
    reminders: [reminder, ...index.reminders],
  });
  return reminder;
}

export async function patchReminder(
  env: Env,
  userId: string,
  reminderId: string,
  patch: { done?: boolean },
): Promise<Reminder | null> {
  const index = await loadUserReminders(env, userId);
  const item = index.reminders.find((r) => r.id === reminderId);
  if (!item) return null;
  if (patch.done !== undefined) item.done = patch.done;
  await saveUserReminders(env, userId, index);
  return item;
}

/** 从旧版全局 reminders 迁移（一次性，按 noteId 归属当前用户） */
export async function migrateLegacyReminders(env: Env, userId: string): Promise<void> {
  const existing = await getFile(env, USER_REMINDERS_PATH(userId));
  if (existing) return;
  const legacyRaw = await getFile(env, LEGACY_REMINDERS_PATH);
  if (!legacyRaw) return;
  const legacy = JSON.parse(legacyRaw) as RemindersIndex;
  if (!legacy.reminders?.length) return;
  await saveUserReminders(env, userId, { schemaVersion: 1, reminders: legacy.reminders });
}
