import { cleanupExpiredRooms } from "@/lib/db/cleanup";
import { db } from "@/lib/db/index";
import { sql } from "drizzle-orm";

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db/index", () => ({
  db: {
    execute: vi.fn(),
  },
}));

describe("Room Lifecycle Cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should execute three cleanup queries in order without throwing errors", async () => {
    (db.execute as any).mockResolvedValue({ rowCount: 0 });

    await cleanupExpiredRooms();

    expect(db.execute).toHaveBeenCalledTimes(3);

    // Drizzle uses stringChunks now for its SQL objects
    // Test 1: Lobby deletion query
    expect(db.execute).toHaveBeenNthCalledWith(1, expect.objectContaining({
      queryChunks: expect.arrayContaining([
        expect.objectContaining({ value: expect.arrayContaining([expect.stringContaining("DELETE FROM rooms")]) })
      ])
    }));

    // Test 2: Active -> Abandoned update
    expect(db.execute).toHaveBeenNthCalledWith(2, expect.objectContaining({
      queryChunks: expect.arrayContaining([
        expect.objectContaining({ value: expect.arrayContaining([expect.stringContaining("UPDATE rooms")]) })
      ])
    }));

    // Test 3: 7-day hard deletion
    expect(db.execute).toHaveBeenNthCalledWith(3, expect.objectContaining({
      queryChunks: expect.arrayContaining([
        expect.objectContaining({ value: expect.arrayContaining([expect.stringContaining("DELETE FROM rooms")]) })
      ])
    }));
  });

  it("should fail gracefully and not throw if the database goes offline", async () => {
    const errorLogSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    (db.execute as any).mockRejectedValue(new Error("Database timeout"));

    // Should not throw
    await expect(cleanupExpiredRooms()).resolves.not.toThrow();
    
    // Should log the failure
    expect(errorLogSpy).toHaveBeenCalledWith("[CLEANUP_JOB_FAILED]", expect.any(Error));
    
    errorLogSpy.mockRestore();
  });
});
