import { filesystemApi } from './api';
import type { OpenInExplorerResponse } from '@/types';

type TauriInvoke = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

type TauriGlobal = {
  invoke?: TauriInvoke;
  tauri?: {
    invoke?: TauriInvoke;
  };
};

const getTauriInvoke = (): TauriInvoke | null => {
  const tauriGlobal = (window as Window & { __TAURI__?: TauriGlobal })
    .__TAURI__;
  return tauriGlobal?.tauri?.invoke ?? tauriGlobal?.invoke ?? null;
};

const isAbsolutePath = (path: string): boolean =>
  /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith('\\\\') || path.startsWith('/');

const resolveAbsolutePath = (
  path: string,
  workspacePath?: string,
): string | null => {
  const trimmedPath = path.trim();
  if (!trimmedPath) return null;
  if (isAbsolutePath(trimmedPath)) return trimmedPath;

  const trimmedWorkspace = workspacePath?.trim();
  if (!trimmedWorkspace) return null;

  const separator = trimmedWorkspace.includes('\\') ? '\\' : '/';
  const base = trimmedWorkspace.replace(/[\\/]+$/, '');
  const relative = trimmedPath.replace(/^\.?[\\/]+/, '');
  return `${base}${separator}${relative}`;
};

const revealViaTauri = async (path: string): Promise<boolean> => {
  const invoke = getTauriInvoke();
  if (!invoke) return false;

  try {
    await invoke('reveal_path_in_file_manager', { path });
    return true;
  } catch {
    return false;
  }
};

export const openInSystemFileManager = async (
  path: string,
  workspacePath?: string,
  sessionId?: string,
): Promise<OpenInExplorerResponse> => {
  const absolutePath = resolveAbsolutePath(path, workspacePath);
  if (absolutePath && (await revealViaTauri(absolutePath))) {
    return { ok: true };
  }

  return filesystemApi.openInExplorer(path, workspacePath, sessionId);
};
