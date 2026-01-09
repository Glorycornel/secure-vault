import { generatePassword } from "@/lib/utils/passwordGenerator";

describe("generatePassword", () => {
  it("generates requested length", () => {
    const pw = generatePassword({
      length: 24,
      lower: true,
      upper: true,
      numbers: true,
      symbols: true,
    });
    expect(pw).toHaveLength(24);
  });

  it("throws when no charset selected", () => {
    expect(() =>
      generatePassword({
        length: 12,
        lower: false,
        upper: false,
        numbers: false,
        symbols: false,
      })
    ).toThrow();
  });

  it("includes at least one from each selected pool", () => {
    const pw = generatePassword({
      length: 20,
      lower: true,
      upper: true,
      numbers: true,
      symbols: false,
    });
    expect(/[a-z]/.test(pw)).toBe(true);
    expect(/[A-Z]/.test(pw)).toBe(true);
    expect(/[0-9]/.test(pw)).toBe(true);
  });
});
