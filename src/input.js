// input.js — Tastatur und Touch in einem Zustandsobjekt. Ohne DOM konstruierbar.
const KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
  ArrowDown: 'down', KeyS: 'down',
  KeyE: 'action', KeyJ: 'action', ShiftLeft: 'action',
};

export function createInput(target) {
  const state = {
    left: false, right: false, jump: false, down: false, action: false,
    stick: { x: 0, y: 0 },
  };

  const input = {
    state,
    /** -1..1 Horizontalachse */
    axis() {
      const k = (state.right ? 1 : 0) - (state.left ? 1 : 0);
      if (k !== 0) return k;
      return Math.abs(state.stick.x) > 0.18 ? state.stick.x : 0;
    },
    down() { return state.down || state.stick.y > 0.55; },
    jump() { return state.jump; },
    action() { return state.action; },
    setStick(x, y) { state.stick.x = Math.max(-1, Math.min(1, x)); state.stick.y = Math.max(-1, Math.min(1, y)); },
    resetStick() { state.stick.x = 0; state.stick.y = 0; },
    /** Nur für Tests / programmatische Steuerung */
    setKey(name, on) { if (name in state && typeof state[name] === 'boolean') state[name] = on; },
    clear() { for (const k of ['left', 'right', 'jump', 'down', 'action']) state[k] = false; input.resetStick(); },
  };

  if (target && target.addEventListener) {
    target.addEventListener('keydown', (e) => {
      const name = KEYS[e.code];
      if (name) { state[name] = true; e.preventDefault(); }
    });
    // Ein Druck, der kürzer ist als ein Frame (schnelles Tippen), darf nicht
    // verloren gehen: Sprung und Aktion werden erst einen Frame später gelöst.
    const release = (name) => {
      if ((name === 'jump' || name === 'action') && typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => { state[name] = false; });
      } else {
        state[name] = false;
      }
    };
    target.addEventListener('keyup', (e) => {
      const name = KEYS[e.code];
      if (name) { release(name); e.preventDefault(); }
    });
    target.addEventListener('blur', () => input.clear());
  }
  return input;
}
