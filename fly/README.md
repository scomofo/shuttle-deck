# Browser flight sketch

This is not the trainer. The bus, clock, and procedure runner do not import it.

It is the chase-view sketch: a block orbiter, four auto-flown starts, and a runway. The files still use the app-shell aliases (`@/sim`, `@/game`) from that sketch.

What this pass fixes:

- The body basis was a mirror, so the mesh sat 90° off the velocity vector and looked like it was landing across the runway. The basis is right-handed now. Nose follows the track.
- The title card no longer sells a flown mission or a flight deck. The card itself is unchanged: stack against the Earth.
- The approach uses that same picture. Delta wing, painted coast, haze, and a concrete runway with the centerline along the landing direction.
