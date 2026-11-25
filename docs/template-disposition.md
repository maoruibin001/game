# Template disposition

山野来信 uses the official ForgeaX Engine SDK 0.5.0 game-3d authoring template.

- Keep the official asset/Pack pipeline, Engine/Frontend realm boundary, environment capabilities and lifecycle disposal examples.
- Replace the showcase world with the authored 800m voxel valley and its four reachable landmarks.
- Replace the starter player/camera systems with the travel controller, postcard photography, contextual interactions and zipline.
- Replace the guide/vase UI with the travel journal, title/menu, postcard finder, gallery, map and ending.
- Keep reusable material/geometry/character assets only if referenced by the final game; the runtime vase is not part of the game.
- Keep Engine 0.5.0 pinned. Platform capability integration uses the normal Zaohua SDK installer and non-Pack runtime init.

Implementation and acceptance must prove the complete design in ../GAME-DESIGN.md; template tests and template rendering do not prove game completion.
