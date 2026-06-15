# Generator: Component

Generate a standalone Angular 18 component. Follow these rules exactly.

## Required structure

```ts
import { ChangeDetectionStrategy, Component, inject, signal, computed } from '@angular/core'
import { CommonModule } from '@angular/common'          // only if needed for pipes like date, currency
// feature-specific imports below

@Component({
  selector: 'app-<kebab-name>',
  standalone: true,
  imports: [/* only what the template uses */],
  templateUrl: './<kebab-name>.component.html',
  styleUrl: './<kebab-name>.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class <PascalName>Component {
  // 1. Injected dependencies (inject() only — no constructor)
  readonly #<service> = inject(<Service>)

  // 2. Inputs (use signal-based input() API)
  readonly <inputName> = input<Type>()                  // optional input
  readonly <requiredInput> = input.required<Type>()     // required input

  // 3. Outputs (use signal-based output() API)
  readonly <eventName> = output<Type>()

  // 4. Local state signals
  readonly <field> = signal<Type>(initialValue)

  // 5. Computed signals (derived state, no side effects)
  readonly <derived> = computed(() => /* ... */)
}
```

## Template rules

- Use `@if` / `@else` — never `*ngIf`.
- Use `@for (item of items(); track item.id)` — never `*ngFor`. Always include `track`.
- Use `@switch` — never `*ngSwitch`.
- Bind to signals by calling them: `{{ items() }}`, `[disabled]="isLoading()"`.
- For outputs: `(click)="<eventName>.emit(value)"`.

## File output

Produce three files:
1. `<kebab-name>.component.ts` — component class
2. `<kebab-name>.component.html` — template
3. `<kebab-name>.component.scss` — styles (can be empty if none needed)

Place them in `src/app/features/<feature>/components/<kebab-name>/` (or `src/app/shared/components/<kebab-name>/` for shared components).
