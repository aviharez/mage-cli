import { createContext, Show, useContext, type ParentProps } from "solid-js"

export function createSimpleContext<T, Props extends Record<string, any>>(input: {
  name: string
  // When false, children mount immediately with the context value even while
  // `init.ready === false`. Default (undefined) keeps the historic behavior of
  // suspending children until ready.
  suspendUntilReady?: boolean
  init: ((input: Props) => T) | (() => T)
}) {
  const ctx = createContext<T>()

  return {
    context: ctx,
    provider: (props: ParentProps<Props>) => {
      const init = input.init(props)
      return (
        // @ts-expect-error
        <Show when={input.suspendUntilReady === false || init.ready === undefined || init.ready === true}>
          <ctx.Provider value={init}>{props.children}</ctx.Provider>
        </Show>
      )
    },
    use() {
      const value = useContext(ctx)
      if (!value) throw new Error(`${input.name} context must be used within a context provider`)
      return value
    },
  }
}
