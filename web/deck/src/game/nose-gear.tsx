import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { sim } from "@/sim/runtime";
import { useSurfaceMaterial } from "./materials";
import { createNoseGear } from "./nose-gear-model";

export function NoseGear() {
  const tile = useSurfaceMaterial("tile");
  const assembly = useMemo(() => createNoseGear(tile), [tile.map, tile.bumpMap]);
  useEffect(() => () => assembly.dispose(), [assembly]);
  useFrame(() => assembly.update(sim.gearPosition));
  return <primitive object={assembly.root} />;
}
