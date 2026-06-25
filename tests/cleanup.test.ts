import { cleanupExpiredRooms } from "@/lib/db/cleanup";
import { db } from "@/lib/db/index";
import { sql } from "drizzle-orm";

import { vi } from "vitest";

vi.mock("@/lib/db/index", () => ({
  db: {
    execute: vi.fn(),
  },
}));

describe("Room Lifecycle Cleanup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should execute three cleanup queries in order without throwing errors", async () => {
    (db.execute as jest.Mock).mockResolvedValue({ rowCount: 0 });

    await cleanupExpiredRooms();

    expect(db.execute).toHaveBeenCalledTimes(3);

    // Test 1: Lobby deletion query
    expect(db.execute).toHaveBeenNthCalledWith(1, expect.objectContaining({
      query: expect.stringContaining("DELETE FROM rooms"),
    }));
    expect(db.execute).toHaveBeenNthCalledWith(1, expect.objectContaining({
      query: expect.stringContaining("status = 'lobby'"),
    }));
    expect(db.execute).toHaveBeenNthCalledWith(1, expect.objectContaining({
      query: expect.stringContaining("INTERVAL '1 hour'"),
    }));

    // Test 2: Active -> Abandoned update
    expect(db.execute).toHaveBeenNthCalledWith(2, expect.objectContaining({
      query: expect.stringContaining("UPDATE rooms"),
    }));
    expect(db.execute).toHaveBeenNthCalledWith(2, expect.objectContaining({
      query: expect.stringContaining("SET status = 'abandoned'"),
    }));
    expect(db.execute).toHaveBeenNthCalledWith(2, expect.objectContaining({
      query: expect.stringContaining("status = 'active'"),
    }));
    expect(db.execute).toHaveBeenNthCalledWith(2, expect.objectContaining({
      query: expect.stringContaining("INTERVAL '24 hours'"),
    }));

    // Test 3/4/5: 7-day hard deletion
    expect(db.execute).toHaveBeenNthCalledWith(3, expect.objectContaining({
      query: expect.stringContaining("DELETE FROM rooms"),
    }));
    expect(db.execute).toHaveBeenNthCalledWith(3, expect.objectContaining({
      query: expect.stringContaining("status IN ('lobby', 'finished', 'abandoned')"),
    }));
    expect(db.execute).toHaveBeenNthCalledWith(3, expect.objectContaining({
      query: expect.stringContaining("INTERVAL '7 days'"),
    }));
  });

  it("should fail gracefully and not throw if the database goes offline", async () => {
    const errorLogSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    (db.execute as jest.Mock).mockRejectedValue(new Error("Database timeout"));

    // Should not throw
    await expect(cleanupExpiredRooms()).resolves.not.toThrow();
    
    // Should log the failure
    expect(errorLogSpy).toHaveBeenCalledWith("[CLEANUP_JOB_FAILED]", expect.any(Error));
    
    errorLogSpy.mockRestore();
  });
});
