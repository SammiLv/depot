declare module "better-sqlite3" {
  type RunResult = {
    changes: number;
    lastInsertRowid: number | bigint;
  };

  type Statement = {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): RunResult;
  };

  type DatabaseInstance = {
    backup(destinationFile: string): Promise<unknown>;
    close(): void;
    exec(sql: string): void;
    pragma(source: string, options?: { simple?: boolean }): unknown;
    prepare(sql: string): Statement;
    transaction<T extends (...args: never[]) => unknown>(fn: T): T;
  };

  type DatabaseOptions = {
    readonly?: boolean;
    fileMustExist?: boolean;
    timeout?: number;
  };

  class Database {
    constructor(filename: string, options?: DatabaseOptions);
  }

  interface Database extends DatabaseInstance {}

  export default Database;
}
