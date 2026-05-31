export interface LockInfo {
  lockedAt: number;
  holder: string;
}

const globalForLocks = globalThis as unknown as {
  roomLocks: Map<string, LockInfo>;
};

export const roomLocks = globalForLocks.roomLocks || new Map<string, LockInfo>();

if (process.env.NODE_ENV !== "production") {
  globalForLocks.roomLocks = roomLocks;
}
