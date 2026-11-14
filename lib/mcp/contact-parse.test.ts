import { describe, it, expect } from "vitest";
import { parseOrgs, parseManagement, parsePeople, parseArtistList, agentRoleFor, managerRoleFor } from "./contact-parse";

const names = (ps: { name: string }[]) => ps.map((p) => p.name);

describe("parseOrgs (booking_agent)", () => {
  it("parses 'Agency - A, B'", () => {
    const [o] = parseOrgs("CAA - David Ball, Paul Wilson");
    expect(o.name).toBe("CAA");
    expect(o.territory).toBeNull();
    expect(names(o.people)).toEqual(["David Ball", "Paul Wilson"]);
  });

  it("parses territory parenthetical and colon", () => {
    const [o] = parseOrgs("High Road Touring (North America): Matt Hickey, Sam Gans");
    expect(o.name).toBe("High Road Touring");
    expect(o.territory).toBe("North America");
    expect(names(o.people)).toEqual(["Matt Hickey", "Sam Gans"]);
  });

  it("splits multiple agencies on ' / ' and keeps hyphenated names", () => {
    const orgs = parseOrgs("High Road Touring - Matt Hickey / THE TEAM - Michael Harvey-Bray");
    expect(orgs.map((o) => o.name)).toEqual(["High Road Touring", "THE TEAM"]);
    expect(names(orgs[1].people)).toEqual(["Michael Harvey-Bray"]);
  });

  it("does not split 'UK/EU' inside or outside parentheses", () => {
    const orgs = parseOrgs("Wasserman (UK/EU): Jane Doe");
    expect(orgs).toHaveLength(1);
    expect(orgs[0].territory).toBe("UK/EU");
    expect(parseOrgs("ITB UK/EU - Jane Doe")).toHaveLength(1);
  });

  it("splits on newlines and semicolons", () => {
    const orgs = parseOrgs("CAA - David Ball\nWME (UK/EU) - Jane Doe; Paradigm");
    expect(orgs.map((o) => o.name)).toEqual(["CAA", "WME", "Paradigm"]);
    expect(orgs[2].people).toEqual([]);
  });

  it("handles en dash, '&' and 'and'", () => {
    const [o] = parseOrgs("Wasserman – Ali Hedrick & Sam Kirby and Joe Smith");
    expect(o.name).toBe("Wasserman");
    expect(names(o.people)).toEqual(["Ali Hedrick", "Sam Kirby", "Joe Smith"]);
  });

  it("keeps a hyphenated agency name whole", () => {
    expect(parseOrgs("Ground-Control Touring - Jane Doe")[0].name).toBe("Ground-Control Touring");
  });

  it("merges repeated agencies", () => {
    const orgs = parseOrgs("CAA - David Ball / CAA - Paul Wilson, David Ball");
    expect(orgs).toHaveLength(1);
    expect(names(orgs[0].people)).toEqual(["David Ball", "Paul Wilson"]);
  });

  it("returns nothing for blank input", () => {
    expect(parseOrgs("")).toEqual([]);
    expect(parseOrgs("  ")).toEqual([]);
    expect(parseOrgs(undefined)).toEqual([]);
  });
});

describe("parseManagement", () => {
  it("attaches manager_names to the company", () => {
    const [o] = parseManagement("Q Prime", "Charlie Williams, Dan Potts");
    expect(o.name).toBe("Q Prime");
    expect(names(o.people)).toEqual(["Charlie Williams", "Dan Potts"]);
  });

  it("parses a single manager name", () => {
    expect(names(parseManagement("Q Prime", "Charlie Williams")[0].people)).toEqual(["Charlie Williams"]);
  });

  it("keeps a role note on a manager", () => {
    const [p] = parseManagement("Q Prime", "Dan Potts (Day-to-Day)")[0].people;
    expect(p).toEqual({ name: "Dan Potts", note: "Day-to-Day" });
    expect(managerRoleFor(p.note)).toBe("Day-to-Day");
  });

  it("merges inline and separate manager names without duplicates", () => {
    const [o] = parseManagement("Q Prime - Charlie Williams", "Charlie Williams, Dan Potts");
    expect(names(o.people)).toEqual(["Charlie Williams", "Dan Potts"]);
  });

  it("returns a nameless org for managers without a company", () => {
    const orgs = parseManagement("", "Charlie Williams");
    expect(orgs).toEqual([{ name: "", territory: null, people: [{ name: "Charlie Williams", note: null }] }]);
  });
});

describe("parsePeople / parseArtistList", () => {
  it("strips stray separators", () => {
    expect(names(parsePeople(", Charlie Williams ,, Dan Potts,"))).toEqual(["Charlie Williams", "Dan Potts"]);
  });

  it("splits artist lists and excludes the evaluated artist", () => {
    expect(parseArtistList("Wet Leg, Fontaines D.C.\nIdles; wet leg", "Idles")).toEqual(["Wet Leg", "Fontaines D.C."]);
  });
});

describe("agentRoleFor", () => {
  it("maps territories to wizard roles", () => {
    expect(agentRoleFor("North America", null)).toBe("US Booking");
    expect(agentRoleFor("UK/EU", null)).toBe("UK/EU Booking");
    expect(agentRoleFor("Worldwide", null)).toBe("Global");
    expect(agentRoleFor(null, null)).toBe("Primary");
  });
});
