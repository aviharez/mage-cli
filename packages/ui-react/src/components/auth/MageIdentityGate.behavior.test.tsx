import { describe, expect, mock, test } from 'bun:test';

type HookRecord = { values: unknown[]; deps: Array<unknown[] | undefined> };
type Component = (props: Record<string, unknown>) => unknown;
type Element = { type: unknown; props: Record<string, unknown> };

const records = new Map<unknown, HookRecord>();
let current: HookRecord | null = null;
let index = 0;
let effects: Array<() => void> = [];

const render = (component: Component, props: Record<string, unknown>): unknown => {
  const previous = current;
  const previousIndex = index;
  current = records.get(component) ?? { values: [], deps: [] };
  records.set(component, current);
  index = 0;
  try {
    return component(props);
  } finally {
    current = previous;
    index = previousIndex;
  }
};

const hooks = () => {
  if (!current) throw new Error('Hook used outside render');
  return current;
};

const sameDeps = (left: unknown[] | undefined, right: unknown[] | undefined) => Boolean(
  left && right && left.length === right.length && left.every((value, position) => Object.is(value, right[position])),
);

const useState = <T,>(initial: T | (() => T)) => {
  const state = hooks();
  const position = index++;
  if (state.values[position] === undefined) state.values[position] = typeof initial === 'function' ? (initial as () => T)() : initial;
  return [state.values[position] as T, (next: T) => { state.values[position] = next; }] as const;
};

const useRef = <T,>(initial: T) => {
  const state = hooks();
  const position = index++;
  if (state.values[position] === undefined) state.values[position] = { current: initial };
  return state.values[position] as { current: T };
};

const useCallback = <T,>(callback: T, deps: unknown[]) => {
  const state = hooks();
  const position = index++;
  if (!sameDeps(state.deps[position], deps)) {
    state.deps[position] = deps;
    state.values[position] = callback;
  }
  return state.values[position] as T;
};

const useEffect = (effect: () => void, deps: unknown[]) => {
  const state = hooks();
  const position = index++;
  if (sameDeps(state.deps[position], deps)) return;
  state.deps[position] = deps;
  effects.push(effect);
};

const jsx = (type: unknown, props: Record<string, unknown> = {}): unknown => {
  if (type === Fragment) return props.children ?? null;
  if (typeof type === 'function') return render(type as Component, props);
  return { type, props } satisfies Element;
};

const ReactMock = { useCallback, useEffect, useRef, useState };
const Fragment = Symbol('Fragment');
mock.module('react', () => ({ __esModule: true, default: ReactMock, ...ReactMock }));
mock.module('react/jsx-runtime', () => ({ Fragment, jsx, jsxs: jsx, jsxDEV: jsx }));
mock.module('react/jsx-dev-runtime', () => ({ Fragment, jsx, jsxs: jsx, jsxDEV: jsx }));
mock.module('@/components/ui/button', () => ({ Button: (props: Record<string, unknown>) => jsx('button', props) }));
mock.module('@/components/ui/MageLogo', () => ({ MageLogo: () => null }));
mock.module('@/lib/runtime-switch', () => ({ subscribeRuntimeEndpointChanged: () => () => {} }));

let statusCalls = 0;
let oauthCalls = 0;
mock.module('@/lib/desktop', () => ({
  canUseElectronDesktopIPC: () => true,
  getDesktopMageAuthStatus: async () => {
    statusCalls += 1;
    return null;
  },
  hasElectronCapability: () => true,
  isDesktopLocalOriginActive: () => true,
  startDesktopMageOAuth: async () => {
    oauthCalls += 1;
    return { authenticated: true, displayName: 'Mage User', udomain: 'u012345' };
  },
}));

const { MageIdentityGate } = await import('./MageIdentityGate');

const flush = async () => {
  while (effects.length) {
    const pending = effects;
    effects = [];
    pending.forEach((effect) => effect());
    await Promise.resolve();
  }
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
};

const findButton = (tree: unknown): Element => {
  if (Array.isArray(tree)) {
    for (const child of tree) {
      try {
        return findButton(child);
      } catch {}
    }
    throw new Error('Button not found');
  }
  if (!tree || typeof tree !== 'object') throw new Error('Button not found');
  const element = tree as Element;
  if (element.type === 'button') return element;
  const children = element.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    try {
      return findButton(child);
    } catch {}
  }
  throw new Error('Button not found');
};

describe('MageIdentityGate retry behavior', () => {
  test('retry from the error screen starts OAuth directly', async () => {
    records.clear();
    effects = [];
    statusCalls = 0;
    oauthCalls = 0;

    render(MageIdentityGate, { children: 'app' });
    await flush();
    const errorTree = render(MageIdentityGate, { children: 'app' });
    await (findButton(errorTree).props.onClick as () => Promise<void>)();
    await flush();

    expect(statusCalls).toBe(1);
    expect(oauthCalls).toBe(1);
    expect(render(MageIdentityGate, { children: 'app' })).toBe('app');
  });
});
