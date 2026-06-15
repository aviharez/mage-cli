import { Injectable, inject, signal, computed } from '@angular/core'
import { catchError, EMPTY } from 'rxjs'

import type { Product } from '../models/product.model'
import { ProductService } from '../services/product.service'

export type LoadingState = 'idle' | 'loading' | 'loaded' | 'error'

@Injectable({ providedIn: 'root' })
export class ProductStore {
  readonly #service = inject(ProductService)

  // ── Private writable signals ────────────────────────────────────────────────
  readonly #items    = signal<Product[]>([])
  readonly #selected = signal<Product | null>(null)
  readonly #status   = signal<LoadingState>('idle')
  readonly #error    = signal<string | null>(null)

  // ── Public read-only signals ─────────────────────────────────────────────────
  readonly items    = this.#items.asReadonly()
  readonly selected = this.#selected.asReadonly()
  readonly status   = this.#status.asReadonly()
  readonly error    = this.#error.asReadonly()

  readonly isLoading  = computed(() => this.#status() === 'loading')
  readonly isEmpty    = computed(() => this.#status() === 'loaded' && this.#items().length === 0)
  readonly totalCount = computed(() => this.#items().length)

  // ── Actions ──────────────────────────────────────────────────────────────────

  loadAll(): void {
    if (this.#status() === 'loading') return
    this.#status.set('loading')
    this.#error.set(null)

    this.#service.getAll()
      .pipe(
        catchError((err) => {
          this.#status.set('error')
          this.#error.set(err?.message ?? 'Failed to load products')
          return EMPTY
        }),
      )
      .subscribe((items) => {
        this.#items.set(items)
        this.#status.set('loaded')
      })
  }

  select(product: Product | null): void {
    this.#selected.set(product)
  }

  add(product: Product): void {
    this.#items.update((current) => [...current, product])
  }

  update(id: string, changes: Partial<Product>): void {
    this.#items.update((current) =>
      current.map((p) => (p.id === id ? { ...p, ...changes } : p)),
    )
  }

  remove(id: string): void {
    this.#items.update((current) => current.filter((p) => p.id !== id))
    if (this.#selected()?.id === id) this.#selected.set(null)
  }

  reset(): void {
    this.#items.set([])
    this.#selected.set(null)
    this.#status.set('idle')
    this.#error.set(null)
  }
}
