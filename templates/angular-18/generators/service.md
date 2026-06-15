# Generator: Service

Generate an Angular 18 service for HTTP communication. Follow these rules exactly.

## Required structure

```ts
import { Injectable, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { Observable } from 'rxjs'
import { catchError, map } from 'rxjs/operators'

// Import your model interfaces
import type { <Model>, <ApiResponse> } from '../models/<model>.model'

const API_BASE = '/api/v1'   // adjust to match the feature's base path

@Injectable({ providedIn: 'root' })
export class <Name>Service {
  readonly #http = inject(HttpClient)

  getAll(): Observable<<Model>[]> {
    return this.#http
      .get<ApiResponse<<Model>[]>>(`${API_BASE}/<resource>`)
      .pipe(map((res) => res.data))
  }

  getById(id: string): Observable<<Model>> {
    return this.#http
      .get<ApiResponse<<Model>>>(`${API_BASE}/<resource>/${id}`)
      .pipe(map((res) => res.data))
  }

  create(payload: Create<Model>Dto): Observable<<Model>> {
    return this.#http
      .post<ApiResponse<<Model>>>(`${API_BASE}/<resource>`, payload)
      .pipe(map((res) => res.data))
  }

  update(id: string, payload: Update<Model>Dto): Observable<<Model>> {
    return this.#http
      .put<ApiResponse<<Model>>>(`${API_BASE}/<resource>/${id}`, payload)
      .pipe(map((res) => res.data))
  }

  delete(id: string): Observable<void> {
    return this.#http.delete<void>(`${API_BASE}/<resource>/${id}`)
  }
}
```

## Rules

- Always type HTTP responses with a generic wrapper (e.g. `ApiResponse<T>`).
- Use `map()` to unwrap the response envelope — never expose the raw response to callers.
- Do not add `catchError` at the service level unless you have a specific recovery strategy. Let errors propagate to the store or component that called the service.
- Use private `#http` — never expose the HttpClient.
- All methods return `Observable<T>`, never `Promise<T>` (unless wrapping a third-party lib).
- Place the file at `src/app/features/<feature>/services/<name>.service.ts` (or `core/services/` for global services).
- Also create a `<name>.model.ts` interface file alongside the service if one doesn't exist.
