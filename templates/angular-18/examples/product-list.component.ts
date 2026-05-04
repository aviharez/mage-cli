import { ChangeDetectionStrategy, Component, inject, input, output, computed } from '@angular/core'
import { CurrencyPipe, DatePipe } from '@angular/common'

import { ProductStore } from '../store/product.store'
import type { Product } from '../models/product.model'

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './product-list.component.html',
  styleUrl: './product-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductListComponent {
  readonly #store = inject(ProductStore)

  // Inputs
  readonly title = input<string>('Products')
  readonly showActions = input<boolean>(true)

  // Outputs
  readonly productSelected = output<Product>()

  // Expose store signals directly to the template
  readonly products = this.#store.items
  readonly isLoading = this.#store.isLoading
  readonly isEmpty = this.#store.isEmpty
  readonly error = this.#store.error

  readonly subtitle = computed(() =>
    this.#store.totalCount() > 0
      ? `${this.#store.totalCount()} item(s)`
      : 'No items yet',
  )

  ngOnInit(): void {
    this.#store.loadAll()
  }

  select(product: Product): void {
    this.#store.select(product)
    this.productSelected.emit(product)
  }

  delete(id: string): void {
    this.#store.remove(id)
  }
}
