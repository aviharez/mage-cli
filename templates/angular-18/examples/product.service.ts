import { Injectable, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

import type { Product, CreateProductDto, UpdateProductDto } from '../models/product.model'

interface ApiResponse<T> {
  data: T
  message: string
  success: boolean
}

const API_BASE = '/api/v1'

@Injectable({ providedIn: 'root' })
export class ProductService {
  readonly #http = inject(HttpClient)

  getAll(): Observable<Product[]> {
    return this.#http
      .get<ApiResponse<Product[]>>(`${API_BASE}/products`)
      .pipe(map((res) => res.data))
  }

  getById(id: string): Observable<Product> {
    return this.#http
      .get<ApiResponse<Product>>(`${API_BASE}/products/${id}`)
      .pipe(map((res) => res.data))
  }

  create(payload: CreateProductDto): Observable<Product> {
    return this.#http
      .post<ApiResponse<Product>>(`${API_BASE}/products`, payload)
      .pipe(map((res) => res.data))
  }

  update(id: string, payload: UpdateProductDto): Observable<Product> {
    return this.#http
      .put<ApiResponse<Product>>(`${API_BASE}/products/${id}`, payload)
      .pipe(map((res) => res.data))
  }

  delete(id: string): Observable<void> {
    return this.#http.delete<void>(`${API_BASE}/products/${id}`)
  }
}
