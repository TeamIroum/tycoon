/*
 * 단일 localStorage 자동 저장 슬롯 (담당: 팀원 1, 기능정의서 F-18)
 * GameState의 toJSON/load를 사용하며 게임 규칙이나 Phaser UI를 다루지 않는다.
 */
(function () {
  'use strict';
  const TYCOON = (globalThis.TYCOON = globalThis.TYCOON || {});
  const CORE_NS = (TYCOON.core = TYCOON.core || {});

  const STORAGE_KEY = 'tycoon.autosave';
  const STORAGE_VERSION = 1;
  const clone = (value) => structuredClone(value);
  const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

  class BrowserSave {
    constructor(options = {}) {
      this.key = options.key || STORAGE_KEY;
      this.version = STORAGE_VERSION;
      this.storageProvider = Object.prototype.hasOwnProperty.call(options, 'storage')
        ? () => options.storage
        : () => globalThis.localStorage;
      this.lastResult = { ok: false, reason: 'EMPTY' };
    }

    storage() {
      try { return this.storageProvider(); }
      catch (error) { return null; }
    }

    remove() {
      const storage = this.storage();
      if (!storage) return this.setResult({ ok: false, reason: 'STORAGE_UNAVAILABLE' });
      try {
        storage.removeItem(this.key);
        return this.setResult({ ok: true });
      } catch (error) {
        return this.setResult({ ok: false, reason: 'CLEAR_FAILED', error: String(error && error.message || error) });
      }
    }

    read() {
      const storage = this.storage();
      if (!storage) return this.setResult({ ok: false, reason: 'STORAGE_UNAVAILABLE' });
      let raw;
      try { raw = storage.getItem(this.key); }
      catch (error) { return this.setResult({ ok: false, reason: 'READ_FAILED', error: String(error && error.message || error) }); }
      if (raw === null || raw === undefined || raw === '') return this.setResult({ ok: false, reason: 'EMPTY' });

      let record;
      try { record = JSON.parse(raw); }
      catch (error) { return this.discard('CORRUPTED'); }
      if (!isObject(record)) return this.discard('CORRUPTED');
      if (record.version !== this.version) return this.discard('VERSION_MISMATCH');
      if (!isObject(record.gameState) || !isObject(record.meta) ||
          typeof record.meta.hintsOn !== 'boolean' || !Array.isArray(record.meta.seenDialogs) ||
          !record.meta.seenDialogs.every((id) => typeof id === 'string') ||
          new Set(record.meta.seenDialogs).size !== record.meta.seenDialogs.length) {
        return this.discard('CORRUPTED');
      }
      return this.setResult({ ok: true, record });
    }

    discard(reason) {
      const removed = this.remove();
      return this.setResult({ ok: false, reason, cleared: removed.ok });
    }

    restore(flow) {
      const read = this.read();
      if (!read.ok) return read;
      const loaded = flow.state.load(read.record.gameState);
      if (!loaded.ok) return this.discard(loaded.reason || 'CORRUPTED');
      // Meta is checked before GameState.load; the assignment cannot leave a partial restore.
      flow.meta = clone(read.record.meta);
      return this.setResult({ ok: true });
    }

    save(flow) {
      if (flow.fatal) return this.setResult({ ok: false, reason: 'FATAL' });
      const storage = this.storage();
      if (!storage) return this.setResult({ ok: false, reason: 'STORAGE_UNAVAILABLE' });
      try {
        const record = {
          version: this.version,
          gameState: flow.state.toJSON(),
          meta: clone(flow.meta)
        };
        storage.setItem(this.key, JSON.stringify(record));
        return this.setResult({ ok: true });
      } catch (error) {
        return this.setResult({ ok: false, reason: 'WRITE_FAILED', error: String(error && error.message || error) });
      }
    }

    reset(flow) {
      // A fresh game replaces the previous single-slot progress. If clearing fails,
      // still try writing the new state; successful setItem replaces the old record.
      this.remove();
      return this.save(flow);
    }

    attach(flow, onStatus) {
      const publish = () => { if (typeof onStatus === 'function') onStatus(this.lastResult); };
      return flow.subscribe((view, events) => {
        if (flow.fatal) {
          this.setResult({ ok: false, reason: 'FATAL' });
          publish();
          return;
        }
        if ((events || []).includes('GAME_STARTED')) this.reset(flow);
        else this.save(flow);
        publish();
      });
    }

    setResult(result) {
      this.lastResult = result;
      return result;
    }
  }

  Object.assign(CORE_NS, { BrowserSave, AUTOSAVE_KEY: STORAGE_KEY, AUTOSAVE_VERSION: STORAGE_VERSION });
})();
