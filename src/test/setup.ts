import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock Tauri APIs
vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(),
  Update: class {
    version = ''
    currentVersion = ''
    body = ''
    date = ''
    downloadAndInstall = vi.fn()
  },
}))

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn(() => Promise.resolve('0.1.4')),
}))

// Mock window.__TAURI_INTERNALS__ for Tauri environment detection
Object.defineProperty(window, '__TAURI_INTERNALS__', {
  value: {},
  writable: true,
  configurable: true,
})
