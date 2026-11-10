# Repository guidance

## Firestore schema

Keep [`schema.ts`](schema.ts), the field definitions in [`types.ts`](types.ts), and relevant tests current in the same change whenever you change a Firestore path, field, query/index, trigger, or persistence behavior. Use code and concise comments for schema documentation; do not create a separate schema Markdown file.

For each path, document its purpose, readers/writers, relationships, transaction boundaries, and optional/default behavior. For derived documents and caches, identify the source of truth, refresh/invalidation rules, and recovery path. Keep in-memory TTLs and migration instructions beside the code that owns them. Index definitions belong in `firestore.indexes.json`.

Why: fields are copied into target snapshots, the admin index, the leaderboard, and cached responses. Changing only the primary document can leave these copies stale. Keeping the typed schema and cache comments current makes these dependencies visible and helps preserve chain relationships, cache invalidation, and event processing guarantees.

## Review artifacts

Put screenshots and temporary review artifacts in `/tmp`, not in the repository.
