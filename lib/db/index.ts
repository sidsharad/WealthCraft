import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const dbUrl = (process.env.DATABASE_URL ?? "").trim();
const isRealDb =
  dbUrl.length > 0 &&
  !dbUrl.includes("your-") &&
  !dbUrl.includes("password@your");

// Only create a real connection when DATABASE_URL is properly configured.
const sql = isRealDb
  ? neon(dbUrl)
  : (() => { throw new Error("DATABASE_URL is not configured"); }) as never;

// Helpers to safely load Node-specific modules/APIs outside of Next.js Edge Middleware Runtime
const getFs = () => {
  if (typeof window === "undefined" && process.env.NEXT_RUNTIME !== "edge") {
    return require("fs");
  }
  return null;
};

const getPath = () => {
  if (typeof window === "undefined" && process.env.NEXT_RUNTIME !== "edge") {
    return require("path");
  }
  return null;
};

const getCwd = () => {
  if (typeof window === "undefined" && process.env.NEXT_RUNTIME !== "edge") {
    const p = process;
    const fn = p["cwd"];
    if (typeof fn === "function") {
      return fn.call(p);
    }
  }
  return "";
};

// ─── FILE-BASED MOCK DRIZZLE DATABASE ───────────────────────────────────────────
class MockDrizzle {
  private filePath: string;

  constructor() {
    const pathMod = getPath();
    const cwdVal = getCwd();
    this.filePath = (pathMod && cwdVal) ? pathMod.join(cwdVal, "db_fallback.json") : "db_fallback.json";
    this.initFile();
  }

  private initFile() {
    const fsMod = getFs();
    if (!fsMod) return;

    if (!fsMod.existsSync(this.filePath)) {
      try {
        fsMod.writeFileSync(
          this.filePath,
          JSON.stringify({
            users: [],
            rooms: [],
            accounts: [],
            sessions: [],
            verification_tokens: []
          }, null, 2),
          "utf-8"
        );
      } catch (err) {
        console.error("[MockDrizzle] Failed to initialize fallback db file:", err);
      }
    }
  }

  private read(): any {
    const fsMod = getFs();
    if (!fsMod) return { users: [], rooms: [], accounts: [], sessions: [], verification_tokens: [] };

    try {
      this.initFile();
      return JSON.parse(fsMod.readFileSync(this.filePath, "utf-8"));
    } catch (e) {
      return {
        users: [],
        rooms: [],
        accounts: [],
        sessions: [],
        verification_tokens: []
      };
    }
  }

  private write(data: any) {
    const fsMod = getFs();
    if (!fsMod) return;

    try {
      fsMod.writeFileSync(
        this.filePath,
        JSON.stringify(data, null, 2),
        "utf-8"
      );
    } catch (err) {
      console.error("[MockDrizzle] Failed to write to fallback db file:", err);
    }
  }

  private getTableName(tableObj: any): string {
    if (!tableObj) return "";
    
    // Attempt standard Drizzle Name symbol extraction
    if (typeof tableObj === "object") {
      const name = tableObj[Symbol.for("drizzle:Name")] || tableObj.name || tableObj._?.name;
      if (name) return name;
    }
    
    // Explicit checks based on properties
    if (tableObj?.email || tableObj?.passwordHash || tableObj?.avatarUrl) return "users";
    if (tableObj?.code || tableObj?.gameState || tableObj?.playerIds) return "rooms";
    if (tableObj?.identifier || tableObj?.token) return "verification_tokens";
    if (tableObj?.sessionToken) return "sessions";
    if (tableObj?.providerAccountId) return "accounts";

    return "";
  }

  private applyWhere(records: any[], condition: any): any[] {
    if (!condition) return records;
    if (typeof condition !== "object" || !condition.queryChunks) return records;

    const chunks = condition.queryChunks;
    // queryChunks[1] is the column object (contains 'name')
    // queryChunks[2] is the operator (contains ' = ' or ' in ')
    // queryChunks[3] is the target value
    const colObj = chunks[1];
    const opObj = chunks[2];
    const val = chunks[3];

    if (!colObj || !opObj) return records;

    const colName = colObj.name;
    const op = opObj.value?.[0] || "";

    return records.filter(rec => {
      // Find property on record that matches colName (case-insensitive or snake/camel match)
      const recKey = Object.keys(rec).find(k => 
        k.toLowerCase() === colName.toLowerCase() || 
        k.replace(/([A-Z])/g, "_$1").toLowerCase() === colName.toLowerCase()
      ) || colName;
      const recVal = rec[recKey];

      if (op.includes(" = ")) {
        return String(recVal) === String(val);
      } else if (op.includes(" in ")) {
        if (Array.isArray(val)) {
          return val.map(String).includes(String(recVal));
        }
      }
      return true;
    });
  }

  async execute(sqlObj: any) {
    return { rows: [] };
  }

