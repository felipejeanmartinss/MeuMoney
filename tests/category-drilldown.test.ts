import { describe, expect, it } from "vitest";
import { categoryAndDescendantIds } from "../src/domain/categories";

describe("transaction category filter", () => {
  it("includes a consolidated category and all of its subcategories", () => {
    expect(categoryAndDescendantIds("housing", [
      { id: "housing", parent_id: null },
      { id: "rent", parent_id: "housing" },
      { id: "utilities", parent_id: "housing" },
      { id: "electricity", parent_id: "utilities" },
      { id: "salary", parent_id: null },
    ])).toEqual(["housing", "rent", "utilities", "electricity"]);
  });
});
