// Global test setup
// Silence console output during tests unless explicitly needed
import { vi } from "vitest";

// Mock environment variables for tests
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-for-testing-only-32chars";
process.env.ADMIN_PASSWORD = "Chomukamba";
process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
process.env.OPENAI_API_KEY = "test-openai-key";
process.env.GEMINI_API_KEY = "test-gemini-key";
process.env.DATABASE_URL = ""; // Will force MemoryStorage

// Suppress noisy console.error in tests
const originalConsoleError = console.error;
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});