  select(fields?: any) {
    const self = this;
    let selectedTableName = "";
    let whereCondition: any = null;

    const queryBuilder = {
      from(tableObj: any) {
        selectedTableName = self.getTableName(tableObj);
        return this;
      },
      where(condition: any) {
        whereCondition = condition;
        return this;
      },
      then(resolve: any, reject: any) {
        try {
          const dbData = self.read();
          let records = dbData[selectedTableName] || [];
          
          if (whereCondition) {
            records = self.applyWhere(records, whereCondition);
          }

          if (fields) {
            records = records.map((rec: any) => {
              const projected: any = {};
              for (const [key, value] of Object.entries(fields)) {
                const colName = (value as any)?.name || key;
                const recKey = Object.keys(rec).find(k => 
                  k.toLowerCase() === colName.toLowerCase() || 
                  k.replace(/([A-Z])/g, "_$1").toLowerCase() === colName.toLowerCase()
                ) || colName;
                projected[key] = rec[recKey];
              }
              return projected;
            });
          }

          resolve(JSON.parse(JSON.stringify(records)));
        } catch (err) {
          reject(err);
        }
      }
    };

    return queryBuilder;
  }

  insert(tableObj: any) {
    const self = this;
    const tableName = self.getTableName(tableObj);
    let valuesToInsert: any = null;

    const queryBuilder = {
      values(valuesObj: any) {
        valuesToInsert = valuesObj;
        return this;
      },
      returning(fields?: any) {
        return this;
      },
      then(resolve: any, reject: any) {
        try {
          const dbData = self.read();
          const records = dbData[tableName] || [];

          const newRecord = { ...valuesToInsert };
          if (!newRecord.id) {
            newRecord.id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
              const r = Math.random() * 16 | 0;
              return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            });
          }
          if (!newRecord.createdAt) {
            newRecord.createdAt = new Date().toISOString();
          }
          if (!newRecord.updatedAt) {
            newRecord.updatedAt = new Date().toISOString();
          }
          
          if (tableName === "users") {
            if (newRecord.wins === undefined) newRecord.wins = 0;
            if (newRecord.losses === undefined) newRecord.losses = 0;
          } else if (tableName === "rooms") {
            if (newRecord.mode === undefined) newRecord.mode = "online";
            if (newRecord.status === undefined) newRecord.status = "lobby";
            if (newRecord.playerIds === undefined) newRecord.playerIds = [];
          }

          records.push(newRecord);
          dbData[tableName] = records;
          self.write(dbData);

          resolve([JSON.parse(JSON.stringify(newRecord))]);
        } catch (err) {
          reject(err);
        }
      }
    };

    return queryBuilder;
  }

  update(tableObj: any) {
    const self = this;
    const tableName = self.getTableName(tableObj);
    let setValues: any = null;
    let whereCondition: any = null;

    const queryBuilder = {
      set(values: any) {
        setValues = values;
        return this;
      },
      where(condition: any) {
        whereCondition = condition;
        return this;
      },
      returning(fields?: any) {
        return this;
      },
      then(resolve: any, reject: any) {
        try {
          const dbData = self.read();
          let records = dbData[tableName] || [];

          const matching = self.applyWhere(records, whereCondition);
          const updatedRecords: any[] = [];

          records = records.map((rec: any) => {
            if (matching.includes(rec)) {
              const updatedRec = { ...rec };
              for (const [key, val] of Object.entries(setValues)) {
                if (val && typeof val === "object" && (val as any).queryChunks) {
                  const chunkStr = JSON.stringify((val as any).queryChunks);
                  if (chunkStr.includes("+ 1")) {
                    updatedRec[key] = (rec[key] || 0) + 1;
                  }
                } else {
                  updatedRec[key] = val;
                }
              }
              updatedRec.updatedAt = new Date().toISOString();
              updatedRecords.push(updatedRec);
              return updatedRec;
            }
            return rec;
          });

          dbData[tableName] = records;
          self.write(dbData);

          resolve(JSON.parse(JSON.stringify(updatedRecords)));
        } catch (err) {
          reject(err);
        }
      }
    };

    return queryBuilder;
  }

  delete(tableObj: any) {
    const self = this;
    const tableName = self.getTableName(tableObj);
    let whereCondition: any = null;

    const queryBuilder = {
      where(condition: any) {
        whereCondition = condition;
        return this;
      },
      then(resolve: any, reject: any) {
        try {
          const dbData = self.read();
          let records = dbData[tableName] || [];

          const matching = self.applyWhere(records, whereCondition);
          records = records.filter((rec: any) => !matching.includes(rec));

          dbData[tableName] = records;
          self.write(dbData);

          resolve();
        } catch (err) {
          reject(err);
        }
      }
    };

    return queryBuilder;
  }
}

export const db = isRealDb
  ? drizzle(sql, { schema })
  : (new MockDrizzle() as any);
