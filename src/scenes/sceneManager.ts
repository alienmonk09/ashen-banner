import type { Renderer } from "../engine/renderer";
import type { Input } from "../engine/input";
import type { Animator } from "../engine/animator";
import type { GameState } from "../core/state";

export interface Scene {
  update(dt: number): void;
  dispose(): void;
  /** Optional: react to a viewport resize (e.g. re-anchor floating UI). */
  onResize?(): void;
}

/** Navigation callbacks wired up in main.ts to avoid circular scene imports. */
export interface Navigation {
  toTitle(): void;
  toBattle(phaseIndex: number): void;
  toParty(): void;
  toVictory(): void;
}

export interface GameContext {
  renderer: Renderer;
  input: Input;
  animator: Animator;
  uiParent: HTMLElement;
  state: GameState;
  nav: Navigation;
}

export class SceneManager {
  private current: Scene | null = null;

  change(scene: Scene): void {
    this.current?.dispose();
    this.current = scene;
  }

  update(dt: number): void {
    this.current?.update(dt);
  }

  resize(): void {
    this.current?.onResize?.();
  }
}
