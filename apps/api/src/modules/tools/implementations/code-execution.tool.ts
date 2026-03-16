import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { tmpdir } from 'os';

// NOTE: For production, replace with Docker-sandboxed execution.
// This implementation runs code in an isolated temp directory with timeouts.
const ALLOWED_LANGS = ['python', 'javascript', 'typescript'];
const TIMEOUT_MS = 10_000;

export async function codeExecutionTool(input: Record<string, unknown>): Promise<string> {
  const { language, code } = input as { language: string; code: string };

  if (!ALLOWED_LANGS.includes(language)) {
    throw new Error(`Language must be one of: ${ALLOWED_LANGS.join(', ')}`);
  }
  if (!code || typeof code !== 'string') throw new Error('code is required');
  if (code.length > 50_000) throw new Error('Code too long (max 50KB)');

  const dir = join(tmpdir(), `agenthub-${randomBytes(8).toString('hex')}`);
  mkdirSync(dir, { recursive: true });

  try {
    if (language === 'python') {
      const file = join(dir, 'run.py');
      writeFileSync(file, code);
      const output = execSync(`python "${file}"`, { timeout: TIMEOUT_MS, cwd: dir }).toString();
      return output.slice(0, 5000);
    } else if (language === 'javascript') {
      const file = join(dir, 'run.js');
      writeFileSync(file, code);
      const output = execSync(`node "${file}"`, { timeout: TIMEOUT_MS, cwd: dir }).toString();
      return output.slice(0, 5000);
    } else {
      throw new Error('TypeScript execution not yet supported');
    }
  } catch (err: any) {
    throw new Error(`Execution error: ${err.stderr?.toString() ?? err.message}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
