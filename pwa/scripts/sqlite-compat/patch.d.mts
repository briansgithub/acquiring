import type { Plugin } from 'vite';

export const SQLITE_PACKAGE_VERSION: '3.53.4-build2';
export const SQLITE_SOURCE_SHA256: string;
export const UPSTREAM_PRESERVATION_SOURCE: string;
export const FAILURE_CLEANUP_TARGET: string;
export const PRESERVING_FAILURE_CLEANUP: string;
export function patchSqliteSahPool(source: string): string;
export function sqlitePreservationPlugin(): Plugin;
