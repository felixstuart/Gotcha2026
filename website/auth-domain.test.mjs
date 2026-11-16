import test from "node:test";
import assert from "node:assert/strict";
import { selectAuthDomain } from "./auth-domain.ts";

test("same-origin auth stays off until Google callback configuration is ready", () => {
  for (const host of ["gotchama.xyz", "gotchama.web.app"]) {
    assert.equal(selectAuthDomain(host, false), "felixs-gotcha-tes.firebaseapp.com");
    assert.equal(selectAuthDomain(host, true), host);
  }
});

test("local, server-rendered and unrecognized hosts keep the configured Firebase helper", () => {
  for (const host of ["", "localhost", "127.0.0.1", "example.com", "gotchama.xyz.evil.example"]) {
    assert.equal(selectAuthDomain(host, true), "felixs-gotcha-tes.firebaseapp.com");
  }
});
