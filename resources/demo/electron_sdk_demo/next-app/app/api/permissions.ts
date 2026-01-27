/**
 * Permission confirmation API endpoint
 * Handles pending tool approvals
 * Uses globalThis to persist state across Next.js hot reloads
 */

interface PendingPermission {
  toolName: string;
  input: any;
  resolve: (approved: boolean) => void;
  timestamp: number;
}

// Use globalThis to persist across hot reloads in dev mode
const globalForPermissions = globalThis as unknown as {
  pendingPermissions: Map<string, PendingPermission> | undefined;
};

const pendingPermissions = globalForPermissions.pendingPermissions ?? new Map<string, PendingPermission>();
globalForPermissions.pendingPermissions = pendingPermissions;

// Export for use in chat route
export function createPendingPermission(toolUseID: string, toolName: string, input: any): Promise<boolean> {
  console.log(`[PERM] Creating pending: ${toolUseID} - ${toolName}`);
  console.log(`[PERM] Current pending count: ${pendingPermissions.size}`);

  return new Promise((resolve) => {
    pendingPermissions.set(toolUseID, {
      toolName,
      input,
      resolve,
      timestamp: Date.now(),
    });

    console.log(`[PERM] After set, pending count: ${pendingPermissions.size}`);

    // Auto-timeout after 60 seconds
    setTimeout(() => {
      if (pendingPermissions.has(toolUseID)) {
        console.log(`[PERM] Timeout: ${toolUseID}`);
        pendingPermissions.delete(toolUseID);
        resolve(false);
      }
    }, 60000);
  });
}

export function getPendingPermissions() {
  console.log(`[PERM] Getting pending, count: ${pendingPermissions.size}`);
  const result: { id: string; toolName: string; input: any }[] = [];
  pendingPermissions.forEach((value, key) => {
    result.push({
      id: key,
      toolName: value.toolName,
      input: value.input,
    });
  });
  return result;
}

export function resolvePermission(toolUseID: string, approved: boolean) {
  console.log(`[PERM] Resolving: ${toolUseID} - ${approved}`);
  const pending = pendingPermissions.get(toolUseID);
  if (pending) {
    pending.resolve(approved);
    pendingPermissions.delete(toolUseID);
    return true;
  }
  console.log(`[PERM] Not found: ${toolUseID}`);
  return false;
}
