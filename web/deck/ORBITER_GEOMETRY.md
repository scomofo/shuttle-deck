# Orbiter proportion pass

This pass anchors the exterior span/length ratio to NASA's three-view drawing.
It is a visual refinement, not an outer-mold-line reconstruction or a change to
flight dynamics, collision geometry or cockpit camera calibration.

## Reference and implementation

| Reference | Observation | Applied here |
| --- | --- | --- |
| [NASA Space Shuttle News Reference, p. 3-6](https://www.nasa.gov/history/SP-4225/diagrams/shuttle/shuttle-diagram-4.htm) ([drawing](https://www.nasa.gov/wp-content/uploads/static/history/SP-4225/imagery/diagrams/shuttle/3-6_m.jpg)) | Overall length 37.24 m; span 23.79 m | Target span/length approximately 0.639. Existing model length 26.08 units is retained; airframe transverse scale brings its approximately 21.98-unit span to 16.66 units. Bevels and edge tubes add small silhouette differences. |
| Same three-view | Rounded forward body; broad aft OMS shoulders | Revised forebody sections and tapered OMS fairings replace the old pointed profile and ellipsoid pods. Contours and pod dimensions are estimated from the drawing, not measured station data. |
| [NASA News Reference, p. 3-7](https://www.nasa.gov/history/SP-4225/diagrams/shuttle/shuttle-diagram-5.htm) ([drawing](https://www.nasa.gov/wp-content/uploads/static/history/SP-4225/imagery/diagrams/shuttle/3-7_m.jpg)) | Structural window belt wraps around the forward flight deck | Six mirrored trapezoidal outlines, sampled onto the surface to prevent skin intersections. The actual panes are flat; this mesh approximation conforms them to the estimated skin. |

NASA's images are linked as references; the comparison screenshots are renders
of this project's own estimated meshes. No new generated texture was used.
The approved black tile image is unchanged.

## Boundaries

The common airframe transform carries fuselage, wings, pods, bay hinges,
landing-gear locations and nozzle positions together. Engine bells and wheel
assemblies compensate for transverse scaling so they retain round sections.
ET/SRB geometry and separation paths retain their existing dimensions.
Longitudinal profiles, wing sweep, fin height, payload-bay length and stack
proportions still need fuller source calibration. Overhead/aft windows, RCS
ports and mission-specific markings are outside this slice.

## Review

[Before/after views](review/geometry-comparison.jpg) use the same orthographic
cameras and lighting: front quarter, side, top and rear. Left is commit
4016568; right is this refinement. [Deployed views](review/geometry-deployed.jpg)
show the bay doors and landing gear. These controlled visual states do not
establish flight-model fidelity.

Browser checks exercise door opening, gear visibility, attached launch hardware
and hidden hardware after separation. The strict TypeScript/production build
and existing exhaust-state tests are also run for this pass.
