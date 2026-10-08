import type { ElementKind, ElementRole } from "@structsmith/contracts";
import {
  Box,
  Boxes,
  CircleCheck,
  Cloud,
  Cog,
  Component,
  Database,
  Diamond,
  Globe,
  HardDrive,
  KeyRound,
  Layers,
  type LucideIcon,
  Network,
  Play,
  Server,
  Shapes,
  Smartphone,
  User,
  Workflow,
  Zap,
} from "lucide-react";

/** Lucide only — no vendor icon packs in the MVP (spec §51). */
const ROLE_ICONS: Partial<Record<ElementRole, LucideIcon>> = {
  frontend: Globe,
  backend: Server,
  service: Server,
  apiGateway: Network,
  database: Database,
  queue: Workflow,
  eventBus: Workflow,
  objectStorage: HardDrive,
  cache: Zap,
  identityProvider: KeyRound,
  externalApi: Cloud,
  mobileApp: Smartphone,
  webApp: Globe,
  worker: Cog,
  serverlessFunction: Zap,
  aiService: Shapes,
  custom: Shapes,
};

const KIND_ICONS: Record<ElementKind, LucideIcon> = {
  person: User,
  softwareSystem: Box,
  container: Boxes,
  component: Component,
  deploymentNode: Layers,
  infrastructureNode: Server,
  workflowGroup: Workflow,
  action: Play,
  decision: Diamond,
  outcome: CircleCheck,
  custom: Shapes,
};

export function iconFor(kind: ElementKind, role: ElementRole | null): LucideIcon {
  if (["workflowGroup", "action", "decision", "outcome"].includes(kind)) return KIND_ICONS[kind];
  return (role ? ROLE_ICONS[role] : undefined) ?? KIND_ICONS[kind];
}

export { KIND_ICONS, ROLE_ICONS };
