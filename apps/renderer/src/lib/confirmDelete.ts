import { useToast } from '../components/ui/Toast';

type Options = {
  label: string;
  onDelete: () => void | Promise<void>;
  onUndo?: () => void | Promise<void>;
  description?: string;
};

/**
 * Optimistic-delete UX: run onDelete immediately, show a toast with Undo.
 * If the user clicks Undo, onUndo runs to restore. Otherwise the toast
 * auto-dismisses after 6s and the delete stands.
 */
export function confirmDelete({ label, onDelete, onUndo, description }: Options): void {
  void Promise.resolve(onDelete()).then(() => {
    useToast.getState().push({
      kind: 'info',
      title: `${label} deleted`,
      description,
      durationMs: onUndo ? 6000 : 3000,
      action: onUndo
        ? {
            label: 'Undo',
            onClick: () => void Promise.resolve(onUndo()),
          }
        : undefined,
    });
  });
}
