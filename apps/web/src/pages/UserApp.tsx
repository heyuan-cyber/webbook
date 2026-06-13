import { AppShell } from '@/components/AppShell';
import { NoteEditor } from '@/components/NoteEditor';

export function UserApp() {
  return (
    <AppShell editable>
      <NoteEditor />
    </AppShell>
  );
}
