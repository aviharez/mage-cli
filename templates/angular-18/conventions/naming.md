# Naming Conventions — Angular 18

## Files

| Artifact         | Pattern                             | Example                          |
|------------------|-------------------------------------|----------------------------------|
| Component        | `<name>.component.ts`               | `product-list.component.ts`      |
| Template         | `<name>.component.html`             | `product-list.component.html`    |
| Styles           | `<name>.component.scss`             | `product-list.component.scss`    |
| Service          | `<name>.service.ts`                 | `product.service.ts`             |
| Signal store     | `<name>.store.ts`                   | `product.store.ts`               |
| Routes           | `<name>.routes.ts`                  | `product.routes.ts`              |
| Guard            | `<name>.guard.ts`                   | `auth.guard.ts`                  |
| Pipe             | `<name>.pipe.ts`                    | `currency-format.pipe.ts`        |
| Directive        | `<name>.directive.ts`               | `auto-focus.directive.ts`        |
| Interceptor      | `<name>.interceptor.ts`             | `auth.interceptor.ts`            |
| Model/interface  | `<name>.model.ts`                   | `product.model.ts`               |
| Spec             | `<name>.spec.ts`                    | `product-list.component.spec.ts` |

## TypeScript Identifiers

| Artifact         | Convention         | Example                          |
|------------------|--------------------|----------------------------------|
| Component class  | PascalCase + suffix | `ProductListComponent`           |
| Service class    | PascalCase + suffix | `ProductService`                 |
| Store class      | PascalCase + suffix | `ProductStore`                   |
| Interface/type   | PascalCase, no `I` prefix | `Product`, `ApiResponse<T>` |
| Enum             | PascalCase         | `OrderStatus`                    |
| Signal field     | camelCase, no suffix | `products`, `isLoading`        |
| Computed signal  | camelCase, descriptive | `totalCount`, `hasError`     |
| Private field    | `#` private syntax | `#http = inject(HttpClient)`     |
| Constants        | SCREAMING_SNAKE    | `API_BASE_URL`                   |

## Folder Names

- Always **kebab-case**: `product-list/`, `user-profile/`, `shared-ui/`.

## Selector Prefix

- All component selectors use the app prefix: `app-<name>`.
- Example: `selector: 'app-product-list'`.
- Shared library components may use a different agreed prefix (e.g. `ui-`).
