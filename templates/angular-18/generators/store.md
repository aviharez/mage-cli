# Generator: Store

Generate a signal-based store for feature state management. No NgRx — pure Angular signals.

## Required structure

```ts
import { Injectable, inject, signal, computed } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { catchError, EMPTY } from 'rxjs'

import type { <Model> } from '../models/<model>.model'
import { <Name>Service } from '../services/<name>.service'

export type LoadingState = 'idle' | 'loading' | 'loaded' | 'error'

@Injectable({ providedIn: 'root' })   // or remove providedIn and add to route providers for scoped state
export class <Name>Store {
  readonly #service = inject(<Name>Service)

  // ── Private writable signals ────────────────────────────────────────────────
  readonly #items    = signal<<Model>[]>([])
  readonly #selected = signal<<Model> | null>(null)
  readonly #status   = signal<LoadingState>('idle')
  readonly #error    = signal<string | null>(null)

  // ── Public read-only signals (computed) ─────────────────────────────────────
  readonly items    = this.#items.asReadonly()
  readonly selected = this.#selected.asReadonly()
  readonly status   = this.#status.asReadonly()
  readonly error    = this.#error.asReadonly()

  readonly isLoading = computed(() => this.#status() === 'loading')
  readonly isEmpty   = computed(() => this.#status() === 'loaded' && this.#items().length === 0)
  readonly totalCount = computed(() => this.#items().length)

  // ── Actions ─────────────────────────────────────────────────────────────────

  loadAll(): void {
    if (this.#status() === 'loading') return
    this.#status.set('loading')
    this.#error.set(null)

    this.#service.getAll()
      .pipe(catchError((err) => {
        this.#status.set('error')
        this.#error.set(err?.message ?? 'Failed to load')
        return EMPTY
      }))
      .subscribe((items) => {
        this.#items.set(items)
        this.#status.set('loaded')
      })
  }

  select(item: <Model> | null): void {
    this.#selected.set(item)
  }

  add(item: <Model>): void {
    this.#items.update((current) => [...current, item])
  }

  update(id: string, changes: Partial<<Model>>): void {
    this.#items.update((current) =>
      current.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    )
  }

  remove(id: string): void {
    this.#items.update((current) => current.filter((item) => item.id !== id))
    if (this.#selected()?.id === id) this.#selected.set(null)
  }

  reset(): void {
    this.#items.set([])
    this.#selected.set(null)
    this.#status.set('idle')
    this.#error.set(null)
  }
}
```

## Rules

- Never expose `signal()` directly — always `.asReadonly()` or wrap in `computed()`.
- All mutations go through action methods — no external `.set()` calls.
- Use `computed()` for all derived values — never duplicate state.
- If the store is feature-scoped (not global), remove `providedIn: 'root'` and add it to the route's `providers` array.
- Place the file at `src/app/features/<feature>/store/<name>.store.ts`.
