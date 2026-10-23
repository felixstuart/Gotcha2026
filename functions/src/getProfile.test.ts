import { beforeAll, describe, it, expect } from 'vitest';
import { getProfile } from './getProfile';
import { seedProfiles } from '../../seed';
import { spawn } from 'node:child_process';

server = spawn('firebase', ['emulators:start'], { 
        cwd: path.resolve(process.cwd(), '..'), 
        stdio: 'inherit', 
    }
);

describe("getProfile", () => {
  it("gets existing user's profile", () => {
    
  });
});
