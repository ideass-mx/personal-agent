/**
 * Sesión reutilizable (secundario): varios searches en un solo launch.
 */
import { ElectronSerpRuntime } from "./runtime.ts";
import type { ElectronSerpRunResult, ElectronSerpRuntimeOptions } from "./types.ts";
import { QUERY_60_9_6 } from "./types.ts";

export class ElectronSerpSession {
  private runtime: ElectronSerpRuntime;
  private started = false;

  constructor(opts: ElectronSerpRuntimeOptions = {}) {
    this.runtime = new ElectronSerpRuntime(opts);
  }

  async start(): Promise<void> {
    await this.runtime.launch();
    this.started = true;
  }

  async search(query = QUERY_60_9_6, run = 1): Promise<ElectronSerpRunResult> {
    if (!this.started) await this.start();
    return this.runtime.searchDuckDuckGo(query, run);
  }

  async end(): Promise<void> {
    await this.runtime.close();
    this.started = false;
  }
}
