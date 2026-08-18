import { expect, test } from "bun:test"
import { homeDisplayName } from "../src/routes/home"

test("homeDisplayName uses the stored display name when credentials are available", () => {
  // Given
  const credential = { display_name: "  Syifa Nurzain  " }

  // When
  const result = homeDisplayName(credential)

  // Then
  expect(result).toBe("Syifa Nurzain")
})

test("homeDisplayName keeps the entry screen useful before credentials load", () => {
  // Given
  const credential = undefined

  // When
  const result = homeDisplayName(credential)

  // Then
  expect(result).toBe("builder")
})
